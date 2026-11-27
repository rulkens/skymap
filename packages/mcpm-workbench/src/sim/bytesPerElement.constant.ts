import type { GridElement } from '../../@types/grid/GridElement';

// Single-sourced: planGridBudget's preflight and createGridBuffers' allocation must agree
// byte-for-byte, or the preflight greenlights an allocation that overflows.
export const BYTES_PER_ELEMENT: Readonly<Record<GridElement, number>> = { f16: 2, f32: 4 };
