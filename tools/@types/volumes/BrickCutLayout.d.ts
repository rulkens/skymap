/** Where one brick's bytes sit in an encoded slab one brick wide (`cutBrick`). */
export type BrickCutLayout = {
  /** Bytes of one z-slice of the encoded slab. */
  readonly sliceBytes: number;
  /** Bytes of one brick's block rows in one slice: bytesPerRow · rowsPerImage of the format. */
  readonly brickSliceBytes: number;
};
