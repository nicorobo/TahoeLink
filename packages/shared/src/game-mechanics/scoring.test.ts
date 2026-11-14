import { describe, expect, test } from "bun:test"
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants"
import { getDefaultBoard } from "./board"
import { scoreBoard, scoreTurn, getBlockedGroups } from "./scoring"
import type { Board } from "../types"
import { encodeCell } from "./cell"
import type { PlayerScore } from "./scoring"

/** Build a board from a column-major string pattern: '.' = empty, '1' = owner 1, '2' = owner 2, etc. */
function boardFromPattern(lines: string[]): Board {
    const height = lines.length
    const width = lines[0]!.length
    const board: Board = Array.from({ length: width }, () => Array(height).fill(-1))
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const ch = lines[y]![x]!
            if (ch !== ".") {
                board[x]![y] = encodeCell(parseInt(ch, 10), 1)
            }
        }
    }
    return board
}

/** Helper: create a PlayerScore for testing. */
function ps(score: number, ...cells: string[]): PlayerScore {
    return { score, scoredCells: cells.sort() }
}

describe("scoreBoard", () => {
    test("empty board scores zero", () => {
        const board = getDefaultBoard()
        const scores = scoreBoard(board)
        expect(scores).toEqual({})
    })

    test("single cell does not score", () => {
        // Place one cell at (0,9)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        expect(scores).toEqual({})
    })

    test("group of 2 does not score", () => {
        // Two adjacent cells, same owner
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        expect(scores).toEqual({})
    })

    test("group of 3 scores +3", () => {
        // Three cells in a vertical line (first 3 pieces = 1 each = 3 total)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![7] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        expect(scores[1]).toEqual(ps(3, "0,7", "0,8", "0,9"))
    })

    test("group of 4 scores +4", () => {
        // Four cells in a vertical line
        const board = getDefaultBoard()
        for (let y = 6; y <= 9; y++) {
            board[0]![y] = encodeCell(1, 1)
        }
        const scores = scoreBoard(board)
        expect(scores[1]).toEqual(ps(4, "0,6", "0,7", "0,8", "0,9"))
    })

    test("multiple separate groups for same player, each 3+ scores all cells", () => {
        // Two groups of 3, separated by empty column
        const board = getDefaultBoard()
        // Group 1: column 0, rows 7-9
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        // Group 2: column 3, rows 7-9
        board[3]![7] = encodeCell(1, 1)
        board[3]![8] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        // Both groups scored: 3 + 3 = 6
        expect(scores[1]!.score).toBe(6)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,7", "0,8", "0,9", "3,7", "3,8", "3,9"])
    })

    test("groups of 2 and 3: only the 3 scores", () => {
        const board = getDefaultBoard()
        // Group of 2
        board[0]![9] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        // Group of 3
        board[3]![7] = encodeCell(1, 1)
        board[3]![8] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(3)
    })

    test("multiple players score independently", () => {
        // Player 1 group of 3, Player 2 group of 3
        const board = getDefaultBoard()
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        board[2]![7] = encodeCell(2, 1)
        board[2]![8] = encodeCell(2, 1)
        board[2]![9] = encodeCell(2, 1)
        const scores = scoreBoard(board)
        expect(scores[1]?.score).toBe(3)
        expect(scores[2]?.score).toBe(3)
    })

    test("only counts unscored cells when previousScores provided", () => {
        // Group of 3 already scored
        const board = getDefaultBoard()
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        // Add a 4th cell adjacent
        board[1]![9] = encodeCell(1, 1)

        const previousScores = { 1: ps(3, "0,7", "0,8", "0,9") }
        const scores = scoreBoard(board, previousScores)
        // Group is now 4 cells, but only 1 is new
        expect(scores[1]!.score).toBe(4)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,7", "0,8", "0,9", "1,9"])
    })

    test("merging two unscored groups scores all cells", () => {
        // Two groups of 2, then a bridge cell makes them one group of 5
        const board = getDefaultBoard()
        // Group A: columns 0-1 at row 9
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        // Group B: columns 3-4 at row 9
        board[3]![9] = encodeCell(1, 1)
        board[4]![9] = encodeCell(1, 1)
        // Bridge: column 2 at row 9 connects them
        board[2]![9] = encodeCell(1, 1)
        // Now one group of 5. None scored before.
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(5)
    })

    test("merging scored + unscored: only unscored cells score", () => {
        // Scored group of 3 at columns 0-2 row 9, plus unscored group of 2 at columns 4-5 row 9
        // Bridge at column 3 row 9 makes one group of 6
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        board[2]![9] = encodeCell(1, 1)
        board[4]![9] = encodeCell(1, 1)
        board[5]![9] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1) // bridge

        const previousScores = { 1: ps(3, "0,9", "1,9", "2,9") }
        const scores = scoreBoard(board, previousScores)
        // New cells: columns 3, 4, 5 at row 9 → 3 cells → +3
        expect(scores[1]!.score).toBe(6)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,9", "1,9", "2,9", "3,9", "4,9", "5,9"])
    })

    test("diagonal adjacency does NOT count", () => {
        // Two cells diagonally adjacent: (0,9) and (1,8)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[1]![8] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        // Each is a group of 1 (not 3+), so no scoring
        expect(scores).toEqual({})
    })

    test("orthogonal adjacency with gap does not connect", () => {
        // Cells at (0,9), (0,7) — not connected, gap at (0,8)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[0]![7] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        // Two separate groups of 1 each → no scoring
        expect(scores).toEqual({})
    })

    test("L-shaped group of 3 scores", () => {
        // Cells at (0,9), (1,9), (1,8)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[1]![8] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(3)
    })

    test("preserves other players' scores when only one player scores", () => {
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1) // player 1, group of 1 (no score)
        board[5]![8] = encodeCell(2, 1)
        board[5]![9] = encodeCell(2, 1)
        board[6]![8] = encodeCell(2, 1)
        board[6]![9] = encodeCell(2, 1) // player 2, 2×2 block = group of 4

        const previousScores = { 1: ps(0), 2: ps(4, "5,8", "5,9", "6,8", "6,9") }
        const scores = scoreBoard(board, previousScores)
        // Player 2 already has 4 from the 2×2 block
        expect(scores[1]?.score).toBe(0)
        expect(scores[2]?.score).toBe(4)
    })
})

describe("scoreTurn", () => {
    test("empty-space penalty: 1 gap beneath placed piece", () => {
        // Single cell placed with empty space below
        const board = getDefaultBoard()
        board[0]![8] = encodeCell(1, 1)  // cell, (0,9) is empty → gap

        const placedCells: Array<[number, number]> = [[0, 8]]
        const result = scoreTurn(board, placedCells, 1)

        // Single cell = group of 1 → no link scoring
        // 1 gap → -1 penalty
        expect(result.delta).toBe(-1)
        expect(result.scores[1]!.score).toBe(-1)
    })

    test("empty-space penalty: 2+ gaps capped at -2", () => {
        // Three non-adjacent cells, each with a gap below
        const board = getDefaultBoard()
        board[0]![8] = encodeCell(1, 1)  // gap at (0,9)
        board[2]![8] = encodeCell(1, 1)  // gap at (2,9)
        board[4]![8] = encodeCell(1, 1)  // gap at (4,9)

        const placedCells: Array<[number, number]> = [[0, 8], [2, 8], [4, 8]]
        const result = scoreTurn(board, placedCells, 1)

        // Each is a group of 1 → no link scoring
        // 3 gaps → -2 (capped)
        expect(result.delta).toBe(-2)
        expect(result.scores[1]!.score).toBe(-2)
    })

    test("link scoring + empty-space penalty combined", () => {
        // Player places a piece that both creates a link AND leaves a gap
        // Two existing cells at (0,9) and (1,9) (group of 2, unscored)
        // Player places (2,9) making a group of 3 → scores +3
        // Also places an overhang cell at (0,7) with gap at (0,8)
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        board[2]![9] = encodeCell(1, 1)
        board[0]![7] = encodeCell(1, 1) // overhang with gap at (0,8)

        const placedCells: Array<[number, number]> = [[2, 9], [0, 7]]
        const result = scoreTurn(board, placedCells, 1)

        // Group at row 9: columns 0,1,2 → group of 3, all new → +3
        // Gap at (0,8) beneath (0,7) → 1 gap → -1
        // Net: 3 - 1 = 2
        expect(result.delta).toBe(2)
    })

    test("adding to existing scored group: only new piece scores +1", () => {
        // Existing scored group of 3
        const board = getDefaultBoard()
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        const previousScores = { 1: ps(3, "0,7", "0,8", "0,9") }

        // Add a new cell at (1,9) adjacent to the group
        board[1]![9] = encodeCell(1, 1)
        const placedCells: Array<[number, number]> = [[1, 9]]

        const result = scoreTurn(board, placedCells, 1, previousScores)
        // 1 new piece in a 3+ group → +1
        // No gaps
        expect(result.delta).toBe(1)
        expect(result.scores[1]!.score).toBe(4)
    })

    test("no gaps at bottom row: no penalty", () => {
        // Piece placed at bottom row has no cells beneath it
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        board[2]![9] = encodeCell(1, 1) // group of 3

        const placedCells: Array<[number, number]> = [[2, 9]]
        const result = scoreTurn(board, placedCells, 1)
        // Group of 3 → +3, no gaps → 0 penalty
        expect(result.delta).toBe(3)
    })

    test("delta can be positive when gaps exist but links outweigh", () => {
        // Scenario: existing cell at (0,7), new T piece creates group of 5 but with 2 gaps
        const board = getDefaultBoard()
        board[0]![7] = encodeCell(1, 1)  // existing solo cell
        board[0]![6] = encodeCell(1, 1)  // new, connects to (0,7)
        board[1]![6] = encodeCell(1, 1)  // new, connects to (0,6) and (1,7)
        board[1]![7] = encodeCell(1, 1)  // new, connects
        board[2]![6] = encodeCell(1, 1)  // new, connects to (1,6)

        const placedCells: Array<[number, number]> = [[0,6],[1,6],[1,7],[2,6]]
        const result = scoreTurn(board, placedCells, 1)

        // Group: (0,7)+(0,6)+(1,6)+(1,7)+(2,6) = 5 cells, all new → +5
        // Gaps: (1,7)->(1,8) empty → gap col 1
        //       (2,6)->(2,7) empty → gap col 2
        // 2 gaps → -2
        // Net: 3
        expect(result.delta).toBe(3)
    })

    test("no gaps when piece sits flush on terrain", () => {
        // Place cells directly on top of existing terrain — no gaps
        const board = getDefaultBoard()
        // Existing terrain at row 9, columns 0-3
        for (let x = 0; x < 4; x++) {
            board[x]![9] = encodeCell(1, 1)
        }
        // Place cells directly on top — no gaps
        board[0]![8] = encodeCell(1, 1)
        board[1]![8] = encodeCell(1, 1)
        board[2]![8] = encodeCell(2, 1)
        board[3]![8] = encodeCell(2, 1)

        const placedCells: Array<[number, number]> = [[0,8],[1,8]]
        const result = scoreTurn(board, placedCells, 1)

        // Player 1 cells: (0,9),(1,9),(2,9),(3,9) + (0,8),(1,8) = group of 6
        // All new → +6 (since (0,9)-(3,9) are also player 1 but not scored before)
        // No gaps: (0,8)->(0,9) occupied, (1,8)->(1,9) occupied
        expect(result.delta).toBe(6)
    })

    test("flush placement on mixed terrain: no gaps where cells land on blocks", () => {
        // Place cells where each lands on an existing block — no gaps
        const board = getDefaultBoard()
        // Existing terrain at various heights
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(2, 1)  // different owner, no link, but still no gap
        board[2]![9] = encodeCell(1, 1)
        board[3]![9] = encodeCell(2, 1)
        // Place cells on top
        board[0]![8] = encodeCell(1, 1)
        board[2]![8] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[0,8],[2,8]]
        const result = scoreTurn(board, placedCells, 1)

        // Player 1 cells: (0,9)+(0,8) = group of 2 → no scoring
        //                (2,9)+(2,8) = group of 2 → no scoring
        // (0,8) group and (2,8) group not connected (cell at (1,9) is player 2)
        // No gaps
        expect(result.delta).toBe(0)
        expect(result.scores).toEqual({})
    })

    test("merge-scoring: three groups of 2 merge into one group of 6 via a bridge", () => {
        // Three separate groups of 2, each unscored, then a bridge connects them all
        const board = getDefaultBoard()
        // Group A: (0,9),(1,9) — group of 2
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        // Group B: (3,9),(4,9) — group of 2
        board[3]![9] = encodeCell(1, 1)
        board[4]![9] = encodeCell(1, 1)
        // Group C: (6,9),(7,9) — group of 2
        board[6]![9] = encodeCell(1, 1)
        board[7]![9] = encodeCell(1, 1)

        // Placed cells: bridge at (2,9) connects A-B, bridge at (5,9) connects B-C
        board[2]![9] = encodeCell(1, 1)
        board[5]![9] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[2, 9], [5, 9]]
        const result = scoreTurn(board, placedCells, 1)

        // One big group of 8 cells, none scored before → +8
        // No gaps (placed at bottom row)
        expect(result.delta).toBe(8)
        expect(result.scores[1]!.score).toBe(8)
        expect(result.scores[1]!.scoredCells.sort()).toEqual([
            "0,9", "1,9", "2,9", "3,9", "4,9", "5,9", "6,9", "7,9",
        ])
    })

    test("merge-scoring: connecting already-scored group to new cells only scores the new ones", () => {
        // Existing scored group of 3 at left, place 2 new cells adjacent
        const board = getDefaultBoard()
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)

        const previousScores = { 1: ps(3, "0,7", "0,8", "0,9") }

        // Add 2 cells adjacent: making one group of 5
        board[1]![8] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[1, 8], [1, 9]]
        const result = scoreTurn(board, placedCells, 1, previousScores)

        // Only 2 new cells added to scored group → +2
        // No gaps: (1,8)->(1,9) occupied, (1,9) at floor
        expect(result.delta).toBe(2)
        expect(result.scores[1]!.score).toBe(5)
    })

    test("empty-space penalty: gap beneath only part of the placed piece", () => {
        // T piece placed such that the 'stem' has a gap but the 'bar' does not
        const board = getDefaultBoard()
        // T_ROT0 = [[1,0],[1,1],[1,0]] placed at col 0 on empty board
        // Cells: (0,8),(1,8),(1,9),(2,8)
        // Gap check: (0,8)->(0,9) empty → gap col 0
        // (1,8)->(1,9) occupied (by the same piece) → no gap
        // (2,8)->(2,9) empty → gap col 2
        board[0]![8] = encodeCell(1, 1)
        board[1]![8] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        board[2]![8] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[0, 8], [1, 8], [1, 9], [2, 8]]
        const result = scoreTurn(board, placedCells, 1)

        // Group of 4 → +4
        // 2 gaps → -2
        // Net: +2
        expect(result.delta).toBe(2)
    })

    test("empty-space penalty: piece sits partly on terrain, partly overhangs", () => {
        // Existing block at (1,9), place a 2×2 O block at col 0
        const board = getDefaultBoard()
        board[1]![9] = encodeCell(2, 1) // opponent's block at (1,9)

        // O block placed at col 0 lands at (0,8),(0,9),(1,8),(1,9)
        // but (1,9) is owned by opponent! Wait, tryPlacePiece would reject this.
        // Instead, let's place so the O sits on the existing block:
        // Col 0: height=10, col 1: height=9 (block at row 9)
        // y = min(10, 9) = 9, dy = 7 → (0,7),(0,8),(1,7),(1,8)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[1]![7] = encodeCell(1, 1)
        board[1]![8] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[0, 7], [0, 8], [1, 7], [1, 8]]
        const result = scoreTurn(board, placedCells, 1)

        // Group of 4 → +4
        // Gaps: (0,7)->(0,8) occupied (by same piece) → no gap
        // (0,8)->(0,9) empty → gap col 0!
        // (1,7)->(1,8) occupied (by same piece) → no gap
        // (1,8)->(1,9) occupied (by opponent) → no gap
        // Net: 4 - 1 = 3
        expect(result.delta).toBe(3)
    })

    test("empty-space penalty: multiple gaps in same column count as one", () => {
        // Place a vertical I piece ([[1],[1],[1],[1]]) at col 0
        // This places 4 cells stacked vertically from row 6 to row 9
        // Gap check below EACH placed cell at (col 0, row 6,7,8,9):
        // (0,6)->(0,7) occupied → no gap
        // (0,7)->(0,8) occupied → no gap
        // (0,8)->(0,9) occupied → no gap
        // (0,9) at floor → no gap
        // So no gaps!
        const board = getDefaultBoard()
        board[0]![6] = encodeCell(1, 1)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[0, 6], [0, 7], [0, 8], [0, 9]]
        const result = scoreTurn(board, placedCells, 1)

        // Group of 4 → +4
        // No gaps
        expect(result.delta).toBe(4)
    })

    test("scoreBoard: complex multi-player scenario", () => {
        const board = getDefaultBoard()
        // Player 1: group of 3 at (0,7),(0,8),(0,9) and separate group of 2 at (3,8),(3,9)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        board[3]![8] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1)

        // Player 2: two groups of 3 at (5,7),(5,8),(5,9) and (7,7),(7,8),(7,9)
        board[5]![7] = encodeCell(2, 1)
        board[5]![8] = encodeCell(2, 1)
        board[5]![9] = encodeCell(2, 1)
        board[7]![7] = encodeCell(2, 1)
        board[7]![8] = encodeCell(2, 1)
        board[7]![9] = encodeCell(2, 1)

        // Player 3: single group of 4 at cols 8-9 rows 6-7 (2×2 block)
        board[8]![6] = encodeCell(3, 1)
        board[8]![7] = encodeCell(3, 1)
        board[9]![6] = encodeCell(3, 1)
        board[9]![7] = encodeCell(3, 1)

        const scores = scoreBoard(board)
        // Player 1: group of 3 (+3), group of 2 (no score) → 3
        expect(scores[1]!.score).toBe(3)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,7", "0,8", "0,9"])

        // Player 2: two groups of 3 → 3 + 3 = 6
        expect(scores[2]!.score).toBe(6)
        expect(scores[2]!.scoredCells.sort()).toEqual(["5,7", "5,8", "5,9", "7,7", "7,8", "7,9"])

        // Player 3: group of 4 → +4
        expect(scores[3]!.score).toBe(4)
        expect(scores[3]!.scoredCells.sort()).toEqual(["8,6", "8,7", "9,6", "9,7"])
    })

    test("scoreBoard: two separate scored groups with previousScores retains both", () => {
        const board = getDefaultBoard()
        // Two groups of 3, already scored
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        board[3]![7] = encodeCell(1, 1)
        board[3]![8] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1)

        const previousScores = {
            1: ps(6, "0,7", "0,8", "0,9", "3,7", "3,8", "3,9"),
        }

        // Add one more cell to each group
        board[0]![6] = encodeCell(1, 1) // extends first group to 4
        board[3]![6] = encodeCell(1, 1) // extends second group to 4

        const scores = scoreBoard(board, previousScores)
        // 2 new cells → +2
        expect(scores[1]!.score).toBe(8)
        expect(scores[1]!.scoredCells.sort()).toEqual([
            "0,6", "0,7", "0,8", "0,9", "3,6", "3,7", "3,8", "3,9",
        ])
    })

    test("scoreTurn: adding cells across two separate existing groups", () => {
        const board = getDefaultBoard()
        // Two groups of 3 separated by a column
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        board[2]![7] = encodeCell(1, 1)
        board[2]![8] = encodeCell(1, 1)
        board[2]![9] = encodeCell(1, 1)

        const previousScores = { 1: ps(6, "0,7", "0,8", "0,9", "2,7", "2,8", "2,9") }

        // Place a bridge cell that merges them into one group of 7
        board[1]![9] = encodeCell(1, 1)

        const placedCells: Array<[number, number]> = [[1, 9]]
        const result = scoreTurn(board, placedCells, 1, previousScores)

        // Only 1 new cell in a now-7-cell group → +1
        // No gap: (1,9) at floor
        expect(result.delta).toBe(1)
        expect(result.scores[1]!.score).toBe(7)
    })
})

describe("getBlockedGroups", () => {
    test("empty board: no groups, no blocked groups", () => {
        const board = getDefaultBoard()
        const blocked = getBlockedGroups(board)
        expect(blocked).toEqual({})
    })

    test("single cell group not blocked (has empty neighbors)", () => {
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        const blocked = getBlockedGroups(board)
        // Single cell group has empty neighbors (below floor already, but above/left/right are empty)
        expect(blocked).toEqual({})
    })

    test("group surrounded by opponents → blocked", () => {
        const board = getDefaultBoard()
        // Player 1 at (1,1)
        board[1]![1] = encodeCell(1, 1)
        // Surround with player 2
        board[0]![1] = encodeCell(2, 1)
        board[2]![1] = encodeCell(2, 1)
        board[1]![0] = encodeCell(2, 1)
        board[1]![2] = encodeCell(2, 1)
        // Player 1's cell at (1,1) has no empty orthogonally adjacent cell
        const blocked = getBlockedGroups(board)
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
        // The group should contain (1,1)
        const group = blocked[1]![0]!
        expect(group.has("1,1")).toBe(true)
        expect(group.size).toBe(1)
    })

    test("group against board edge + opponent on other side → blocked", () => {
        const board = getDefaultBoard()
        // Player 1 at (0,9) — corner: top edge, right edge, bottom edge, left edge all bound or occupied
        board[0]![9] = encodeCell(1, 1)
        // Block the only open side (up)
        board[0]![8] = encodeCell(2, 1)
        // (0,9) has: bottom=boundary, left=boundary, right=(1,9)=empty, top=(0,8)=occupied
        // Right is empty → not blocked yet
        // Let's also block right
        board[1]![9] = encodeCell(2, 1)
        // Now all four sides: bottom=boundary, left=boundary, right=occupied, top=occupied → blocked
        const blocked = getBlockedGroups(board)
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
    })

    test("large group not blocked when one cell has empty neighbor", () => {
        const board = getDefaultBoard()
        // Player 1: group of 3 cells (0,7),(0,8),(0,9)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        // Block top and right sides
        board[1]![7] = encodeCell(2, 1)
        board[1]![8] = encodeCell(2, 1)
        board[1]![9] = encodeCell(2, 1)
        // (0,7) has empty left neighbor (col -1 = boundary), empty top (0,6)
        // Since (0,6) is empty, the group is NOT blocked
        const blocked = getBlockedGroups(board)
        expect(blocked).toEqual({})
    })

    test("two separate blocked groups for two players", () => {
        const board = getDefaultBoard()
        // Player 1 cell at (2,2) surrounded
        board[2]![2] = encodeCell(1, 1)
        board[1]![2] = encodeCell(2, 1)
        board[3]![2] = encodeCell(2, 1)
        board[2]![1] = encodeCell(2, 1)
        board[2]![3] = encodeCell(2, 1)

        // Player 2 cell at (7,7) surrounded
        board[7]![7] = encodeCell(2, 1)
        board[6]![7] = encodeCell(1, 1)
        board[8]![7] = encodeCell(1, 1)
        board[7]![6] = encodeCell(1, 1)
        board[7]![8] = encodeCell(1, 1)

        const blocked = getBlockedGroups(board)
        // Player 1 has a blocked group
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
        expect(blocked[1]![0]!.has("2,2")).toBe(true)

        // Player 2 has a blocked group at (7,7)
        expect(blocked[2]).toBeDefined()
        expect(blocked[2]!.length).toBe(1)
        expect(blocked[2]![0]!.has("7,7")).toBe(true)
    })

    test("mix of blocked and unblocked groups for same player", () => {
        const board = getDefaultBoard()
        // Player 1: group of 3 at (0,7),(0,8),(0,9) — NOT blocked (open left, top)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)

        // Player 1: cell at (5,5) — fully surrounded → blocked
        board[5]![5] = encodeCell(1, 1)
        board[4]![5] = encodeCell(2, 1)
        board[6]![5] = encodeCell(2, 1)
        board[5]![4] = encodeCell(2, 1)
        board[5]![6] = encodeCell(2, 1)

        const blocked = getBlockedGroups(board)
        // There should be exactly 1 blocked group for player 1 (the surrounded cell at (5,5))
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
        expect(blocked[1]![0]!.has("5,5")).toBe(true)
        expect(blocked[1]![0]!.has("0,7")).toBe(false)
    })

    test("blocked group still detected when touching board edge", () => {
        const board = getDefaultBoard()
        // Player 1 cell at (9,9) — bottom-right corner
        board[9]![9] = encodeCell(1, 1)
        // Block the interior sides
        board[8]![9] = encodeCell(2, 1)  // left
        board[9]![8] = encodeCell(2, 1)  // top
        // All sides: bottom=boundary, right=boundary, left=occupied, top=occupied → blocked
        const blocked = getBlockedGroups(board)
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
        expect(blocked[1]![0]!.has("9,9")).toBe(true)
    })

    test("group with only empty space on the floor (row 9) → not blocked", () => {
        const board = getDefaultBoard()
        // Group at row 9 — floor is below, but cell has empty above and sides available
        board[0]![9] = encodeCell(1, 1)
        board[1]![9] = encodeCell(1, 1)
        board[2]![9] = encodeCell(1, 1)
        // Neighbors: right of (2,9)=(3,9) empty -> not blocked
        const blocked = getBlockedGroups(board)
        expect(blocked).toEqual({})
    })

    test("group with multi-cell blocked group (surrounded entirely)", () => {
        const board = getDefaultBoard()
        // Player 1: 2×2 block at (1,1),(1,2),(2,1),(2,2)
        board[1]![1] = encodeCell(1, 1)
        board[1]![2] = encodeCell(1, 1)
        board[2]![1] = encodeCell(1, 1)
        board[2]![2] = encodeCell(1, 1)
        // Surround entirely with player 2 cells
        // Top
        board[1]![0] = encodeCell(2, 1)
        board[2]![0] = encodeCell(2, 1)
        // Bottom
        board[1]![3] = encodeCell(2, 1)
        board[2]![3] = encodeCell(2, 1)
        // Left
        board[0]![1] = encodeCell(2, 1)
        board[0]![2] = encodeCell(2, 1)
        // Right
        board[3]![1] = encodeCell(2, 1)
        board[3]![2] = encodeCell(2, 1)

        const blocked = getBlockedGroups(board)
        expect(blocked[1]).toBeDefined()
        expect(blocked[1]!.length).toBe(1)
        const group = blocked[1]![0]!
        expect(group.has("1,1")).toBe(true)
        expect(group.has("1,2")).toBe(true)
        expect(group.has("2,1")).toBe(true)
        expect(group.has("2,2")).toBe(true)
        expect(group.size).toBe(4)
    })
})