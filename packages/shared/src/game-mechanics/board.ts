import { BOARD_HEIGHT } from "../constants"
import { Board } from "../types"

const gtZero = (val: number) => val > 0
export const getUpdatedBoard = ({ board, column, shape, shapeId = 1.00 }: { board: Board, column: number, shape: number[][], shapeId: number }) => {
    const shapeDepthMap = shape.map(col => col.findLastIndex(gtZero) - (col.length - 1))
    const normalized = shapeDepthMap.map((shapeDepth, i) => {
        const col = column + i
        const firstBlock = board[col].findIndex(val => val >= 0)
        const height = firstBlock >= 0 ? firstBlock : BOARD_HEIGHT
        return height - shapeDepth
    })

    const y = Math.min(...normalized)
    const newBoard = board.map(column => [...column])
    const dy = y - shape[0].length
    shape.forEach((layer, i) => {
        layer.forEach((val, j) => {
            if (val > 0) {
                const row = dy + j
                const col = column + i
                newBoard[col][row] = shapeId
            }
        })
    })
    return newBoard
}