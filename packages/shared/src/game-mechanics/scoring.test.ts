import { describe, expect, test } from "bun:test"
import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants"
import { getDefaultBoard } from "./board"
import { scoreBoard, scoreTurn } from "./scoring"
import type { Board } from "../types"
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
                board[x]![y] = parseInt(ch, 10)
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
        board[0]![9] = 1
        const scores = scoreBoard(board)
        expect(scores).toEqual({})
    })

    test("group of 2 does not score", () => {
        // Two adjacent cells, same owner
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[0]![8] = 1
        const scores = scoreBoard(board)
        expect(scores).toEqual({})
    })

    test("group of 3 scores +3", () => {
        // Three cells in a vertical line (first 3 pieces = 1 each = 3 total)
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[0]![8] = 1
        board[0]![7] = 1
        const scores = scoreBoard(board)
        expect(scores[1]).toEqual(ps(3, "0,7", "0,8", "0,9"))
    })

    test("group of 4 scores +4", () => {
        // Four cells in a vertical line
        const board = getDefaultBoard()
        for (let y = 6; y <= 9; y++) {
            board[0]![y] = 1
        }
        const scores = scoreBoard(board)
        expect(scores[1]).toEqual(ps(4, "0,6", "0,7", "0,8", "0,9"))
    })

    test("multiple separate groups for same player, each 3+ scores all cells", () => {
        // Two groups of 3, separated by empty column
        const board = getDefaultBoard()
        // Group 1: column 0, rows 7-9
        board[0]![7] = 1
        board[0]![8] = 1
        board[0]![9] = 1
        // Group 2: column 3, rows 7-9
        board[3]![7] = 1
        board[3]![8] = 1
        board[3]![9] = 1
        const scores = scoreBoard(board)
        // Both groups scored: 3 + 3 = 6
        expect(scores[1]!.score).toBe(6)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,7", "0,8", "0,9", "3,7", "3,8", "3,9"])
    })

    test("groups of 2 and 3: only the 3 scores", () => {
        const board = getDefaultBoard()
        // Group of 2
        board[0]![9] = 1
        board[0]![8] = 1
        // Group of 3
        board[3]![7] = 1
        board[3]![8] = 1
        board[3]![9] = 1
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(3)
    })

    test("multiple players score independently", () => {
        // Player 1 group of 3, Player 2 group of 3
        const board = getDefaultBoard()
        board[0]![7] = 1
        board[0]![8] = 1
        board[0]![9] = 1
        board[2]![7] = 2
        board[2]![8] = 2
        board[2]![9] = 2
        const scores = scoreBoard(board)
        expect(scores[1]?.score).toBe(3)
        expect(scores[2]?.score).toBe(3)
    })

    test("only counts unscored cells when previousScores provided", () => {
        // Group of 3 already scored
        const board = getDefaultBoard()
        board[0]![7] = 1
        board[0]![8] = 1
        board[0]![9] = 1
        // Add a 4th cell adjacent
        board[1]![9] = 1

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
        board[0]![9] = 1
        board[1]![9] = 1
        // Group B: columns 3-4 at row 9
        board[3]![9] = 1
        board[4]![9] = 1
        // Bridge: column 2 at row 9 connects them
        board[2]![9] = 1
        // Now one group of 5. None scored before.
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(5)
    })

    test("merging scored + unscored: only unscored cells score", () => {
        // Scored group of 3 at columns 0-2 row 9, plus unscored group of 2 at columns 4-5 row 9
        // Bridge at column 3 row 9 makes one group of 6
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[1]![9] = 1
        board[2]![9] = 1
        board[4]![9] = 1
        board[5]![9] = 1
        board[3]![9] = 1 // bridge

        const previousScores = { 1: ps(3, "0,9", "1,9", "2,9") }
        const scores = scoreBoard(board, previousScores)
        // New cells: columns 3, 4, 5 at row 9 → 3 cells → +3
        expect(scores[1]!.score).toBe(6)
        expect(scores[1]!.scoredCells.sort()).toEqual(["0,9", "1,9", "2,9", "3,9", "4,9", "5,9"])
    })

    test("diagonal adjacency does NOT count", () => {
        // Two cells diagonally adjacent: (0,9) and (1,8)
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[1]![8] = 1
        const scores = scoreBoard(board)
        // Each is a group of 1 (not 3+), so no scoring
        expect(scores).toEqual({})
    })

    test("orthogonal adjacency with gap does not connect", () => {
        // Cells at (0,9), (0,7) — not connected, gap at (0,8)
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[0]![7] = 1
        const scores = scoreBoard(board)
        // Two separate groups of 1 each → no scoring
        expect(scores).toEqual({})
    })

    test("L-shaped group of 3 scores", () => {
        // Cells at (0,9), (1,9), (1,8)
        const board = getDefaultBoard()
        board[0]![9] = 1
        board[1]![8] = 1
        board[1]![9] = 1
        const scores = scoreBoard(board)
        expect(scores[1]!.score).toBe(3)
    })

    test("preserves other players' scores when only one player scores", () => {
        const board = getDefaultBoard()
        board[0]![9] = 1 // player 1, group of 1 (no score)
        board[5]![8] = 2
        board[5]![9] = 2
        board[6]![8] = 2
        board[6]![9] = 2 // player 2, 2×2 block = group of 4

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
        board[0]![8] = 1  // cell, (0,9) is empty → gap

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
        board[0]![8] = 1  // gap at (0,9)
        board[2]![8] = 1  // gap at (2,9)
        board[4]![8] = 1  // gap at (4,9)

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
        board[0]![9] = 1
        board[1]![9] = 1
        board[2]![9] = 1
        board[0]![7] = 1 // overhang with gap at (0,8)

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
        board[0]![7] = 1
        board[0]![8] = 1
        board[0]![9] = 1
        const previousScores = { 1: ps(3, "0,7", "0,8", "0,9") }

        // Add a new cell at (1,9) adjacent to the group
        board[1]![9] = 1
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
        board[0]![9] = 1
        board[1]![9] = 1
        board[2]![9] = 1 // group of 3

        const placedCells: Array<[number, number]> = [[2, 9]]
        const result = scoreTurn(board, placedCells, 1)
        // Group of 3 → +3, no gaps → 0 penalty
        expect(result.delta).toBe(3)
    })

    test("delta can be positive when gaps exist but links outweigh", () => {
        // Scenario: existing cell at (0,7), new T piece creates group of 5 but with 2 gaps
        const board = getDefaultBoard()
        board[0]![7] = 1  // existing solo cell
        board[0]![6] = 1  // new, connects to (0,7)
        board[1]![6] = 1  // new, connects to (0,6) and (1,7)
        board[1]![7] = 1  // new, connects
        board[2]![6] = 1  // new, connects to (1,6)

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
            board[x]![9] = 1
        }
        // Place cells directly on top — no gaps
        board[0]![8] = 1
        board[1]![8] = 1
        board[2]![8] = 2
        board[3]![8] = 2

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
        board[0]![9] = 1
        board[1]![9] = 2  // different owner, no link, but still no gap
        board[2]![9] = 1
        board[3]![9] = 2
        // Place cells on top
        board[0]![8] = 1
        board[2]![8] = 1

        const placedCells: Array<[number, number]> = [[0,8],[2,8]]
        const result = scoreTurn(board, placedCells, 1)

        // Player 1 cells: (0,9)+(0,8) = group of 2 → no scoring
        //                (2,9)+(2,8) = group of 2 → no scoring
        // (0,8) group and (2,8) group not connected (cell at (1,9) is player 2)
        // No gaps
        expect(result.delta).toBe(0)
        expect(result.scores).toEqual({})
    })
})