// Type declarations for Cloudflare Workers / Durable Objects APIs
// These globals are provided by the Workers runtime.
// Used instead of @cloudflare/workers-types to avoid an extra dependency.

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  idFromString(id: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
  newUniqueId(): DurableObjectId
}

interface DurableObjectId {
  name?: string
  toString(): string
  equals(other: DurableObjectId): boolean
}

interface DurableObjectStub {
  fetch(request: Request | string): Promise<Response>
  fetch(url: string, options?: RequestInit): Promise<Response>
}

// The cloudflare:workers module is available at runtime in Workers
declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    readonly ctx: DurableObjectState
    readonly env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }

  interface DurableObjectState {
    storage: DurableObjectStorage
    acceptWebSocket(ws: WebSocket, tags?: string[]): void
    getWebSockets(tag?: string): WebSocket[]
    waitUntil(promise: Promise<unknown>): void
    abort(reason?: string): void
  }

  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>
    put<T = unknown>(key: string, value: T): Promise<void>
    delete(key: string): Promise<boolean>
    list<T = unknown>(options?: { prefix?: string; start?: string; end?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>
  }

  type WebSocketPair = {
    [key: number]: WebSocket
    0: WebSocket
    1: WebSocket
  }

  const WebSocketPair: {
    new(): WebSocketPair
  }
}