import { shapes } from "./shapes";
import type { Shape } from "./types";

export const getShape = ({ shape, rotation, flip }: { shape: Shape, rotation: number, flip: boolean }): number[][] => {
    const flipIndex = flip ? 1 : 0
    const rotationIndex = ((rotation % 4) + 4) % 4;
    return shapes[shape][rotationIndex]![flipIndex]!
}