import type { GridElement } from '../grid/GridElement';

export type PreviewPackedTrace = {
  readonly buffer: GPUBuffer;
  readonly element: GridElement;
};
