import type { Shape } from '@tahoelink/shared'
interface PieceState {
    shape: Shape,
    rotation: number,
    flip: boolean
}
export const pieceState = $state<PieceState>({
    shape: 'L',
    rotation: 0,
    flip: false,
})

interface PlayerState {
    name: string
    color: number
}

export const playerState = $state<PlayerState | null>(null)