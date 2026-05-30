import type { Vec2 } from '../math/Vec2';

/**
 * Per-image placement calibration for a famous-galaxy WebP thumbnail.
 *
 * All values describe the *final shipped WebP* in normalised image
 * coordinates so they are independent of atlas slot size or on-screen
 * scale.  When absent the render path falls back to catalog geometry,
 * which is the correct behaviour for the vast majority of entries.
 */
export type FamousCalibration = {
  /** Nucleus position normalised [0,1]^2 within the WebP (0.5, 0.5 = centre). */
  center: Vec2;
  /** Disk radius as a fraction of the image half-width. */
  diskRadiusFrac: number;
  /** Major-axis PA in the final image frame, degrees [0, 180). */
  paDeg: number;
  /** b/a override; absent → catalog axisRatio is used instead. */
  axisRatio?: number;
  /** True when the shipped WebP was deprojected to face-on. */
  deprojected: boolean;
};

/** One famous-galaxy metadata record, indexed by its local position in famous.bin. */
export type FamousMetaEntry = {
  id: string;
  names: string[];
  /**
   * Curated human-friendly display name (e.g. `"Andromeda Galaxy"`).
   * Mirrors the optional field on the seed entry.  Absent for most
   * entries — the POI label producer falls back to `names`/`id`.
   */
  commonName?: string;
  description: string;
  type: string;
  /**
   * Optional flag marking a row that doesn't correspond to a real
   * catalog object.  Pseudo entries (currently just the Milky Way —
   * see `data/milkyWayEntry.ts`) are merged into the palette's
   * entries array but have no `famous.bin` counterpart, so:
   *
   *   - Their id can never be looked up via
   *     `state.sources.famousMeta.findIndex` (the engine's famousMeta
   *     comes from the bin and won't include them).
   *   - The command palette can't render their thumbnail via the
   *     `/images/famous/{id}.webp` URL — there is no per-id WebP for a
   *     pseudo entry.  The palette branches on `pseudo === true` to
   *     render a glyph fallback instead of a broken-image icon.
   *
   * Real entries loaded from `famous_meta.json` never set this flag
   * (the field is absent in the JSON), so production data flows
   * through the existing path unchanged.
   */
  pseudo?: true;
  /**
   * Hand-authored placement calibration for this galaxy's thumbnail.
   * Absent for most entries — the render path uses catalog geometry
   * (axisRatio, positionAngleDeg) unchanged when this field is missing.
   */
  calibration?: FamousCalibration;
};
