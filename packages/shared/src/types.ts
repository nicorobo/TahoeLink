// The board is arranged in columns, with the top left cell being board[0][0], and top right being board[BOARD_WIDTH-1][0]
export type Board = number[][]
export type Shape = 'L' | 'O' | 'T' | 'I' | 'S'
export type DiceValue = Shape | 'any'
export type RoomStage = 'waiting-for-players' | 'in-progress' | 'complete'
export interface Room {
    board: Board
    activePlayer: number
    turn: number
    roll: DiceValue
    stage: RoomStage
}