import type { Shape } from './types'
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