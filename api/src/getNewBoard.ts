import { BOARD_HEIGHT, BOARD_WIDTH } from "./constants"

const gtZero = (val: number) => val > 0
export const getNewBoard = ({ currentBoard, column, shape, turnId = 1.00 }: { currentBoard: number[][], column: number, shape: number[][], turnId: number }) => {
    const shapeDepthMap = shape.map(col => col.findLastIndex(gtZero) - (col.length - 1))
    console.log('shapeDepthMap: ', shapeDepthMap)
    // [0, 0]
    const normalized = shapeDepthMap.map((shapeDepth, i) => {
        const col = column + i
        const firstBlock = currentBoard[col].findIndex(val => val >= 0)
        const height = firstBlock >= 0 ? firstBlock : BOARD_HEIGHT
        return height - shapeDepth
    })
    console.log('normalized: ', normalized)

    const y = Math.min(...normalized)
    // 10
    const newBoard = currentBoard.map(column => [...column])
    const dy = y - shape[0].length
    // 10 + 3
    shape.forEach((layer, i) => {
        layer.forEach((val, j) => {
            if (val > 0) {
                const row = dy + j
                const col = column + i
                newBoard[col][row] = turnId
            }
        })
    })
    return newBoard
}