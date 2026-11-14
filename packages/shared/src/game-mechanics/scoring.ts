import type { Board } from "../types"
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants"

/**
 * Score tracking for a single player.
 * `scoredCells` is an array of "x,y" keys for cells that have already contributed
 * to the player's score (ensures no piece is scored twice).
 */
export interface PlayerScore {
    score: number
    scoredCells: string[] // "x,y" keys, sorted for determinism
}

/**
 * Result of a single turn's scoring.
 * `delta` is the net score change (links gained − empty-space penalty).
 * `scores` is the full updated score state for all players.
 */
export interface TurnScoreResult {
    delta: number
    scores: Record<number, PlayerScore>
}

/**
 * Convert a set of "x,y" keys to a sorted array.
 */
function setToSortedArray(set: Set<string>): string[] {
    return [...set].sort()
}

/**
 * Convert an array of "x,y" keys to a Set for O(1) lookup.
 */
function arrayToSet(arr: string[]): Set<string> {
    return new Set(arr)
}

/**
 * Find all connected components (groups) of same-owner cells on the board.
 * Returns groups grouped by owner ID.
 */
function findGroups(board: Board): Map<number, Array<Set<string>>> {
    const visited = new Set<string>()
    const groupsByOwner = new Map<number, Array<Set<string>>>()

    for (let x = 0; x < BOARD_WIDTH; x++) {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            const key = `${x},${y}`
            if (visited.has(key)) continue

            const cell = board[x]![y]!
            if (cell < 0) {
                visited.add(key)
                continue
            }

            const owner = Math.floor(cell)
            const group = new Set<string>()

            // BFS to find all connected cells of the same owner
            const queue: Array<[number, number]> = [[x, y]]
            while (queue.length > 0) {
                const [cx, cy] = queue.shift()!
                const ck = `${cx},${cy}`
                if (visited.has(ck)) continue
                if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= BOARD_HEIGHT) continue

                const c = board[cx]![cy]!
                if (c < 0 || Math.floor(c) !== owner) continue

                visited.add(ck)
                group.add(ck)

                queue.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1])
            }

            if (group.size > 0) {
                const existing = groupsByOwner.get(owner) ?? []
                existing.push(group)
                groupsByOwner.set(owner, existing)
            }
        }
    }

    return groupsByOwner
}

/**
 * Score every player's groups on the board.
 *
 * Implements the Tetris Link scoring rules:
 * - Groups of 3+ orthogonally adjacent same-colour pieces score.
 * - First 3 pieces in a group: +1 each (+3 total).
 * - Each additional piece added to a scored group: +1.
 * - No piece is scored twice.
 *
 * Accepts optional previousScores to avoid re-scoring already-counted cells.
 *
 * @param board - The full board state (column-major).
 * @param previousScores - Previous score state per player (by owner ID).
 * @returns Updated scores for all players on the board.
 */
export function scoreBoard(
    board: Board,
    previousScores?: Record<number, PlayerScore>
): Record<number, PlayerScore> {
    const groupsByOwner = findGroups(board)
    const scores: Record<number, PlayerScore> = {}

    // Initialize scores from previousScores
    if (previousScores) {
        for (const [owner, ps] of Object.entries(previousScores)) {
            scores[Number(owner)] = { score: ps.score, scoredCells: [...ps.scoredCells] }
        }
    }

    for (const [owner, groups] of groupsByOwner) {
        const prev = scores[owner]
        const prevScoredSet = prev ? arrayToSet(prev.scoredCells) : new Set<string>()
        const scoredSet = prev ? arrayToSet(prev.scoredCells) : new Set<string>()

        let anyScored = false
        for (const group of groups) {
            if (group.size < 3) continue // Only groups of 3+ score

            // Count unscored cells in this group
            for (const cell of group) {
                if (!scoredSet.has(cell)) {
                    scoredSet.add(cell)
                    anyScored = true
                }
            }
        }

        if (anyScored || prev) {
            const newScored = scoredSet.size - prevScoredSet.size
            scores[owner] = {
                score: (prev?.score ?? 0) + newScored,
                scoredCells: setToSortedArray(scoredSet),
            }
        }
    }

    return scores
}

/**
 * Compute the score delta for a single turn after placing a piece.
 *
 * Handles:
 * - Link scoring (via scoreBoard)
 * - Empty-space penalty: −1 for 1 gap, −2 for 2+ gaps directly beneath placed cells.
 *
 * @param board - Board state AFTER the piece was placed.
 * @param placedCells - Array of [x, y] cells placed this turn.
 * @param owner - The owner ID of the player who placed the piece.
 * @param previousScores - Previous score state per player.
 * @returns The net score change and updated scores.
 */
export function scoreTurn(
    board: Board,
    placedCells: Array<[number, number]>,
    owner: number,
    previousScores?: Record<number, PlayerScore>
): TurnScoreResult {
    // 1. Compute link scoring
    const newScores = scoreBoard(board, previousScores)
    const prevScore = previousScores?.[owner]?.score ?? 0
    const linkPoints = (newScores[owner]?.score ?? 0) - prevScore

    // 2. Compute empty-space penalty
    const gapColumns = new Set<number>()
    for (const [px, py] of placedCells) {
        const belowY = py + 1
        if (belowY < BOARD_HEIGHT) {
            // Cell directly below the placed cell is empty
            if (board[px]![belowY]! < 0) {
                gapColumns.add(px) // Track unique columns with gaps
            }
        }
    }

    const gapCount = gapColumns.size
    const emptySpacePenalty = gapCount === 0 ? 0 : gapCount === 1 ? -1 : -2

    // 3. Net delta
    const delta = linkPoints + emptySpacePenalty

    // 4. Apply delta to owner's score
    if (delta !== 0) {
        newScores[owner] = {
            score: prevScore + delta,
            scoredCells: newScores[owner]?.scoredCells ?? [],
        }
    }

    return { delta, scores: newScores }
}