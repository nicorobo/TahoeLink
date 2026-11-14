/**
 * Fuzz tests for the TahoeLink game engine.
 *
 * Runs seeded random games to verify invariants:
 * - No overlapping cells
 * - All games terminate
 * - Reproducible between runs
 */

import { describe, expect, test } from "bun:test"
import { BOARD_WIDTH, BOARD_HEIGHT, CELL_OWNER_MULTIPLIER } from "../constants"
import { getDefaultBoard, tryPlacePiece, getLegalColumns } from "./board"
import { shapes } from "./shapes"
import { createPieceSupply } from "./game-state"
import { getOwner } from "./cell"
import type { Board, Shape } from "../types"

// Simple LCG for deterministic random (32-bit, Park-Miller)
// Uses multiply-and-mod since JS bitwise ops are 32-bit.
function createRng(seed: number): () => number {
    let state = seed % 2147483647
    if (state <= 0) state = 1
    return () => {
        state = (state * 16807) % 2147483647
        return (state - 1) / 2147483646.0
    }
}

interface FuzzResult {
    turns: number
    error?: string
}

/** Check if any player has a legal move remaining. */
function anyMovesRemain(board: Board, supply: Record<number, Record<Shape, number>>, playerCount: number): boolean {
    const allShapes: Shape[] = ['L', 'O', 'T', 'I', 'S', 'Z']
    for (let p = 1; p <= playerCount; p++) {
        const pSupply = supply[p]!
        for (const shapeName of allShapes) {
            if (pSupply[shapeName]! <= 0) continue
            const shapeData = shapes[shapeName]
            for (const rotGroup of shapeData) {
                for (const orientation of rotGroup) {
                    if (getLegalColumns(board, orientation as unknown as number[][]).length > 0) {
                        return true
                    }
                }
            }
        }
    }
    return false
}

function runRandomGame(rng: () => number, playerCount: number = 2): FuzzResult {
    const board = getDefaultBoard()
    const supply = createPieceSupply(playerCount)
    const allShapes: Shape[] = ['L', 'O', 'T', 'I', 'S', 'Z']
    let turns = 0
    let attempts = 0
    const MAX_ATTEMPTS = 100000

    while (attempts < MAX_ATTEMPTS) {
        attempts++

        // Check if game is over
        if (!anyMovesRemain(board, supply, playerCount)) {
            return { turns }
        }

        // Pick random player, shape, orientation, column
        const playerId = 1 + Math.floor(rng() * playerCount)
        const pSupply = supply[playerId]!
        const availableShapes = allShapes.filter(s => pSupply[s]! > 0)
        if (availableShapes.length === 0) continue

        const shapeName = availableShapes[Math.floor(rng() * availableShapes.length)]!
        const shapeData = shapes[shapeName]
        const rotIdx = Math.floor(rng() * shapeData.length)
        const rotGroup = shapeData[rotIdx]!
        const flipIdx = Math.floor(rng() * rotGroup.length)
        const orientation = rotGroup[flipIdx]! as unknown as number[][]

        const legalCols = getLegalColumns(board, orientation)
        if (legalCols.length === 0) continue

        const col = legalCols[Math.floor(rng() * legalCols.length)]!
        const turnNumber = turns + 1
        const shapeId = playerId * CELL_OWNER_MULTIPLIER + turnNumber
        const result = tryPlacePiece({ board, column: col, shape: orientation, shapeId })
        if (!result) continue

        // Check: no overlap (placed cells were empty)
        for (const [cx, cy] of result.cells) {
            if (board[cx]![cy]! >= 0) {
                return { turns, error: `Overlap at (${cx},${cy})` }
            }
        }

        // Check: owner matches
        for (const [cx, cy] of result.cells) {
            const owner = getOwner(result.board[cx]![cy]!)
            if (owner !== playerId) {
                return { turns, error: `Wrong owner at (${cx},${cy})` }
            }
        }

        // Copy result to board
        for (let x = 0; x < BOARD_WIDTH; x++) {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                board[x]![y] = result.board[x]![y]
            }
        }
        supply[playerId]![shapeName]!--
        turns++
    }

    // Ran out of attempts — check if moves still remain
    if (anyMovesRemain(board, supply, playerCount)) {
        return { turns, error: "Hit attempt limit but moves remain" }
    }
    return { turns }
}

describe("fuzz — random games", () => {
    test("RNG produces values", () => {
        const rng = createRng(42)
        const v1 = rng()
        const v2 = rng()
        expect(v1).toBeGreaterThanOrEqual(0)
        expect(v1).toBeLessThan(1)
        expect(v2).not.toBe(v1)
    })

    test("RNG is reproducible", () => {
        const a = createRng(42)
        const b = createRng(42)
        for (let i = 0; i < 10; i++) {
            expect(a()).toBe(b())
        }
    })

    test("2-player game terminates from seed 42", () => {
        const rng = createRng(42)
        const result = runRandomGame(rng, 2)
        expect(result.error).toBeUndefined()
        expect(result.turns).toBeGreaterThan(0)
        expect(result.turns).toBeLessThan(500)
    }, { timeout: 5000 })

    test("2-player game terminates from seed 12345", () => {
        const rng = createRng(12345)
        const result = runRandomGame(rng, 2)
        expect(result.error).toBeUndefined()
        expect(result.turns).toBeGreaterThan(0)
        expect(result.turns).toBeLessThan(500)
    }, { timeout: 5000 })

    test("3-player game terminates from seed 42", () => {
        const rng = createRng(42)
        const result = runRandomGame(rng, 3)
        expect(result.error).toBeUndefined()
        expect(result.turns).toBeGreaterThan(0)
        expect(result.turns).toBeLessThan(1500)
    })

    test("4-player game terminates from seed 42", () => {
        const rng = createRng(42)
        const result = runRandomGame(rng, 4)
        expect(result.error).toBeUndefined()
        expect(result.turns).toBeGreaterThan(0)
        expect(result.turns).toBeLessThan(2000)
    })

    test("same seed same result", () => {
        const a = runRandomGame(createRng(99), 2)
        const b = runRandomGame(createRng(99), 2)
        expect(a.turns).toBe(b.turns)
        expect(a.error).toBe(b.error)
    })

    test("50 random 2-player games all terminate without overlaps", () => {
        const seeds = [
            1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
            53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109,
            113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179,
            181, 191, 193, 197, 199, 211, 223, 227,
        ]

        let total = 0
        let maxTurns = 0
        let errors: string[] = []

        for (const seed of seeds) {
            const result = runRandomGame(createRng(seed), 2)
            if (result.error) errors.push(`Seed ${seed}: ${result.error}`)
            total += result.turns
            maxTurns = Math.max(maxTurns, result.turns)
        }

        expect(errors).toEqual([])
        expect(maxTurns).toBeLessThan(2000)
        expect(total / seeds.length).toBeGreaterThan(5)
        expect(total / seeds.length).toBeLessThan(500)
    }, { timeout: 15000 })
})