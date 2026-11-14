// @ts-nocheck - cloudflare:workers is a runtime module provided by the Workers platform
import { DurableObject } from 'cloudflare:workers'
import type { Board, DiceValue, RoomStage } from '@tahoelink/shared'
import { getDefaultBoard } from '@tahoelink/shared'

/**
 * Internal state persisted via DO storage.
 */
export interface RoomDOState {
  version: number
  board: Board
  /** 4 seats indexed 0–3, each holding a session ID or null for empty. */
  seats: (string | null)[]
  activePlayerId: number | null
  turn: number
  roll: DiceValue
  stage: RoomStage
  scores: Record<number, number>
  piecesRemaining: Record<string, Record<string, number>>
  winner: number | null
  createdAt: number
  updatedAt: number
}

const STATE_KEY = 'room:v2'

function defaultState(): RoomDOState {
  return {
    version: 2,
    board: getDefaultBoard(),
    seats: [null, null, null, null],
    activePlayerId: null,
    turn: 0,
    roll: 'I' as DiceValue,
    stage: 'waiting-for-players',
    scores: {},
    piecesRemaining: {},
    winner: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * WebSocket message envelope broadcast to clients.
 */
export interface WSOutgoingMessage {
  event: string
  data: unknown
}

/**
 * Durable Object representing a single game room.
 *
 * Owns the authoritative room state, seat management, and real-time
 * broadcasting via WebSocket (Hibernation API).
 */
export class RoomDurableObject extends DurableObject {
  /** Cached in-memory state. Written to DO storage on every mutation. */
  private _state: RoomDOState | null = null

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
  }

  // ---------------------------------------------------------------------------
  // fetch — HTTP endpoints called by Hono routes
  // ---------------------------------------------------------------------------
  override async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request)
    }

    await this.ensureLoaded()

    const url = new URL(request.url)
    const method = request.method

    try {
      if (method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        return this.handleGetRoom(request)
      }
      if (method === 'POST') {
        if (url.pathname === '/join') return this.handleJoin(request)
        if (url.pathname === '/leave') return this.handleLeave(request)
        if (url.pathname === '/init') return this.handleInit()
        if (url.pathname === '/start') return this.handleStart(request)
        if (url.pathname === '/turn') return this.handleTurn(request)
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      console.error('DO fetch error:', err)
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket handlers (Hibernation API)
  // ---------------------------------------------------------------------------
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Incoming messages from clients (will handle in M3-5 full turn handling)
    console.log('WebSocket message received (unhandled):', message)
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    // Retrieve the session ID we stored during upgrade
    const tags = ws.deserializeAttachment() as { sessionId: string } | null
    console.log(
      `WebSocket closed: session=${tags?.sessionId ?? 'unknown'}, code=${code}, reason=${reason}`,
    )
    // TODO: M3-6 — handle player leave mid-game via WebSocket close
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Load state from DO storage, or initialise with defaults. */
  private async ensureLoaded(): Promise<void> {
    if (this._state) return
    const stored = await this.ctx.storage.get<RoomDOState>(STATE_KEY)
    if (stored) {
      this._state = stored
    } else {
      this._state = defaultState()
      await this.persist()
    }
  }

  /** Persist current state to DO storage. */
  private async persist(): Promise<void> {
    if (!this._state) return
    this._state.updatedAt = Date.now()
    await this.ctx.storage.put(STATE_KEY, this._state)
  }

  /** Non-empty seat indices → player IDs. */
  private occupiedSeats(): number[] {
    if (!this._state) return []
    const ids: number[] = []
    for (let i = 0; i < this._state.seats.length; i++) {
      if (this._state.seats[i] !== null) ids.push(i)
    }
    return ids
  }

  /** Find seat index for a session ID, or -1. */
  private seatBySession(sessionId: string): number {
    if (!this._state) return -1
    return this._state.seats.indexOf(sessionId)
  }

  /** Broadcast a message to all connected WebSocket clients. */
  private broadcast(message: WSOutgoingMessage): void {
    const msg = JSON.stringify(message)
    const sockets = this.ctx.getWebSockets()
    for (const ws of sockets) {
      try {
        ws.send(msg)
      } catch {
        // Client disconnected — will be cleaned up on next close event
      }
    }
  }

  /** Build the public room snapshot compatible with the shared Room type. */
  private publicRoom() {
    if (!this._state) throw new Error('State not loaded')
    return {
      board: this._state.board,
      activePlayer: this._state.activePlayerId ?? 0,
      turn: this._state.turn,
      roll: this._state.roll,
      stage: this._state.stage,
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP endpoint implementations
  // ---------------------------------------------------------------------------

  private async handleGetRoom(request: Request): Promise<Response> {
    const sessionId = request.headers.get('X-Session-Id') ?? ''
    const playerIds = this.occupiedSeats()
    const playerPosition = this.seatBySession(sessionId)
    const playerId = playerPosition >= 0 ? playerPosition : null

    return new Response(
      JSON.stringify({
        room: this.publicRoom(),
        playerIds,
        playerPosition,
        playerId,
        seats: this._state!.seats,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  /**
   * Initialize (or re-initialize) the room to defaults.
   * Called by POST /create-room.
   */
  private async handleInit(): Promise<Response> {
    this._state = defaultState()
    await this.persist()
    return new Response(
      JSON.stringify({ initialized: true }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as { sessionId: string }
    const { sessionId } = body
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const state = this._state!
    if (state.stage !== 'waiting-for-players') {
      return new Response(
        JSON.stringify({ error: 'Game already in progress' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Idempotent: if already in a seat, return that seat
    const existingSeat = this.seatBySession(sessionId)
    if (existingSeat >= 0) {
      return new Response(
        JSON.stringify({ playerId: existingSeat, playerIds: this.occupiedSeats() }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const emptySeat = state.seats.indexOf(null)
    if (emptySeat < 0) {
      return new Response(
        JSON.stringify({ error: 'Room is full' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    state.seats[emptySeat] = sessionId
    await this.persist()

    this.broadcast({ event: 'player-joined', data: { playerIds: this.occupiedSeats() } })

    return new Response(
      JSON.stringify({ playerId: emptySeat, playerIds: this.occupiedSeats() }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  private async handleLeave(request: Request): Promise<Response> {
    const body = (await request.json()) as { sessionId: string }
    const { sessionId } = body
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return new Response(
        JSON.stringify({ error: 'Not a player' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    state.seats[seatIndex] = null
    await this.persist()

    this.broadcast({ event: 'player-left', data: { playerIds: this.occupiedSeats() } })

    return new Response(
      JSON.stringify({ playerIds: this.occupiedSeats() }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = (await request.json()) as { sessionId: string }
    const { sessionId } = body
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return new Response(
        JSON.stringify({ error: 'Not a player' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const playerIds = this.occupiedSeats()
    if (playerIds.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Need at least 2 players to start' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    state.stage = 'in-progress'
    state.activePlayerId = playerIds[0] ?? null
    await this.persist()

    const roomData = this.publicRoom()
    this.broadcast({ event: 'turn-start', data: roomData })

    return new Response(JSON.stringify(roomData), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async handleTurn(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      sessionId: string
      column: number
      shape: string
      rotation: number
      flip: boolean
    }
    const { sessionId } = body
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'sessionId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return new Response(
        JSON.stringify({ error: 'Not a player' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (state.stage !== 'in-progress') {
      return new Response(
        JSON.stringify({ error: 'Game is not in progress' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Basic turn increment — full validation in M3-5
    state.turn += 1
    await this.persist()

    const roomData = this.publicRoom()
    this.broadcast({ event: 'turn-start', data: roomData })

    return new Response(JSON.stringify(roomData), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // WebSocket upgrade
  // ---------------------------------------------------------------------------

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId') ?? ''

    // The DO does not need to block upgrades — the DO will handle init
    // asynchronously via ensureLoaded when messages arrive.
    // Fire-and-forget a load so the state is warm.
    this.ensureLoaded()

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    this.ctx.acceptWebSocket(server, [sessionId])

    // Store session ID on the WebSocket for retrieval on close
    server.serializeAttachment({ sessionId })

    // Send initial connection event
    this.sendWsMessage(server, 'connected', { roomId: url.searchParams.get('roomId') ?? '' })

    // Send current room state snapshot
    if (this._state) {
      this.sendWsMessage(server, 'state', this.buildStatePayload(sessionId))
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  /** Send a structured JSON message over a single WebSocket. */
  private sendWsMessage(ws: WebSocket, event: string, data: unknown): void {
    try {
      ws.send(JSON.stringify({ event, data }))
    } catch {
      // Socket may have closed between accept and send
    }
  }

  /** Build the full state payload for a connecting client. */
  private buildStatePayload(sessionId: string) {
    if (!this._state) return {}
    const playerIds = this.occupiedSeats()
    const playerPosition = this.seatBySession(sessionId)
    return {
      board: this._state.board,
      seats: this._state.seats,
      activePlayer: this._state.activePlayerId,
      turn: this._state.turn,
      roll: this._state.roll,
      stage: this._state.stage,
      scores: this._state.scores,
      playerIds,
      playerPosition,
      playerId: playerPosition >= 0 ? playerPosition : null,
    }
  }
}