/**
 * DustWriter — the sink the dust pass writes into. Unlike `StarWriter`, the
 * dust count isn't known up front (it depends on how many `DustSeed`
 * candidates the noise/ring gates accept), so this writer grows an internal
 * buffer and `toFloat32Array()` returns a tight copy sized to what was
 * actually written, rather than a zero-copy view into an over-allocated one.
 */

export type DustWriter = {
  write(
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    g: number,
    b: number,
    opacity: number,
  ): void;
  readonly count: () => number;
  /** Tight copy (dust count is not known up front). */
  readonly toFloat32Array: () => Float32Array;
};
