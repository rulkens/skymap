import type { SurfaceTileProvenance } from '../../src/@types/scene/SurfaceTileProvenance';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/**
 * HeightSource — the seam between the height bake and wherever the elevations
 * come from, the `EarthImagerySource` of the second product. Metres above the
 * body's datum sphere, never a radius (spec §5.3).
 *
 * Unlike imagery, a height source is addressed in LATTICE indices rather than
 * a lon/lat box: the shared post of two adjacent tiles must be the same
 * computed float in both, and deriving its position from a box-relative offset
 * reintroduces the last-bit difference that shows up as a hairline crack
 * (§5.4.2). The lattice is global per level and the same in both axes.
 */
export type HeightSource = {
  readonly id: string;
  /** Verbatim attribution text the licence requires, surfaced in the credits. */
  readonly attribution: string;
  /** Deepest level whose post spacing this source still resolves natively. */
  readonly maxLevel: number;
  readonly coverage: ReadonlyArray<LonLatBounds>;
  readonly provenance: SurfaceTileProvenance;
  /**
   * Posts on the GLOBAL level-`z` lattice: post `(i, j)` sits at
   * `lon = −180 + i·360/(2^z·128)`, `lat = 90 − j·360/(2^z·128)`.
   * Returns `nx·ny` f32, row-major, north row first; NaN where the source has
   * no data; `null` when the box is entirely outside `coverage`.
   */
  readGrid(z: number, i0: number, j0: number, nx: number, ny: number): Promise<Float32Array | null>;
  /** Native-resolution `[min, max]` over a lon/lat box — the tile header's
   *  bound, so it must see the source's own posts, not the lattice's. */
  boundsInBox(box: LonLatBounds): Promise<readonly [number, number] | null>;
};
