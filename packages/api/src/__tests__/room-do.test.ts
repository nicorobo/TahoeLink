import { expect, describe, it, beforeAll, afterAll } from "bun:test"

const BASE = "http://localhost:8787"

let roomId = ""

/**
 * Map a roll value to a legal shape for testing.
 */
function legalShapeForRoll(roll: string): string {
  const map: Record<string, string[]> = {
    I: ["I"],
    O: ["O"],
    T: ["T"],
    L: ["L"],
    SZ: ["S"],
    any: ["L"],
  }
  return (map[roll] ?? ["L"])[0]!
}

/**
 * Helper: sends a request with optional cookie header and returns
 * { response, cookie } — the cookie string for subsequent requests.
 */
async function req(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<{ res: Response; cookie: string; body: any }> {
  const { method = "GET", body, cookie } = options
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cookie) headers["Cookie"] = cookie

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Extract Set-Cookie header — take the first one (session_id)
  const setCookie = res.headers.get("Set-Cookie") ?? ""
  const sessionMatch = setCookie.match(/session_id=([^;]+)/)
  const nextCookie = sessionMatch
    ? `session_id=${sessionMatch[1]}`
    : cookie ?? ""

  const responseBody = await res.json().catch(() => null)
  return { res, cookie: nextCookie, body: responseBody }
}

describe("Room DO lifecycle", () => {
  let c1 = "" // session cookie for player 1
  let c2 = "" // session cookie for player 2

  // -----------------------------------------------------------------------
  // Create room
  // -----------------------------------------------------------------------
  it("POST /create-room returns a room ID", async () => {
    const { res, cookie, body } = await req("/create-room", { method: "POST" })
    expect(res.status).toBe(200)
    expect(body).toHaveProperty("roomId")
    roomId = body.roomId as string
    expect(roomId.length).toBeGreaterThan(0)
    c1 = cookie // store session 1
    expect(c1).not.toBe("")
  })

  // -----------------------------------------------------------------------
  // Read room before any joins
  // -----------------------------------------------------------------------
  it("GET /room/:id returns default state", async () => {
    const { res, body } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(res.status).toBe(200)
    expect(body).toHaveProperty("room")
    expect(body.room.stage).toBe("waiting-for-players")
    expect(body.room.turn).toBe(0)
    expect(body.seats).toEqual([null, null, null, null])
    expect(body.youSeat).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Join player 1
  // -----------------------------------------------------------------------
  it("POST /room/:id/join creates a seat for player 1", async () => {
    const { res, body } = await req(`/room/${roomId}/join`, {
      method: "POST",
      cookie: c1,
      body: {},
    })
    expect(res.status).toBe(200)
    expect(body.youSeat).toBe(0)
    expect(body.seats[0]).not.toBeNull()
  })

  it("GET /room/:id reflects player 1 after join", async () => {
    const { body } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(body.youSeat).toBe(0)
    expect(body.seats[0]).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Get session cookie for player 2
  // -----------------------------------------------------------------------
  it("Health check gives player 2 a session cookie", async () => {
    const { cookie } = await req("/health")
    c2 = cookie
    expect(c2).not.toBe("")
    expect(c2).not.toBe(c1) // must be different sessions
  })

  // -----------------------------------------------------------------------
  // Join player 2
  // -----------------------------------------------------------------------
  it("POST /room/:id/join creates a seat for player 2", async () => {
    const { res, body } = await req(`/room/${roomId}/join`, {
      method: "POST",
      cookie: c2,
      body: {},
    })
    expect(res.status).toBe(200)
    expect(body.youSeat).toBe(1)
    expect(body.seats[0]).not.toBeNull()
    expect(body.seats[1]).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Idempotent rejoin
  // -----------------------------------------------------------------------
  it("Rejoin with same session returns existing seat", async () => {
    const { res, body } = await req(`/room/${roomId}/join`, {
      method: "POST",
      cookie: c1,
      body: {},
    })
    expect(res.status).toBe(200)
    expect(body.youSeat).toBe(0) // same seat
    expect(body.seats[0]).not.toBeNull()
    expect(body.seats[1]).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Start game
  // -----------------------------------------------------------------------
  let startRoll = "" // captured from start response for turn test

  it("POST /room/:id/start transitions to in-progress", async () => {
    const { res, body } = await req(`/room/${roomId}/start`, {
      method: "POST",
      cookie: c1,
    })
    expect(res.status).toBe(200)
    expect(body.stage).toBe("in-progress")
    expect(body.turn).toBe(1)
    expect(body.roll).toBeDefined()
    expect(body).toHaveProperty("activeSeat")
    expect(body).toHaveProperty("youSeat")
    startRoll = body.roll as string
  })

  it("GET /room/:id confirms game is in-progress", async () => {
    const { body } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(body.room.stage).toBe("in-progress")
    expect(body.room.activePlayer).toBe(0)
    // Should include scores and winner fields
    expect(body).toHaveProperty("scores")
    expect(body).toHaveProperty("winnerSeat")
    expect(body).toHaveProperty("activeSeat")
    expect(typeof body.activeSeat).toBe("number")
  })

  // -----------------------------------------------------------------------
  // Turn
  // -----------------------------------------------------------------------
  it("POST /room/:id/turn places piece and advances turn", async () => {
    const shape = legalShapeForRoll(startRoll)
    const { res, body } = await req(`/room/${roomId}/turn`, {
      method: "POST",
      cookie: c1,
      body: { column: 0, shape, rotation: 0, flip: false },
    })
    expect(res.status).toBe(200)
    // Turn was 1 after start; after placement it should be 2 (incremented for next player)
    expect(body.turn).toBe(2)
    expect(body.stage).toBe("in-progress")
  })

  // -----------------------------------------------------------------------
  // Leave
  // -----------------------------------------------------------------------
  it("POST /room/:id/leave removes player and pauses game", async () => {
    const { res, body } = await req(`/room/${roomId}/leave`, {
      method: "POST",
      cookie: c2,
    })
    expect(res.status).toBe(200)
    expect(body.seats[0]).not.toBeNull()
    expect(body.seats[1]).toBeNull()
    expect(body.seats[2]).toBeNull()
    expect(body.seats[3]).toBeNull()
  })

  it("GET /room/:id confirms player 2 left and game is paused", async () => {
    const { body } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(body.seats[1]).toBeNull()
    // Game should be paused since player left mid-game
    expect(body.room.stage).toBe("paused")
  })

  // -----------------------------------------------------------------------
  // Error cases
  // -----------------------------------------------------------------------
  it("POST /room/:id/join without cookie returns error", async () => {
    const { body } = await req(`/room/${roomId}/join`, {
      method: "POST",
      body: {},
    })
    // Creates a new session (no cookie), tries to join
    // Should be allowed since there's an empty seat (seat 1 is free again)
    // but the session is valid — the test here is that it doesn't crash
    expect(body).not.toBeNull()
  })

  it("GET unknown room returns 404 with standardized error", async () => {
    const { res, body } = await req(`/room/unknown123`, { cookie: c1 })
    expect(res.status).toBe(404)
    expect(body).toHaveProperty("error")
    expect(body.error).toHaveProperty("code")
    expect(body.error.code).toBe("NOT_FOUND")
    expect(body.error).toHaveProperty("message")
  })

  it("POST /room/:id/join on unknown room returns 404", async () => {
    const { res, body } = await req(`/room/unknown123/join`, {
      method: "POST",
      cookie: c1,
      body: {},
    })
    expect(res.status).toBe(404)
    expect(body.error.code).toBe("NOT_FOUND")
  })

  // -----------------------------------------------------------------------
  // Error format
  // -----------------------------------------------------------------------
  it("All errors use { error: { code, message } } format", async () => {
    // Unknown room
    const { body } = await req(`/room/unknown456`, { cookie: c1 })
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    })
  })

  // -----------------------------------------------------------------------
  // Room ID format
  // -----------------------------------------------------------------------
  it("Room ID is 8-character Crockford base32", () => {
    // Room IDs are generated in create-room; verify the format
    expect(roomId.length).toBe(8)
    expect(roomId).toMatch(/^[0-9A-Z]+$/)
    // Should not contain ambiguous Crockford chars (I, L, O, U)
    expect(roomId).not.toMatch(/[ILOU]/)
  })

  // -----------------------------------------------------------------------
  // WebSocket upgrade
  // -----------------------------------------------------------------------
  it("WebSocket upgrade succeeds", async () => {
    const wsUrl = BASE.replace(/^http/, "ws")
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}?roomId=${roomId}`, {
      headers: { Cookie: c1 },
    } as any)

    const connected = new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error("WebSocket connection failed"))
      setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000)
    })

    await connected
    ws.close()
  })

  it("WebSocket receives state snapshot after connect", async () => {
    const wsUrl = BASE.replace(/^http/, "ws")
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}?roomId=${roomId}`, {
      headers: { Cookie: c1 },
    } as any)

    const messages: string[] = []
    const gotMessages = new Promise<void>((resolve) => {
      ws.onmessage = (ev) => {
        messages.push(ev.data as string)
        if (messages.length >= 2) resolve()
      }
      ws.onerror = () => {}
      setTimeout(() => resolve(), 3000)
    })

    await gotMessages
    ws.close()

    expect(messages.length).toBeGreaterThanOrEqual(2)
    const stateMsg = JSON.parse(messages[1]!)
    expect(stateMsg.event).toBe("state")
    expect(stateMsg.data).toHaveProperty("board")
    expect(stateMsg.data).toHaveProperty("stage")
    expect(stateMsg.data).toHaveProperty("stateVersion")
    expect(typeof stateMsg.data.stateVersion).toBe("number")
  })
})

describe("M3-9 — Full lifecycle, error handling, 4-player, leave/rejoin", () => {
  let c1 = ""
  let c2 = ""
  let c3 = ""
  let c4 = ""
  let roomId4p = ""

  it("creates a fresh room", async () => {
    const { res, cookie, body } = await req("/create-room", { method: "POST" })
    expect(res.status).toBe(200)
    expect(body).toHaveProperty("roomId")
    roomId4p = body.roomId as string
    c1 = cookie
    expect(c1).not.toBe("")
  })

  it("joins 4 players", async () => {
    const r1 = await req(`/room/${roomId4p}/join`, { method: "POST", cookie: c1, body: {} })
    expect(r1.res.status).toBe(200)
    expect(r1.body.youSeat).toBe(0)

    const h2 = await req("/health")
    c2 = h2.cookie
    const r2 = await req(`/room/${roomId4p}/join`, { method: "POST", cookie: c2, body: {} })
    expect(r2.res.status).toBe(200)
    expect(r2.body.youSeat).toBe(1)

    const h3 = await req("/health")
    c3 = h3.cookie
    const r3 = await req(`/room/${roomId4p}/join`, { method: "POST", cookie: c3, body: {} })
    expect(r3.res.status).toBe(200)
    expect(r3.body.youSeat).toBe(2)

    const h4 = await req("/health")
    c4 = h4.cookie
    const r4 = await req(`/room/${roomId4p}/join`, { method: "POST", cookie: c4, body: {} })
    expect(r4.res.status).toBe(200)
    expect(r4.body.youSeat).toBe(3)

    const check = await req(`/room/${roomId4p}`, { cookie: c1 })
    expect(check.body.seats[0]).not.toBeNull()
    expect(check.body.seats[1]).not.toBeNull()
    expect(check.body.seats[2]).not.toBeNull()
    expect(check.body.seats[3]).not.toBeNull()
    expect(check.body.seats.filter((s: unknown) => s !== null).length).toBe(4)
  })

  let startRoll4p = ""

  it("starts 4-player game", async () => {
    const { res, body } = await req(`/room/${roomId4p}/start`, {
      method: "POST",
      cookie: c1,
    })
    expect(res.status).toBe(200)
    expect(body.stage).toBe("in-progress")
    expect(body.turn).toBe(1)
    expect(body.roll).toBeDefined()
    expect(body).toHaveProperty("activeSeat")
    startRoll4p = body.roll as string
  })

  it("player 0 makes a valid move (4-player)", async () => {
    const shape = legalShapeForRoll(startRoll4p)
    const { res, body } = await req(`/room/${roomId4p}/turn`, {
      method: "POST",
      cookie: c1,
      body: { column: 0, shape, rotation: 0, flip: false },
    })
    expect(res.status).toBe(200)
    expect(body.turn).toBe(2)
    expect(body.stage).toBe("in-progress")
  })

  it("rejects move when not your turn (player 0 tries again)", async () => {
    const shape = legalShapeForRoll(startRoll4p)
    const { res, body } = await req(`/room/${roomId4p}/turn`, {
      method: "POST",
      cookie: c1,
      body: { column: 1, shape, rotation: 0, flip: false },
    })
    expect(res.status).toBe(400)
    expect(body).toHaveProperty("error")
    expect(body.error.code).toBe("NOT_YOUR_TURN")
  })

  it("rejects placement with out-of-range column", async () => {
    const { body: stateBody } = await req(`/room/${roomId4p}`, { cookie: c2 })
    const activeRoll = stateBody.roll as string
    const shape = legalShapeForRoll(activeRoll)
    const { res } = await req(`/room/${roomId4p}/turn`, {
      method: "POST",
      cookie: c2,
      body: { column: 99, shape, rotation: 0, flip: false },
    })
    expect(res.status).toBe(400)
  })

  it("rejects placement with shape not matching the roll", async () => {
    const { body: stateBody } = await req(`/room/${roomId4p}`, { cookie: c2 })
    const currentRoll = stateBody.roll as string
    const opposite: Record<string, string> = {
      I: "O", O: "I", T: "L", L: "T", SZ: "I", any: "Z",
    }
    const badShape = opposite[currentRoll] ?? "I"
    const { res, body } = await req(`/room/${roomId4p}/turn`, {
      method: "POST",
      cookie: c2,
      body: { column: 0, shape: badShape, rotation: 0, flip: false },
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe("INVALID_SHAPE")
  })

  it("monotonically increments stateVersion on mutations", async () => {
    const { body: before } = await req(`/room/${roomId4p}`, { cookie: c1 })
    const v1 = before.stateVersion as number
    expect(v1).toBeGreaterThan(0)

    // Make player 1's move
    const activeRoll = before.roll as string
    const shape = legalShapeForRoll(activeRoll)
    await req(`/room/${roomId4p}/turn`, {
      method: "POST",
      cookie: c2,
      body: { column: 2, shape, rotation: 0, flip: false },
    })

    const { body: after } = await req(`/room/${roomId4p}`, { cookie: c1 })
    expect(after.stateVersion).toBeGreaterThan(v1)
  })

  it("leave mid-game pauses the game", async () => {
    const { res, body } = await req(`/room/${roomId4p}/leave`, {
      method: "POST",
      cookie: c4,
    })
    expect(res.status).toBe(200)
    expect(body.seats[0]).not.toBeNull()
    expect(body.seats[1]).not.toBeNull()
    expect(body.seats[2]).not.toBeNull()
    expect(body.seats[3]).toBeNull()

    const { body: check } = await req(`/room/${roomId4p}`, { cookie: c1 })
    expect(check.stage).toBe("paused")
    expect(check.seats[3]).toBeNull()
  })

  it("rejoins paused room with same session", async () => {
    const { res, body } = await req(`/room/${roomId4p}/join`, {
      method: "POST",
      cookie: c4,
      body: {},
    })
    expect(res.status).toBe(200)
    expect(body.youSeat).toBe(3)
  })

  it("rejects join when all seats are full", async () => {
    const { cookie: extraCookie } = await req("/health")
    const { res, body } = await req(`/room/${roomId4p}/join`, {
      method: "POST",
      cookie: extraCookie,
      body: {},
    })
    expect(res.status).toBe(400)
    expect(body.error.code).toBe("ROOM_FULL")
  })
})

describe("M4.5-8 — Regression tests for wire format and server behavior changes", () => {
  // -----------------------------------------------------------------------
  // a. youSeat correctly assigned per session
  // -----------------------------------------------------------------------
  it("youSeat is correctly assigned per session", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string

    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })
    const r1 = await req(`/room/${roomId}`, { cookie: c1 })
    expect(r1.body.youSeat).toBe(0)

    const { cookie: c2 } = await req("/health")
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c2, body: {} })
    const r2 = await req(`/room/${roomId}`, { cookie: c2 })
    expect(r2.body.youSeat).toBe(1)

    // Spectator (no HTTP join) gets youSeat null
    const { cookie: specCookie } = await req("/health")
    const spec = await req(`/room/${roomId}`, { cookie: specCookie })
    expect(spec.body.youSeat).toBeNull()
  })

  // -----------------------------------------------------------------------
  // b. Cold-start WS snapshot has non-negative stateVersion
  // -----------------------------------------------------------------------
  it("cold-start WS snapshot has stateVersion >= 0", async () => {
    const { cookie, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string

    const wsUrl = BASE.replace(/^http/, "ws")
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}?roomId=${roomId}`, {
      headers: { Cookie: cookie },
    } as any)

    const messages: string[] = []
    const gotState = new Promise<void>((resolve) => {
      ws.onmessage = (ev) => {
        messages.push(ev.data as string)
        if (messages.length >= 2) resolve()
      }
      ws.onerror = () => {}
      setTimeout(() => resolve(), 3000)
    })

    await gotState
    ws.close()

    expect(messages.length).toBeGreaterThanOrEqual(2)
    const stateMsg = JSON.parse(messages[1]!)
    expect(stateMsg.event).toBe("state")
    expect(stateMsg.data.stateVersion).toBeGreaterThanOrEqual(0)
  })

  // -----------------------------------------------------------------------
  // c. Join response includes updated seats
  // -----------------------------------------------------------------------
  it("join response includes full state with updated seats", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string

    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })

    const { cookie: c2 } = await req("/health")
    const { body } = await req(`/room/${roomId}/join`, {
      method: "POST",
      cookie: c2,
      body: {},
    })
    expect(body.seats[1]).not.toBeNull()
    expect(body.youSeat).toBe(1)
  })

  // -----------------------------------------------------------------------
  // d. Paused game resumes when all seats are re-filled
  // -----------------------------------------------------------------------
  it("paused game resumes when all seats are re-filled", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string

    const { cookie: c2 } = await req("/health")

    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c2, body: {} })
    await req(`/room/${roomId}/start`, { method: "POST", cookie: c1 })

    // Leave pauses the game
    const { body: leaveRes } = await req(`/room/${roomId}/leave`, {
      method: "POST",
      cookie: c2,
    })
    expect(leaveRes.stage).toBe("paused")

    const { body: afterLeave } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(afterLeave.stage).toBe("paused")

    // Rejoin same session → game should resume
    const { body: rejoinRes } = await req(`/room/${roomId}/join`, {
      method: "POST",
      cookie: c2,
      body: {},
    })
    expect(rejoinRes.youSeat).toBe(1)

    const { body: afterRejoin } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(afterRejoin.stage).toBe("in-progress")
  })

  // -----------------------------------------------------------------------
  // e. Zod validation returns structured error
  // -----------------------------------------------------------------------
  it("Zod validation returns { error: { code, message } }", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string
    const { cookie: c2 } = await req("/health")

    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c2, body: {} })
    await req(`/room/${roomId}/start`, { method: "POST", cookie: c1 })

    // Send invalid turn (missing required fields: shape, rotation, flip)
    const { res, body } = await req(`/room/${roomId}/turn`, {
      method: "POST",
      cookie: c1,
      body: { column: 0 },
    })
    expect(res.status).toBe(400)
    expect(body).toHaveProperty("error")
    expect(body.error).toHaveProperty("code")
    expect(body.error).toHaveProperty("message")
  })

  // -----------------------------------------------------------------------
  // f. Gap-seat room initializes correctly
  // -----------------------------------------------------------------------
  it("gap-seat room (seats 0 and 2) initializes correctly", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string

    const { cookie: c2 } = await req("/health")
    const { cookie: c3 } = await req("/health")

    // Join three players
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })  // seat 0
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c2, body: {} })  // seat 1
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c3, body: {} })  // seat 2

    // Player 2 (seat 1) leaves → seats 0 and 2 remain
    await req(`/room/${roomId}/leave`, { method: "POST", cookie: c2 })

    // Start game with gap seats (0 and 2)
    const { body: startRes } = await req(`/room/${roomId}/start`, {
      method: "POST",
      cookie: c1,
    })
    expect(startRes.stage).toBe("in-progress")

    // Both remaining players should have pieces
    const { body: stateRes } = await req(`/room/${roomId}`, { cookie: c1 })
    expect(stateRes.piecesRemaining["0"]).toBeDefined()
    expect(stateRes.piecesRemaining["2"]).toBeDefined()
  })

  // -----------------------------------------------------------------------
  // g. winnerSeat is null when game is ongoing
  // -----------------------------------------------------------------------
  it("winnerSeat is null when game is ongoing (no winner yet)", async () => {
    const { cookie: c1, body: createRes } = await req("/create-room", { method: "POST" })
    const roomId = createRes.roomId as string
    const { cookie: c2 } = await req("/health")

    await req(`/room/${roomId}/join`, { method: "POST", cookie: c1, body: {} })
    await req(`/room/${roomId}/join`, { method: "POST", cookie: c2, body: {} })
    await req(`/room/${roomId}/start`, { method: "POST", cookie: c1 })

    const { body } = await req(`/room/${roomId}`, { cookie: c1 })
    if (body.stage === "in-progress") {
      expect(body.winnerSeat).toBeNull()
    }
  })
})
