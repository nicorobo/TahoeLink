export const BOARD_HEIGHT = 10
export const BOARD_WIDTH = 10
export const MAX_PLAYERS = 4
export const MIN_PLAYERS = 2

/**
 * Multiplier used to encode (owner, turn) into a single cell value:
 *   cell = owner * CELL_OWNER_MULTIPLIER + turn
 *   owner = Math.floor(cell / CELL_OWNER_MULTIPLIER)
 *   turn = cell % CELL_OWNER_MULTIPLIER
 *
 * Chosen as 1000 so that up to 999 turns per player fit without overflow.
 */
export const CELL_OWNER_MULTIPLIER = 1000

/**
 * Sentinal value returned by getWinner when a tie cannot be broken
 * (all tied players have the same largest connected component size).
 */
export const TIE_BREAKER_LIMIT = -1