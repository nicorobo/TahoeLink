
const COLORS = {
    background: ['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400']
} as const

export const getCellBackgroundClass = (cell: number) => {
    if (cell < 0) return 'bg-white'
    return COLORS.background[Math.floor(cell)]
}