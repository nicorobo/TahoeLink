import type { Board, Shape } from "../types"
import { shapes } from "./shapes"
import { getLegalColumns } from "./board"
import { findGroups } from "./scoring"
import { TIE_BREAKER_LIMIT } from "../constants"
import type { PlayerScore } from "./scoring"

/**
 * Per-player piece supply: how many copies of each shape each player has remaining.
 * Keyed by player ID (0–3).
 */
export type PieceSupply = Record<number, Record<Shape, number>>

const ALL_SHAPES: Shape[] = ['L', 'O', 'T', 'I', 'S', 'Z']
const PIECES_PER_SHAPE = 5
const INITIAL_SUPPLY_ENTRY: Record<Shape, number> = {
    L: PIECES_PER_SHAPE,
    O: PIECES_PER_SHAPE,
    T: PIECES_PER_SHAPE,
    I: PIECES_PER_SHAPE,
    S: PIECES_PER_SHAPE,
    Z: PIECES_PER_SHAPE,
}

/**
 * Create the initial piece supply for a game.
 *
 * Each player starts with 5 copies of each of the 6 shapes (30 pieces per player).
 *
 * In 2‑player shared‑colour mode (`sharedColor = true`), both players share one
 * 30‑piece pool. The returned record still has entries for both player IDs, but
 * both entries reference the *same* underlying supply object, so decrementing one
 * automatically decrements the other.
 *
 * @param playerCount - Number of players (2–4).
 * @param sharedColor - If true (and playerCount === 2), use a single shared supply.
 * @returns A record mapping player ID (1‑based) to piece supply.
 */
export function createPieceSupply(
    playerCount: number,
    sharedColor: boolean = false,
): PieceSupply {
    if (sharedColor && playerCount !== 2) {
        throw new Error('Shared colour mode is only supported for 2 players')
    }

    const supply: PieceSupply = {}
    for (let i = 1; i <= playerCount; i++) {
        supply[i] = { ...INITIAL_SUPPLY_ENTRY }
    }

    if (sharedColor) {
        // Both players share the same object instance
        const shared = { ...INITIAL_SUPPLY_ENTRY }
        supply[1] = shared
        supply[2] = shared
    }

    return supply
}

/**
 * Check whether any player can legally move.
 *
 * A player can move if they have at least one remaining piece of any shape
 * that can be placed in some column of the board in any orientation.
 *
 * @param board - The current board state.
 * @param piecesRemaining - Per-player piece supplies.
 * @returns True if at least one legal placement exists for any player with pieces left.
 */
export function canMove(
    board: Board,
    piecesRemaining: PieceSupply,
): boolean {
    for (const [playerIdStr, supply] of Object.entries(piecesRemaining)) {
        for (const shapeName of ALL_SHAPES) {
            if ((supply[shapeName] ?? 0) <= 0) continue

            const shapeData = shapes[shapeName]
            for (const rotationGroup of shapeData) {
                for (const orientation of rotationGroup) {
                    const columns = getLegalColumns(board, orientation)
                    if (columns.length > 0) return true
                }
            }
        }
    }
    return false
}

/**
 * Return true if the game is over.
 *
 * The game is over when no player can place any piece (the tower is full) or
 * no player has pieces remaining.
 */
export function isGameOver(
    board: Board,
    piecesRemaining: PieceSupply,
): boolean {
    return !canMove(board, piecesRemaining)
}

/**
 * Result of determining the winner.
 */
export interface WinnerResult {
    /** The winning player ID (1‑based). */
    playerId: number
    /**
     * If the winner was decided by a tie‑breaker, describes which rule was used.
     * Undefined when the winner had a strictly higher score.
     */
    tieBrokenBy?: string
}

/**
 * Determine the winner of a finished game.
 *
 * The player with the highest score wins. If two or more players are tied on
 * score, the tie is broken by the **largest connected component** — i.e. the
 * player whose biggest orthogonally‑adjacent group of same‑coloured cells is
 * largest wins.
 *
 * If the tie cannot be broken (identical scores and identical largest group
 * sizes), returns `TIE_BREAKER_LIMIT` (which is `-1`).
 *
 * @param scores - Per-player scores (from `scoreBoard` or `scoreTurn`).
 * @param board  - The final board state (needed for tie‑breaker).
 * @returns The winner, or `TIE_BREAKER_LIMIT` if the tie is unbreakable.
 */
export function getWinner(
    scores: Record<number, PlayerScore>,
    board: Board,
): WinnerResult | typeof TIE_BREAKER_LIMIT {
    const playerIds = Object.keys(scores).map(Number)
    if (playerIds.length === 0) return TIE_BREAKER_LIMIT

    // Find the highest score
    let maxScore = -Infinity
    for (const id of playerIds) {
        const s = scores[id]?.score ?? 0
        if (s > maxScore) maxScore = s
    }

    const tiedLeaders = playerIds.filter(id => (scores[id]?.score ?? 0) === maxScore)

    if (tiedLeaders.length === 1) {
        return { playerId: tiedLeaders[0]! }
    }

    // Tie‑breaker: largest connected component
    const groupsByOwner = findGroups(board)
    let maxGroupSize = -1
    let bestPlayer = -1
    let unique = true

    for (const id of tiedLeaders) {
        const groups = groupsByOwner.get(id) ?? []
        let largest = 0
        for (const group of groups) {
            if (group.size > largest) largest = group.size
        }
        if (largest > maxGroupSize) {
            maxGroupSize = largest
            bestPlayer = id
            unique = true
        } else if (largest === maxGroupSize) {
            unique = false
        }
    }

    if (!unique || bestPlayer < 0) {
        return TIE_BREAKER_LIMIT
    }

    return {
        playerId: bestPlayer,
        tieBrokenBy: 'largest connected component',
    }
}