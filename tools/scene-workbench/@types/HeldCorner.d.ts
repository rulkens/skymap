import type { Vec2 } from '../../../src/@types/math/Vec2';

/** A pressed draft corner: `dragging` flips once the pointer leaves the click threshold. */
export type HeldCorner = { pointerId: number; index: number; downPx: Vec2; dragging: boolean };
