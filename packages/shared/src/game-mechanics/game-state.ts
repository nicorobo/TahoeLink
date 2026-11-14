import type { Board, DiceValue, Shape } from "../types"
import { shapes } from "./shapes"
import { getLegalColumns } from "./board"
import { findGroups } from "./scoring"
import { legalShapesForDie } from "./dice"
import { BOARD_WIDTH, BOARD_HEIGHT, TIE_BREAKER_LIMIT } from "../constants"
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

/**
 * Result of a skip-turn check.
 */
export interface SkipTurnResult {
    skipped: boolean
    /** Human-readable reason when skipped, e.g. "no pieces remaining" or "cannot fit". */
    reason?: string
}

/**
 * Check whether the given player must skip their turn.
 *
 * A turn is skipped when:
 * - No piece of the rolled shape(s) remains in the player's supply, OR
 * - The rolled shape(s) cannot fit entirely in the tower in any orientation.
 *
 * For `SZ`, both S and Z are checked; if either can be played, the turn is not skipped.
 * For `any`, all 6 shapes are checked; if any can be played, the turn is not skipped.
 *
 * @returns `{ skipped: true, reason: "..." }` if the turn should be skipped.
 */
export function trySkipTurn({
    board,
    piecesRemaining,
    playerId,
    diceValue,
}: {
    board: Board
    piecesRemaining: PieceSupply
    playerId: number
    diceValue: DiceValue
}): SkipTurnResult {
    const shapesForDie = legalShapesForDie(diceValue)
    const pSupply = piecesRemaining[playerId]
    if (!pSupply) {
        return { skipped: true, reason: 'no pieces remaining' }
    }

    let anyHasPieces = false
    let anyCanFit = false

    for (const shapeName of shapesForDie) {
        const remaining = pSupply[shapeName] ?? 0
        if (remaining <= 0) continue
        anyHasPieces = true

        // Check if this shape can fit in any orientation
        const shapeData = shapes[shapeName]
        for (const rotationGroup of shapeData) {
            for (const orientation of rotationGroup) {
                const cols = getLegalColumns(board, orientation as unknown as number[][])
                if (cols.length > 0) {
                    anyCanFit = true
                    break
                }
            }
            if (anyCanFit) break
        }
        if (anyCanFit) break
    }

    if (!anyHasPieces) {
        return { skipped: true, reason: 'no pieces remaining' }
    }
    if (!anyCanFit) {
        return { skipped: true, reason: 'shape cannot fit' }
    }

    return { skipped: false }
}

/**
 * Detect whether the starting player has rolled S/Z on the first turn.
 *
 * If the board is completely empty (no cells placed by any player yet) and the
 * dice rolled is `'SZ'`, this returns `true` — the starting player must take the
 * empty-space penalty on their first turn, potentially starting with a negative score.
 *
 * @param board - The current board state.
 * @param _playerId - Ignored (result is game-level, not per-player).
 * @param diceValue - The rolled dice face.
 * @returns True if this is the first turn of the game and the roll is SZ.
 */
export function detectFirstTurnSZO(
    board: Board,
    _playerId: number,
    diceValue: DiceValue,
): boolean {
    if (diceValue !== 'SZ') return false

    // Check if the board is completely empty (first turn of the game)
    for (let x = 0; x < BOARD_WIDTH; x++) {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            if (board[x]![y]! >= 0) return false
        }
    }
    return true
}