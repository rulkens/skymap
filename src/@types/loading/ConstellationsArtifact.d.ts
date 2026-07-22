import type { Vec3 } from '../math/Vec3';

/**
 * ConstellationsArtifact — the decoded `constellations.json` payload, mirroring
 * the shape the Rust `build-stars-rs` pipeline emits EXACTLY.
 *
 * One classical asterism per array entry: a display `name`, a `labelAnchorPc`
 * where the constellation's text sits, and the `segments` list — the
 * stick-figure line pairs, each joining two member stars at their real
 * heliocentric equatorial (J2000) positions. All positions are in PARSECS
 * (the `Pc` suffix), NOT the Mpc the galaxy catalogs use, because the overlay
 * lives in the near-field stellar neighbourhood; the renderer scales them into
 * world units. `aAppMag` / `bAppMag` carry each endpoint star's apparent
 * magnitude so the line can fade with its dimmer star.
 *
 * The nested inline object shapes keep this one exported type (the
 * one-type-per-file rule) rather than fanning `Segment` / `Figure` out into
 * their own files — they have no independent use, only meaning as this
 * artifact's structure. `version` is a literal `1`: the fetcher's
 * `parseConstellations` rejects anything else so a stale artifact fails loud
 * with a regenerate hint rather than decoding to a mismatched shape.
 */
export type ConstellationsArtifact = {
  version: 1;
  constellations: Array<{
    name: string;
    labelAnchorPc: Vec3;
    segments: Array<{ aPc: Vec3; aAppMag: number; bPc: Vec3; bAppMag: number }>;
  }>;
};
