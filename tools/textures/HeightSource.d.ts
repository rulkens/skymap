import type { SurfaceTileProvenance } from '../../src/@types/scene/SurfaceTileProvenance';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/**
 * HeightSource — the seam between the height bake and wherever elevations
 * come from, the `SurfaceImagerySource` of the second product: metres above
 * the datum sphere, never a radius (spec §5.3). Addressed in GLOBAL LATTICE
 * indices, not a lon/lat box — deriving a shared post from a box-relative
 * offset reintroduces the last-bit difference that shows up as a crack (§5.4.2).
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
