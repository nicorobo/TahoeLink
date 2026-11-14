import { describe, expect, test } from "bun:test"
import { encodeCell, getOwner, getTurn } from "./cell"
import { CELL_OWNER_MULTIPLIER } from "../constants"

describe("cell encoding / decoding", () => {
    test("encodeCell and getOwner are inverses for owner", () => {
        const cell = encodeCell(1, 5)
        expect(getOwner(cell)).toBe(1)
    })

    test("encodeCell and getTurn are inverses for turn", () => {
        const cell = encodeCell(2, 42)
        expect(getTurn(cell)).toBe(42)
    })

    test("getOwner / getTurn round-trip", () => {
        const owner = 3
        const turn = 999
        const cell = encodeCell(owner, turn)
        expect(getOwner(cell)).toBe(owner)
        expect(getTurn(cell)).toBe(turn)
    })

    test("player 0 is encoded correctly", () => {
        const cell = encodeCell(0, 7)
        expect(cell).toBe(7)
        expect(getOwner(cell)).toBe(0)
        expect(getTurn(cell)).toBe(7)
    })

    test("multiple owners and turns produce distinct values", () => {
        const cells = new Set<number>()
        for (let owner = 0; owner < 4; owner++) {
            for (let turn = 0; turn < 10; turn++) {
                const cell = encodeCell(owner, turn)
                expect(cells.has(cell)).toBe(false)
                cells.add(cell)
                expect(getOwner(cell)).toBe(owner)
                expect(getTurn(cell)).toBe(turn)
            }
        }
    })

    test("getOwner works for values up to turn 999", () => {
        for (let turn = 0; turn < 1000; turn++) {
            const cell = encodeCell(3, turn)
            expect(getOwner(cell)).toBe(3)
            expect(getTurn(cell)).toBe(turn)
        }
    })
})