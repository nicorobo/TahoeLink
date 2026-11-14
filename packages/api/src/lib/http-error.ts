/**
 * Standardized error format for the TahoeLink API.
 *
 * All error responses follow: { error: { code: string, message: string } }
 *
 * This module is used by both the Hono app layer and the Durable Object layer
 * so that errors are consistent regardless of where they originate.
 */

export class HTTPException extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number = 400) {
    super(message)
    this.code = code
    this.status = status
  }

  /** The JSON-serializable body matching the ErrorPayload shape in events.ts. */
  toBody(): { error: { code: string; message: string } } {
    return { error: { code: this.code, message: this.message } }
  }

  /** Return a Response suitable for DO or plain fetch handlers. */
  toResponse(): Response {
    return new Response(JSON.stringify(this.toBody()), {
      status: this.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/** Pre-defined factory functions for common HTTP errors. */
export const Err = {
  notFound: (msg = 'Room not found') => new HTTPException('NOT_FOUND', msg, 404),
  badRequest: (code: string, msg: string) => new HTTPException(code, msg, 400),
  conflict: (msg = 'Room already exists') => new HTTPException('CONFLICT', msg, 409),
  unauthorized: (msg = 'Not authorized') => new HTTPException('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Forbidden') => new HTTPException('FORBIDDEN', msg, 403),
  internal: (msg = 'Internal server error') => new HTTPException('INTERNAL_ERROR', msg, 500),

  /** Validation-style error (fields missing, values invalid). */
  validation: (msg: string) => new HTTPException('VALIDATION_ERROR', msg, 400),

  /** Session required. */
  sessionRequired: () => new HTTPException('SESSION_REQUIRED', 'Session ID is required', 400),

  /** Unknown room identifier. */
  roomNotFound: (id: string) => new HTTPException('NOT_FOUND', `Room '${id}' not found`, 404),
}