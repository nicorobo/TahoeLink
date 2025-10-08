// Each piece only has so many possible variations. They can all be precomputed, without requiring any actual rotation
// 5 pieces, each with a max of 8 orientations
const s11 = [1, 1]
const s01 = [0, 1]
const s10 = [1, 0]
const s111 = [1, 1, 1]
const s100 = [1, 0, 0]
const s001 = [0, 0, 1]
const s010 = [0, 1, 0]
const s011 = [0, 1, 1]
const s110 = [1, 1, 0]

const L = [
    [s111, s001],
    [s11, s10, s10],
    [s100, s111],
    [s01, s01, s11]
]
const O = [[s11, s11]]
const T = [
    [s10, s11, s10],
    [s010, s111],
    [s01, s11, s01],
    [s111, s010],
]
const I = [
    [[1, 1, 1, 1]],
    [[1], [1], [1], [1]]
]
const S = [
    [s10, s11, s01],
    [s011, s110],
]

const flipx = (schema: number[][]) => schema.map(row => row.toReversed())
const flipy = (schema: number[][]) => schema.toReversed()

const buildShapes = (schema: number[][][]) => {
    if (schema[0] && schema[1] && schema[2] && schema[3]) {
        return [[schema[0], flipy(schema[0])], [schema[1], flipx(schema[1])], [schema[2], flipy(schema[2])], [schema[3], flipx(schema[3])]]
    }
    if (schema[0] && schema[1]) {
        return [[schema[0], flipx(schema[0])], [schema[1], flipy(schema[1])], [schema[0], flipx(schema[0])], [schema[1], flipy(schema[1])]]
    }
    if (schema[0]) {
        return [[schema[0], schema[0]], [schema[0], schema[0]], [schema[0], schema[0]], [schema[0], schema[0]]]
    }
    throw new Error('Unhandled schema')
}

export const shapes = {
    'L': buildShapes(L),
    'O': buildShapes(O),
    'T': buildShapes(T),
    'I': buildShapes(I),
    'S': buildShapes(S),
} as const