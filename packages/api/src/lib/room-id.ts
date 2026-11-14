/**
 * Crypto-random room ID generation.
 *
 * Produces 8-character Crockford base32 IDs from 5 random bytes.
 * Crockford base32 avoids ambiguous characters (I/L/O/U) for easy
 * verbal sharing and typing.
 */

// Crockford base32 alphabet — excludes I, L, O, U to avoid ambiguity
const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Generate a short, human-shareable room ID using crypto randomness.
 * Returns an 8-character string with ~40 bits of entropy.
 */
export function generateRoomId(): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)

  // Interpret 5 bytes as a 40-bit big-endian integer
  let n = 0
  for (const b of bytes) n = (n << 8) | b

  // Encode as 8 Crockford base32 characters (5 bits each)
  let result = ''
  for (let i = 0; i < 8; i++) {
    result = CHARS[n & 31] + result
    n >>= 5
  }
  return result
}