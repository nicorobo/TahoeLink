
export const COLORS = {
    background: ['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400']
} as const

/**
 * Decode owner from a cell value.
 * Cell encoding: owner * 1000 + turn
 * Owner is Math.floor(cell / 1000).
 */
const getCellOwner = (cell: number) => Math.floor(cell / 1000)

export const getCellBackgroundClass = (cell: number) => {
    if (cell < 0) return 'bg-white'
    return COLORS.background[getCellOwner(cell)]
}