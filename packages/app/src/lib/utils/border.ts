export const getCellBorderClasses = (
    board: number[][],
    cell: number,
    x: number,
    y: number,
) => {
    if (cell < 0) return
    const classes = ['border-0']
    if (x - 1 < 0 || board[x - 1][y] !== cell) {
        classes.push('border-l-2 border-l-black')
    }
    // TODO use board dimension constant
    if (x + 1 >= board.length || board[x + 1][y] !== cell) {
        classes.push('border-r-2 border-r-black')
    }
    if (y - 1 < 0 || board[x][y - 1] !== cell) {
        classes.push('border-t-2 border-t-black')
    }
    // TODO use board dimension constant
    if (y + 1 >= board[x].length || board[x][y + 1] !== cell) {
        classes.push('border-b-2 border-b-black')
    }
    return classes.join(' ')
}