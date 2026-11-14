import { CELL_OWNER_MULTIPLIER } from "../constants"

/**
 * Encode (owner, turn) into a single cell value.
 *   cell = owner * CELL_OWNER_MULTIPLIER + turn
 */
export function encodeCell(owner: number, turn: number): number {
    return owner * CELL_OWNER_MULTIPLIER + turn
}

/**
 * Decode the owner from a cell value.
 *   owner = Math.floor(cell / CELL_OWNER_MULTIPLIER)
 */
export function getOwner(cell: number): number {
    return Math.floor(cell / CELL_OWNER_MULTIPLIER)
}

/**
 * Decode the turn from a cell value.
 *   turn = cell % CELL_OWNER_MULTIPLIER
 */
export function getTurn(cell: number): number {
    return cell % CELL_OWNER_MULTIPLIER
}