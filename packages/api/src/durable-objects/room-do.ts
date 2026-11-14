// @ts-nocheck - cloudflare:workers is a runtime module provided by the Workers platform
import { DurableObject } from 'cloudflare:workers'
import type { Board, DiceValue, RoomStage, Shape } from '@tahoelink/shared'
import {
  getDefaultBoard,
  getShape,
  tryPlacePiece,
  rollDie,
  legalShapesForDie,
  scoreTurn,
  getWinner,
  trySkipTurn,
  isGameOver,
  createPieceSupply,
  detectFirstTurnSZO,
  encodeCell,
  TIE_BREAKER_LIMIT,
  MAX_PLAYERS,
} from '@tahoelink/shared'
import { Err, HTTPException } from '../lib/http-error'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Internal state persisted via DO storage.
 */
export interface RoomDOState {
  version: number
  stateVersion: number
  board: Board
  /** 4 seats indexed 0–3, each holding a session ID or null for empty. */
  seats: (string | null)[]
  activePlayerId: number | null
  turn: number
  roll: DiceValue
  stage: RoomStage
  /** Flat scores keyed by player ID (1-based = seatIndex + 1). */
  scores: Record<number, number>
  /** Scored cell keys ("x,y") per player ID, used to avoid double-counting. */
  scoredCells: Record<string, string[]>
  piecesRemaining: Record<string, Record<string, number>>
  winner: number | null
  /** True once handleInit has been called. Uninitialized DOs return 404. */
  initialized: boolean
  createdAt: number
  updatedAt: number
}

const STATE_KEY = 'room:v2'

/** Sliding TTL: reset on every mutation. Room is deleted after this idle period. */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Heartbeat interval: broadcast a keepalive to WebSocket clients. */
const HEARTBEAT_INTERVAL_MS = 20_000 // 20 seconds

function defaultState(): RoomDOState {
  return {
    version: 2,
    stateVersion: 0,
    board: getDefaultBoard(),
    seats: [null, null, null, null],
    activePlayerId: null,
    turn: 0,
    roll: 'I' as DiceValue,
    stage: 'waiting-for-players',
    scores: {},
    scoredCells: {},
    piecesRemaining: {},
    winner: null,
    initialized: false,
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

// ---------------------------------------------------------------------------
// Durable Object
// ---------------------------------------------------------------------------

/**
 * Durable Object representing a single game room.
 *
 * Owns the authoritative room state, seat management, and real-time
 * broadcasting via WebSocket (Hibernation API).
 */
export class RoomDurableObject extends DurableObject {
  /** Cached in-memory state. null when not yet loaded or uninitialized. */
  private _state: RoomDOState | null = null

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
  }

  // ---------------------------------------------------------------------------
  // fetch — HTTP endpoints called by Hono routes
  // ---------------------------------------------------------------------------
  override async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade — handled before state check
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request)
    }

    // Route to handler
    const url = new URL(request.url)
    const method = request.method

    try {
      if (method === 'POST') {
        if (url.pathname === '/init') return this.handleInit()
      }

      // All other handlers require an initialized room
      await this.ensureLoaded()
      if (!this._state || !this._state.initialized) {
        return Err.roomNotFound('unknown').toResponse()
      }

      if (method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        return this.handleGetRoom(request)
      }
      if (method === 'POST') {
        if (url.pathname === '/join') return this.handleJoin(request)
        if (url.pathname === '/leave') return this.handleLeave(request)
        if (url.pathname === '/start') return this.handleStart(request)
        if (url.pathname === '/turn') return this.handleTurn(request)
      }

      return Err.notFound('Endpoint not found').toResponse()
    } catch (err) {
      if (err instanceof HTTPException) {
        return err.toResponse()
      }
      console.error('DO fetch error:', err)
      return Err.internal().toResponse()
    }
  }

  // ---------------------------------------------------------------------------
  // alarm — TTL-based room cleanup
  // ---------------------------------------------------------------------------
  override async alarm(): Promise<void> {
    await this.ensureLoaded()
    if (!this._state) return

    const websockets = this.ctx.getWebSockets()
    const hasConnections = websockets.length > 0

    // Send heartbeat if there are connected clients
    if (hasConnections) {
      this.broadcast({
        event: 'heartbeat',
        data: { stateVersion: this._state.stateVersion },
      })
    }

    // Check TTL: delete room if idle for too long
    if (Date.now() - this._state.updatedAt > ROOM_TTL_MS) {
      await this.ctx.storage.delete(STATE_KEY)
      this._state = null
      console.log('Room expired and cleaned up via alarm')
      return
    }

    // Reschedule based on connection state
    if (hasConnections) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS)
    } else {
      // No active connections — sleep until TTL
      await this.ctx.storage.setAlarm(this._state.updatedAt + ROOM_TTL_MS)
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
    const tags = ws.deserializeAttachment() as { sessionId: string } | null
    console.log(
      `WebSocket closed: session=${tags?.sessionId ?? 'unknown'}, code=${code}, reason=${reason}`,
    )

    if (!tags?.sessionId) return

    // Decrement connection counter for this session
    const currentCount = this.wsConnections.get(tags.sessionId) ?? 0
    if (currentCount <= 1) {
      this.wsConnections.delete(tags.sessionId)
    } else {
      this.wsConnections.set(tags.sessionId, currentCount - 1)
      // Still have other tabs connected — do not auto-leave
      return
    }

    // This was the last WebSocket for this session — auto-leave if seated
    await this.ensureLoaded()
    if (!this._state || !this._state.initialized) return

    const seatIndex = this.seatBySession(tags.sessionId)
    if (seatIndex < 0) return

    if (this._state.stage === 'in-progress') {
      // Auto-leave and pause
      this._state.seats[seatIndex] = null
      this._state.stage = 'paused'

      if (this._state.activePlayerId === seatIndex) {
        const occupied = this.occupiedSeats()
        this._state.activePlayerId = occupied.length > 0 ? occupied[0] : null
      }

      await this.persist()
      this.broadcast({ event: 'player-left', data: { playerIds: this.occupiedSeats() } })
      this.broadcast({ event: 'state', data: this.buildStatePayload('') })
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Load state from DO storage. Sets _state to null if no data exists. */
  private async ensureLoaded(): Promise<void> {
    if (this._state) return
    const stored = await this.ctx.storage.get<RoomDOState>(STATE_KEY)
    if (stored) {
      this._state = stored
    } else {
      this._state = null
    }
  }

  /** Persist current state to DO storage and schedule the next alarm. */
  private async persist(): Promise<void> {
    if (!this._state) return
    this._state.stateVersion++
    this._state.updatedAt = Date.now()
    await this.ctx.storage.put(STATE_KEY, this._state)

    // If there are active WebSocket connections, use the shorter heartbeat interval.
    // Otherwise sleep until the TTL expiry to avoid waking up for idle rooms.
    const websockets = this.ctx.getWebSockets()
    if (websockets.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS)
    } else {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
    }
  }

  /** Track WebSocket connection count per session for multi-tab support. */
  private wsConnections: Map<string, number> = new Map()

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
    const state = this._state!
    const playerIds = this.occupiedSeats()
    const playerPosition = this.seatBySession(sessionId)
    const playerId = playerPosition >= 0 ? playerPosition : null

    return new Response(
      JSON.stringify({
        room: this.publicRoom(),
        playerIds,
        playerPosition,
        playerId,
        seats: state.seats,
        scores: state.scores,
        winner: state.winner,
        stateVersion: state.stateVersion,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  /**
   * Initialize (or re-initialize) the room to defaults.
   * Called by POST /create-room.
   * Returns 409 Conflict if the room is already initialized.
   */
  private async handleInit(): Promise<Response> {
    // Check if state already exists to detect collisions
    await this.ensureLoaded()
    if (this._state && this._state.initialized) {
      return Err.conflict('Room ID already in use').toResponse()
    }

    this._state = defaultState()
    this._state.initialized = true
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
      return Err.sessionRequired().toResponse()
    }

    const state = this._state!
    // Allow join during waiting or paused (for rejoin after pause)
    if (state.stage !== 'waiting-for-players' && state.stage !== 'paused') {
      return Err.badRequest('GAME_IN_PROGRESS', 'Game already in progress').toResponse()
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
      return Err.badRequest('ROOM_FULL', 'Room is full').toResponse()
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
      return Err.sessionRequired().toResponse()
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return Err.badRequest('NOT_A_PLAYER', 'Not a player').toResponse()
    }

    // Free the seat
    state.seats[seatIndex] = null

    // If game is in progress, pause it
    if (state.stage === 'in-progress') {
      state.stage = 'paused'

      // If the leaving player was the active player, advance to next occupied seat
      if (state.activePlayerId === seatIndex) {
        const occupied = this.occupiedSeats() // excludes the freed seat
        state.activePlayerId = occupied.length > 0 ? occupied[0] : null
      }
    }

    await this.persist()

    this.broadcast({ event: 'player-left', data: { playerIds: this.occupiedSeats() } })
    this.broadcast({ event: 'state', data: this.buildStatePayload('') })

    return new Response(
      JSON.stringify({ playerIds: this.occupiedSeats() }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = (await request.json()) as { sessionId: string }
    const { sessionId } = body
    if (!sessionId) {
      return Err.sessionRequired().toResponse()
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return Err.badRequest('NOT_A_PLAYER', 'Not a player').toResponse()
    }

    const playerIds = this.occupiedSeats()
    if (playerIds.length < 2) {
      return Err.badRequest('NOT_ENOUGH_PLAYERS', 'Need at least 2 players to start').toResponse()
    }

    // --- Roll the initial die ---
    const die = rollDie()
    state.roll = die
    state.turn = 1

    // --- Create piece supply (1 copy per seated player) ---
    const supply = createPieceSupply(playerIds.length, false)
    // Convert 1-based supply keys to match our mapping:
    // createPieceSupply(2) => { 1: {...}, 2: {...} } for players 1, 2.
    // We map seat 0 → player 1, seat 1 → player 2, etc.
    const remapped: Record<string, Record<string, number>> = {}
    for (let i = 0; i < playerIds.length; i++) {
      const pid = String(i + 1)
      remapped[pid] = supply[Number(pid)] ?? { L: 5, O: 5, T: 5, I: 5, S: 5, Z: 5 }
    }
    state.piecesRemaining = remapped

    // --- Initialize scores (flat) and scoredCells ---
    const initialScores: Record<number, number> = {}
    const initialScoredCells: Record<string, string[]> = {}
    for (let i = 0; i < playerIds.length; i++) {
      const pid = i + 1
      initialScores[pid] = 0
      initialScoredCells[String(pid)] = []
    }
    state.scores = initialScores
    state.scoredCells = initialScoredCells

    // --- Set first player (join order) ---
    const firstPlayer = playerIds[0]!
    state.activePlayerId = firstPlayer
    state.stage = 'in-progress'

    // --- First-turn S/Z penalty ---
    // If the starting player rolls SZ on turn 1, they begin with -1.
    const firstOwner = firstPlayer + 1
    if (detectFirstTurnSZO(state.board, firstOwner, die)) {
      state.scores[firstOwner] = -1
    }

    await this.persist()

    const roomData = this.publicRoom()
    this.broadcast({ event: 'state', data: this.buildStatePayload(sessionId) })

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
    const { sessionId, column, shape: shapeStr, rotation, flip } = body
    if (!sessionId) {
      return Err.sessionRequired().toResponse()
    }

    const state = this._state!
    const seatIndex = this.seatBySession(sessionId)
    if (seatIndex < 0) {
      return Err.badRequest('NOT_A_PLAYER', 'Not a player').toResponse()
    }

    if (state.stage !== 'in-progress') {
      return Err.badRequest('GAME_NOT_IN_PROGRESS', 'Game is not in progress').toResponse()
    }

    // --- Verify this player is the active player ---
    if (seatIndex !== state.activePlayerId) {
      return Err.badRequest('NOT_YOUR_TURN', 'It is not your turn').toResponse()
    }

    const shapeName = shapeStr as Shape
    const owner = seatIndex + 1 // 1-based player ID for engine

    // --- Validate shape against the rolled die ---
    const legalShapes = legalShapesForDie(state.roll)
    if (!legalShapes.includes(shapeName)) {
      return Err.badRequest('INVALID_SHAPE', `Shape '${shapeStr}' is not allowed by the roll '${state.roll}'`).toResponse()
    }

    // --- Decrement piece supply (must have pieces) ---
    const pSupply = state.piecesRemaining[String(owner)]
    if (!pSupply || (pSupply[shapeName] ?? 0) <= 0) {
      return Err.badRequest('NO_PIECES', `No '${shapeStr}' pieces remaining`).toResponse()
    }

    // --- Get the shape orientation ---
    const shapeData = getShape({ shape: shapeName, rotation, flip })

    // --- Attempt placement ---
    const shapeId = encodeCell(owner, state.turn)
    const placeResult = tryPlacePiece({
      board: state.board,
      column,
      shape: shapeData,
      shapeId,
    })
    if (!placeResult) {
      return Err.badRequest('ILLEGAL_PLACEMENT', 'Piece cannot be placed at that column').toResponse()
    }

    // --- Place the piece ---
    state.board = placeResult.board
    pSupply[shapeName] -= 1

    // --- Compute scoring ---
    // Reconstruct previous PlayerScore objects from stored scores
    const previousScores: Record<number, { score: number; scoredCells: string[] }> = {}
    for (const [pidStr, score] of Object.entries(state.scores)) {
      previousScores[Number(pidStr)] = {
        score,
        scoredCells: state.scoredCells[pidStr] ?? [],
      }
    }
    const turnResult = scoreTurn(state.board, placeResult.cells, owner, previousScores)

    // Update stored scores / scoredCells from result
    for (const [pidStr, ps] of Object.entries(turnResult.scores)) {
      const pid = Number(pidStr)
      state.scores[pid] = ps.score
      state.scoredCells[pidStr] = ps.scoredCells
    }

    // --- Detect game over (tower full or no player can move) ---
    if (isGameOver(state.board, state.piecesRemaining)) {
      state.stage = 'complete'
      const winnerResult = getWinner(turnResult.scores, state.board)
      if (winnerResult === TIE_BREAKER_LIMIT) {
        state.winner = -1
      } else {
        state.winner = winnerResult.playerId
      }

      await this.persist()
      this.broadcast({ event: 'state', data: this.buildStatePayload(sessionId) })
      this.broadcast({
        event: 'game-over',
        data: { winner: state.winner, scores: { ...state.scores } },
      })

      return new Response(JSON.stringify(this.publicRoom()), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // --- Advance to next occupied seat ---
    const playerIds = this.occupiedSeats()
    const currentIdx = playerIds.indexOf(state.activePlayerId!)
    const nextSeatIndex = (currentIdx + 1) % playerIds.length
    state.activePlayerId = playerIds[nextSeatIndex]

    // --- Roll the die for the next player ---
    state.roll = rollDie()
    state.turn += 1

    // --- Skip-turn loop: advance past any player who cannot move ---
    let skipGuard = 0
    while (skipGuard < MAX_PLAYERS) {
      const nextOwner = state.activePlayerId! + 1
      const skipResult = trySkipTurn({
        board: state.board,
        piecesRemaining: state.piecesRemaining,
        playerId: nextOwner,
        diceValue: state.roll,
      })
      if (!skipResult.skipped) break

      // Advance past this player and re-roll
      const idx = playerIds.indexOf(state.activePlayerId!)
      state.activePlayerId = playerIds[(idx + 1) % playerIds.length]
      state.roll = rollDie()
      skipGuard++
    }

    // If all players skipped, game is over (tower is full)
    if (skipGuard >= MAX_PLAYERS) {
      state.stage = 'complete'
      const finalScores: Record<number, { score: number; scoredCells: string[] }> = {}
      for (const [pidStr, score] of Object.entries(state.scores)) {
        finalScores[Number(pidStr)] = {
          score,
          scoredCells: state.scoredCells[pidStr] ?? [],
        }
      }
      const winnerResult = getWinner(finalScores, state.board)
      if (winnerResult === TIE_BREAKER_LIMIT) {
        state.winner = -1
      } else {
        state.winner = winnerResult.playerId
      }
    }

    await this.persist()

    this.broadcast({ event: 'state', data: this.buildStatePayload(sessionId) })
    if (state.stage === 'complete') {
      this.broadcast({
        event: 'game-over',
        data: { winner: state.winner, scores: { ...state.scores } },
      })
    }

    return new Response(JSON.stringify(this.publicRoom()), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ---------------------------------------------------------------------------
  // WebSocket upgrade
  // ---------------------------------------------------------------------------

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId') ?? ''

    // Fire-and-forget load so state is warm for the state snapshot
    this.ensureLoaded()

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    this.ctx.acceptWebSocket(server, [sessionId])
    server.serializeAttachment({ sessionId })

    // Track this connection for multi-tab support
    const currentCount = this.wsConnections.get(sessionId) ?? 0
    this.wsConnections.set(sessionId, currentCount + 1)

    // Send initial connection event with current state version
    const version = this._state?.stateVersion ?? 0
    this.sendWsMessage(server, 'connected', {
      roomId: url.searchParams.get('roomId') ?? '',
      stateVersion: version,
    })

    // Send current room state snapshot if available
    if (this._state && this._state.initialized) {
      this.sendWsMessage(server, 'state', this.buildStatePayload(sessionId))
    }

    // Schedule heartbeat-alarm since a connection just arrived
    this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_INTERVAL_MS).catch(() => {})

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
      scores: { ...this._state.scores },
      winner: this._state.winner,
      stateVersion: this._state.stateVersion,
      playerIds,
      playerPosition,
      playerId: playerPosition >= 0 ? playerPosition : null,
    }
  }
}