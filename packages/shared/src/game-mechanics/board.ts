import { BOARD_HEIGHT, BOARD_WIDTH } from "../constants"
import type { Board } from "../types"

export const getDefaultBoard = () =>
    Array.from({ length: BOARD_WIDTH }, () =>
        Array.from({ length: BOARD_HEIGHT }, () => -1)
    )

const gtZero = (val: number) => val > 0

/**
 * Result of a successful piece placement.
 * `board` is the new board with the piece placed.
 * `cells` is an array of [x, y] coordinates of the placed cells,
 * in left-to-right, top-to-bottom order within the shape.
 */
export interface PlacePieceResult {
    board: Board
    cells: Array<[number, number]>
}

/**
 * Attempt to place a piece on the board at the given column with gravity.
 *
 * Returns `{ board, cells }` on success, or `null` if the placement is invalid:
 * - column is out of bounds
 * - any destination cell is out of bounds
 * - any destination cell is occupied
 * - ceiling overflow (dy < 0 after gravity)
 *
 * Invariant: all columns in `shape` must have equal length.
 * The shape is column-major: `shape[x][y]` where 1 = block, 0 = empty.
 */
export function tryPlacePiece({
    board,
    column,
    shape,
    shapeId,
}: {
    board: Board
    column: number
    shape: number[][]
    shapeId: number
}): PlacePieceResult | null {
    // 1. Column bounds
    if (column < 0 || column + shape.length > BOARD_WIDTH) {
        return null
    }

    // 2. Compute gravity landing position
    // shapeDepth: lowest block's signed offset from the shape column's bottom row.
    // Negative means the lowest block is above the bottom; 0 means it's at the bottom.
    const shapeDepthMap = shape.map(col => col.findLastIndex(gtZero) - (col.length - 1))
    const normalized = shapeDepthMap.map((shapeDepth, i) => {
        const colIdx = column + i
        const firstBlock = board[colIdx]!.findIndex(val => val >= 0)
        const height = firstBlock >= 0 ? firstBlock : BOARD_HEIGHT
        return height - shapeDepth
    })

    const y = Math.min(...normalized)
    const shapeHeight = shape[0]!.length
    const dy = y - shapeHeight

    // 3. Reject ceiling overflow (piece can't fit vertically)
    if (dy < 0) {
        return null
    }

    // 4. Validate all destination cells
    const cells: Array<[number, number]> = []
    for (let i = 0; i < shape.length; i++) {
        const colIdx = column + i
        const shapeCol = shape[i]!
        for (let j = 0; j < shapeCol.length; j++) {
            if (shapeCol[j]! > 0) {
                const row = dy + j
                // Destination row must be within the board
                if (row < 0 || row >= BOARD_HEIGHT) {
                    return null
                }
                // Destination cell must be empty
                if (board[colIdx]![row]! >= 0) {
                    return null
                }
                cells.push([colIdx, row])
            }
        }
    }

    // 5. Build new board and place cells
    const newBoard = board.map(col => [...col])
    for (const [cx, cy] of cells) {
        newBoard[cx]![cy] = shapeId
    }

    return { board: newBoard, cells }
}

/**
 * Returns all column indices where the given shape can be legally placed.
 * Iterates columns 0..(BOARD_WIDTH-1) and calls `tryPlacePiece` for each.
 * Returns columns where the piece fits entirely within bounds, no occupied cells,
 * and no ceiling overflow.
 */
export function getLegalColumns(
    board: Board,
    shape: number[][]
): number[] {
    const columns: number[] = []
    for (let col = 0; col + shape.length <= BOARD_WIDTH; col++) {
        const result = tryPlacePiece({ board, column: col, shape, shapeId: 0 })
        if (result !== null) {
            columns.push(col)
        }
    }
    return columns
}

/**
 * Thin throwing wrapper around `tryPlacePiece`.
 * Preserves the original API and gravity results for valid inputs.
 * Throws if the placement is invalid.
 */
export function getUpdatedBoard({
    board,
    column,
    shape,
    shapeId = 1.00,
}: {
    board: Board
    column: number
    shape: number[][]
    shapeId: number
}): Board {
    const result = tryPlacePiece({ board, column, shape, shapeId })
    if (!result) {
        throw new Error(
            `Invalid placement: column=${column}, shapeWidth=${shape.length}, ` +
            `shapeHeight=${shape[0]?.length ?? 0}`
        )
    }
    return result.board
}