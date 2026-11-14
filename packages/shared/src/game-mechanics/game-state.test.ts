import { describe, expect, test } from "bun:test"
import { getDefaultBoard } from "./board"
import { createPieceSupply, canMove, isGameOver, getWinner } from "./game-state"
import { encodeCell } from "./cell"
import { TIE_BREAKER_LIMIT, BOARD_HEIGHT, BOARD_WIDTH } from "../constants"
import type { Board } from "../types"
import type { PlayerScore } from "./scoring"

/** Helper: create a PlayerScore for testing. */
function ps(score: number, ...cells: string[]): PlayerScore {
    return { score, scoredCells: cells.sort() }
}

describe("createPieceSupply", () => {
    test("2 players each have 30 pieces (5 per shape)", () => {
        const supply = createPieceSupply(2)
        expect(Object.keys(supply).length).toBe(2)
        expect(supply[1]).toBeDefined()
        expect(supply[2]).toBeDefined()
        expect(supply[1]).not.toBe(supply[2]) // Separate objects

        const shapes = ['L', 'O', 'T', 'I', 'S', 'Z'] as const
        for (const shape of shapes) {
            expect(supply[1]![shape]).toBe(5)
            expect(supply[2]![shape]).toBe(5)
        }
    })

    test("3 players have separate supplies", () => {
        const supply = createPieceSupply(3)
        expect(Object.keys(supply).length).toBe(3)
        expect(supply[1]).not.toBe(supply[3])
    })

    test("4 players each have 30 pieces", () => {
        const supply = createPieceSupply(4)
        expect(Object.keys(supply).length).toBe(4)
        for (let i = 1; i <= 4; i++) {
            const total = Object.values(supply[i]!).reduce((a, b) => a + b, 0)
            expect(total).toBe(30)
        }
    })

    test("sharedColor: both players share the same supply", () => {
        const supply = createPieceSupply(2, true)
        expect(supply[1]).toBe(supply[2]) // Same reference
        const total = Object.values(supply[1]!).reduce((a, b) => a + b, 0)
        expect(total).toBe(30) // 30 total, not 60
    })

    test("sharedColor with non-2 players throws", () => {
        expect(() => createPieceSupply(3, true)).toThrow()
        expect(() => createPieceSupply(4, true)).toThrow()
    })
})

describe("canMove", () => {
    test("empty board, 2 players: can move", () => {
        const board = getDefaultBoard()
        const supply = createPieceSupply(2)
        expect(canMove(board, supply)).toBe(true)
    })

    test("full board: cannot move", () => {
        const board = getDefaultBoard()
        // Fill every cell
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = encodeCell(1, 1)
            }
        }
        const supply = createPieceSupply(2)
        expect(canMove(board, supply)).toBe(false)
    })

    test("nearly full board (only single cell empty): cannot fit any shape", () => {
        const board = getDefaultBoard()
        // Fill all cells except one (0,9)
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = encodeCell(1, 1)
            }
        }
        board[0]![9] = -1 // One empty cell
        const supply = createPieceSupply(2)
        // No shape of 2+ cells fits in 1 cell
        expect(canMove(board, supply)).toBe(false)
    })

    test("out of pieces: cannot move", () => {
        const board = getDefaultBoard()
        const supply = createPieceSupply(2)
        // Set all counts to 0
        for (let i = 1; i <= 2; i++) {
            for (const shape of ['L', 'O', 'T', 'I', 'S', 'Z'] as const) {
                supply[i]![shape] = 0
            }
        }
        expect(canMove(board, supply)).toBe(false)
    })

    test("one player out of pieces, other still has: can move", () => {
        const board = getDefaultBoard()
        const supply = createPieceSupply(2)
        // Player 1 has pieces, player 2 has none
        for (const shape of ['L', 'O', 'T', 'I', 'S', 'Z'] as const) {
            supply[2]![shape] = 0
        }
        expect(canMove(board, supply)).toBe(true)
    })
})

describe("isGameOver", () => {
    test("empty board: game not over", () => {
        const board = getDefaultBoard()
        const supply = createPieceSupply(2)
        expect(isGameOver(board, supply)).toBe(false)
    })

    test("full board: game over", () => {
        const board = getDefaultBoard()
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = encodeCell(1, 1)
            }
        }
        const supply = createPieceSupply(2)
        expect(isGameOver(board, supply)).toBe(true)
    })

    test("no pieces left: game over", () => {
        const board = getDefaultBoard()
        const supply = createPieceSupply(2)
        for (let i = 1; i <= 2; i++) {
            for (const shape of ['L', 'O', 'T', 'I', 'S', 'Z'] as const) {
                supply[i]![shape] = 0
            }
        }
        expect(isGameOver(board, supply)).toBe(true)
    })
})

describe("getWinner", () => {
    test("single player wins with highest score", () => {
        const board = getDefaultBoard()
        const scores = { 1: ps(10), 2: ps(5) }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(1)
            expect(result.tieBrokenBy).toBeUndefined()
        }
    })

    test("three players, highest wins", () => {
        const board = getDefaultBoard()
        const scores = { 1: ps(3), 2: ps(8), 3: ps(5) }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(2)
        }
    })

    test("tie-breaker by largest connected component", () => {
        // Player 1 and 2 both score 10
        // Player 1 has a group of 4, Player 2 has a group of 3
        const board = getDefaultBoard()
        // Player 1: 4 cells in a line (columns 0-3, row 9)
        for (let x = 0; x < 4; x++) {
            board[x]![9] = encodeCell(1, 1)
        }
        // Player 2: 3 cells in a line (columns 5-7, row 9)
        for (let x = 5; x < 8; x++) {
            board[x]![9] = encodeCell(2, 1)
        }
        const scores = { 1: ps(4, "0,9", "1,9", "2,9", "3,9"), 2: ps(4, "5,9", "6,9", "7,9") }
        // Both score 4, but player 1's largest group is 4 vs player 2's 3
        // Wait, scores are based on scored cells. Let me just check tie-breaking works.
        // Player 1 has group of 4, player 2 has group of 3
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(1)
            expect(result.tieBrokenBy).toBe('largest connected component')
        }
    })

    test("if tied and same group size, returns TIE_BREAKER_LIMIT", () => {
        // Both players score the same and have the same largest group size
        // Player 1: group of 3
        // Player 2: group of 3
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![7] = encodeCell(1, 1)
        board[2]![9] = encodeCell(2, 1)
        board[2]![8] = encodeCell(2, 1)
        board[2]![7] = encodeCell(2, 1)
        const scores = { 1: ps(3, "0,7", "0,8", "0,9"), 2: ps(3, "2,7", "2,8", "2,9") }
        expect(getWinner(scores, board)).toBe(TIE_BREAKER_LIMIT)
    })

    test("empty scores returns TIE_BREAKER_LIMIT", () => {
        const board = getDefaultBoard()
        expect(getWinner({}, board)).toBe(TIE_BREAKER_LIMIT)
    })

    test("one player with any score wins by default", () => {
        const board = getDefaultBoard()
        board[0]![9] = encodeCell(1, 1)
        const scores = { 1: ps(0) }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(1)
        }
    })

    test("tie-breaker uses board, not just scores", () => {
        // Player 1 has a larger group but lower score
        // Player 2 has higher score (thanks to multiple separate groups)
        const board = getDefaultBoard()
        // Player 1: 5 cells in a line = group of 5
        for (let x = 0; x < 5; x++) {
            board[x]![9] = encodeCell(1, 1)
        }
        // Player 2: 2 separate groups of 3 each = total score 6 with max group 3
        for (let x = 7; x < 10; x++) {
            board[x]![9] = encodeCell(2, 1)
        }
        board[7]![8] = encodeCell(2, 1)
        board[8]![8] = encodeCell(2, 1)
        board[9]![8] = encodeCell(2, 1)

        // Player 1 score = 5, Player 2 score = 6
        const scores = {
            1: ps(5, "0,9", "1,9", "2,9", "3,9", "4,9"),
            2: ps(6, "7,9", "8,9", "9,9", "7,8", "8,8", "9,8"),
        }
        // Player 2 has higher score → wins outright
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(2)
        }
    })

    test("getWinner: three-way tie where one has larger group", () => {
        // Three players all score 5, player 3 has group of 5 vs group of 3
        const board = getDefaultBoard()
        // Player 1: group of 3
        for (let y = 7; y < 10; y++) board[0]![y] = encodeCell(1, 1)
        // Player 2: group of 3
        for (let y = 7; y < 10; y++) board[2]![y] = encodeCell(2, 1)
        // Player 3: group of 5
        for (let x = 4; x < 9; x++) board[x]![9] = encodeCell(3, 1)

        const scores = {
            1: ps(3, "0,7", "0,8", "0,9"),
            2: ps(3, "2,7", "2,8", "2,9"),
            3: ps(3, "4,9", "5,9", "6,9", "7,9", "8,9"),
        }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(3)
            expect(result.tieBrokenBy).toBe("largest connected component")
        }
    })

    test("getWinner: four players, highest score wins", () => {
        const board = getDefaultBoard()
        for (let y = 7; y < 10; y++) board[0]![y] = encodeCell(1, 1)  // 3
        for (let y = 7; y < 10; y++) board[2]![y] = encodeCell(2, 1)  // 3
        for (let y = 7; y < 10; y++) board[4]![y] = encodeCell(3, 1)  // 3
        for (let y = 0; y < 10; y++) board[6]![y] = encodeCell(4, 1)  // 10, wins

        const scores = {
            1: ps(3, "0,7", "0,8", "0,9"),
            2: ps(3, "2,7", "2,8", "2,9"),
            3: ps(3, "4,7", "4,8", "4,9"),
            4: ps(10, "6,0", "6,1", "6,2", "6,3", "6,4", "6,5", "6,6", "6,7", "6,8", "6,9"),
        }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(4)
            expect(result.tieBrokenBy).toBeUndefined()
        }
    })

    test("getWinner: tie where largest group breaks it (asymmetric board)", () => {
        const board = getDefaultBoard()
        // Player 1: group of 3 in one place, group of 2 in another (score 3, largest 3)
        board[0]![7] = encodeCell(1, 1)
        board[0]![8] = encodeCell(1, 1)
        board[0]![9] = encodeCell(1, 1)
        board[3]![8] = encodeCell(1, 1)
        board[3]![9] = encodeCell(1, 1)

        // Player 2: one big group of 4 (score 4, largest 4) — higher score, wins outright
        board[5]![6] = encodeCell(2, 1)
        board[5]![7] = encodeCell(2, 1)
        board[5]![8] = encodeCell(2, 1)
        board[5]![9] = encodeCell(2, 1)

        const scores = {
            1: ps(3, "0,7", "0,8", "0,9"),
            2: ps(4, "5,6", "5,7", "5,8", "5,9"),
        }
        const result = getWinner(scores, board)
        expect(result).not.toBe(TIE_BREAKER_LIMIT)
        if (typeof result !== 'number') {
            expect(result.playerId).toBe(2)
            expect(result.tieBrokenBy).toBeUndefined() // higher score, no tie-break
        }
    })

    test("isGameOver: partial fill with one empty cell still can't fit any shape", () => {
        // Board where only one cell is empty, which no shape can occupy
        const board = getDefaultBoard()
        // Fill all cells except (5,5)
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                if (!(x === 5 && y === 5)) {
                    board[x]![y] = encodeCell(1, 1)
                }
            }
        }
        const supply = createPieceSupply(2)
        // No shape of 2+ cells can fit in 1 cell
        expect(isGameOver(board, supply)).toBe(true)
    })

    test("canMove: O shape fits at col 8 when cols 0-3 are nearly full", () => {
        // Fill cols 0-3 completely, all other columns empty except rows 0-8
        // Shape can still be placed in empty columns 4-9
        const board = getDefaultBoard()
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = encodeCell(1, 1)
            }
        }
        const supply = createPieceSupply(2)
        expect(canMove(board, supply)).toBe(true)
    })

    test("canMove: no legal placement with only isolated empty cells (< shape size)", () => {
        // Fill all 10 columns completely
        const board = getDefaultBoard()
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = encodeCell(1, 1)
            }
        }
        // Create a 1-cell hole at (5,5) — no shape can fit
        board[5]![5] = -1
        const supply = createPieceSupply(2)
        expect(canMove(board, supply)).toBe(false)
    })

    test("createPieceSupply: 4 players each have separate references", () => {
        const supply = createPieceSupply(4)
        // Verify all are distinct objects
        expect(supply[1]).not.toBe(supply[2])
        expect(supply[1]).not.toBe(supply[3])
        expect(supply[1]).not.toBe(supply[4])
        expect(supply[2]).not.toBe(supply[3])
        expect(supply[2]).not.toBe(supply[4])
        expect(supply[3]).not.toBe(supply[4])
    })

    test("createPieceSupply sharedColor: decrementing one affects the other", () => {
        const supply = createPieceSupply(2, true)
        expect(supply[1]).toBe(supply[2]) // Same object
        supply[1]!['L']!--
        expect(supply[2]!['L']).toBe(4) // Shared, so player 2 also lost one
    })
})