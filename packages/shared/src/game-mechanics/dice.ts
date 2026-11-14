import type { DiceValue, Shape } from "../types"

/**
 * The 6 faces of the Tetris Link die.
 * - I, O, T, L: each one face
 * - SZ: combined S/Z face (player may play S or Z)
 * - any: TETRIS LINK wild face (player may play any shape)
 */
export const DICE_FACES: DiceValue[] = ['I', 'O', 'T', 'L', 'SZ', 'any']

/**
 * Map a die face to the list of playable shapes.
 * - Most faces map to a single shape.
 * - 'SZ' maps to both 'S' and 'Z' (player chooses).
 * - 'any' (TETRIS LINK) maps to all 6 shapes.
 */
export function legalShapesForDie(die: DiceValue): Shape[] {
    switch (die) {
        case 'I': return ['I']
        case 'O': return ['O']
        case 'T': return ['T']
        case 'L': return ['L']
        case 'SZ': return ['S', 'Z']
        case 'any': return ['L', 'O', 'T', 'I', 'S', 'Z']
    }
}

/**
 * Roll the die with an injectable RNG.
 *
 * @param rng - A function that returns a float in [0, 1), e.g. `Math.random`
 * @returns The rolled DiceValue from the 6 faces.
 *
 * Distribution: each of the 6 faces has equal probability (1/6).
 */
export function rollDie(rng: () => number = Math.random): DiceValue {
    const index = Math.floor(rng() * DICE_FACES.length)
    return DICE_FACES[index]!
}