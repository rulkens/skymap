/**
 * A galaxy octree object's decoded render columns, `count` records in node-row order
 * (`galaxyColumnsOf`). Scalars are dequantised (`q0 + raw·q1`); `logSize` is log10 kpc,
 * `angularWeight` log10 w (D6), `flags` the orientation (1) and diameter (2) fallback bits.
 */
export type GalaxyColumns = {
  readonly count: number;
  /** 3·count, a fraction of the owning node's box ×65536 (`OFFSET_FRACTION_LEVELS`). */
  readonly offset: Uint16Array;
  readonly absMag: Float32Array;
  readonly colourIndex: Float32Array;
  readonly axisRatio: Float32Array;
  readonly pa: Float32Array;
  readonly logSize: Float32Array;
  readonly flags: Float32Array;
  readonly angularWeight: Float32Array;
};
