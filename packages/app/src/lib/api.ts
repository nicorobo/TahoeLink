import type { Shape } from "@tahoelink/shared"

// Room page uses ssr = false, so API_BASE is always /api (proxied by Vite).
// Override via PUBLIC_API_BASE env var for split deployments.
export const API_BASE = import.meta.env.PUBLIC_API_BASE ?? '/api';

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const body = await res.json()
  if (!res.ok || body.error) {
    const err = body.error ?? { code: 'UNKNOWN', message: 'Request failed' }
    throw new ApiError(err.code, err.message)
  }
  return body
}

export const api = {
    createRoom: async () => {
        return apiFetch('/create-room', { method: 'POST' })
    },
    joinRoom: async ({ roomId, playerId }: { roomId: string, playerId: number }) => {
        return apiFetch(`/room/${roomId}/join`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
        })
    },
    leaveRoom: async ({ roomId }: { roomId: string }) => {
        return apiFetch(`/room/${roomId}/leave`, { method: 'POST' })
    },
    startGame: async ({ roomId }: { roomId: string }) => {
        return apiFetch(`/room/${roomId}/start`, { method: 'POST' })
    },
    makeMove: async ({ roomId, column, shape, rotation, flip }: { roomId: string, column: number, shape: Shape, rotation: number, flip: boolean }) => {
        console.log('making move', { roomId, column, shape, rotation, flip })
        return apiFetch(`/room/${roomId}/turn`, {
            method: 'POST',
            body: JSON.stringify({ column, shape, rotation, flip }),
        })
    },
}