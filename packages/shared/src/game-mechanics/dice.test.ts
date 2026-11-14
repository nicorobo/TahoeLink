import { describe, expect, test } from "bun:test"
import { DICE_FACES, legalShapesForDie, rollDie } from "./dice"
import type { DiceValue, Shape } from "../types"

describe("DICE_FACES", () => {
    test("has exactly 6 faces", () => {
        expect(DICE_FACES).toHaveLength(6)
    })

    test("contains all expected faces", () => {
        expect(DICE_FACES.sort()).toEqual(['I', 'L', 'O', 'SZ', 'T', 'any'])
    })
})

describe("legalShapesForDie", () => {
    test("I maps to just I", () => {
        expect(legalShapesForDie('I')).toEqual(['I'])
    })

    test("O maps to just O", () => {
        expect(legalShapesForDie('O')).toEqual(['O'])
    })

    test("T maps to just T", () => {
        expect(legalShapesForDie('T')).toEqual(['T'])
    })

    test("L maps to just L", () => {
        expect(legalShapesForDie('L')).toEqual(['L'])
    })

    test("SZ maps to S and Z", () => {
        expect(legalShapesForDie('SZ').sort()).toEqual(['S', 'Z'])
    })

    test("any maps to all 6 shapes", () => {
        expect(legalShapesForDie('any').sort()).toEqual(['I', 'L', 'O', 'S', 'T', 'Z'])
    })
})

describe("rollDie", () => {
    test("returns a valid DiceValue", () => {
        for (let i = 0; i < 100; i++) {
            const result = rollDie()
            expect(DICE_FACES).toContain(result)
        }
    })

    test("uses injectable RNG", () => {
        // Deterministic RNG that always returns 0
        const alwaysZero = () => 0
        expect(rollDie(alwaysZero)).toBe(DICE_FACES[0])

        // RNG that returns just below 1
        const almostOne = () => 0.999
        expect(rollDie(almostOne)).toBe(DICE_FACES[DICE_FACES.length - 1])
    })

    test("produces all faces with a cycling RNG", () => {
        // Deterministic RNG that cycles through values
        let call = 0
        const cycling = () => {
            const val = (call % 6) / 6
            call++
            return val + 0.001 // stay within [0,1) for indices 0-5
        }
        const results = new Set<DiceValue>()
        for (let i = 0; i < 60; i++) {
            results.add(rollDie(cycling))
        }
        // Should have seen all 6 faces
        expect(results.size).toBe(6)
    })

    test("uses Math.random by default", () => {
        const result = rollDie()
        expect(DICE_FACES).toContain(result)
    })

    test("distribution is approximately uniform over many rolls", () => {
        const counts: Record<string, number> = { I: 0, O: 0, T: 0, L: 0, SZ: 0, any: 0 }
        // Park-Miller LCG with fixed seed
        let state = 42
        const lcg = () => {
            state = (state * 16807) % 2147483647
            return (state - 1) / 2147483646.0
        }
        const N = 6000
        for (let i = 0; i < N; i++) {
            const face = rollDie(lcg)
            counts[face]!++
        }
        // Expected: N/6 = 1000 per face
        // With N = 6000, expected count = 1000, standard deviation ≈ 28.9
        // Allow generous margin of 150 (≈5 sigma, p < 3e-7 per face)
        const expected = N / 6
        const margin = 150
        for (const [face, count] of Object.entries(counts)) {
            expect(Math.abs(count - expected)).toBeLessThan(margin)
        }
    })
})