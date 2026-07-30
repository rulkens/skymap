/**
 * Public surface of the constellation stick-figure renderer. A thin sibling of
 * `FilamentRenderer` — same instanced-quad thick-line technique, additive HDR
 * target, and per-frame fade opacity — but fed by the CPU-resident
 * `ConstellationsArtifact` (line segments between real stars) rather than a
 * binary point/segment cloud.
 *
 * `upload` caches the ABSOLUTE-position instance data ONCE from the artifact
 * (the segment set is static — a tier-agnostic `constellations.json`),
 * converting each endpoint's parsecs to world Mpc. `draw` re-expresses that data
 * camera-relative (`pos − camPos`) into the instance buffer each frame and
 * pairs it with the caller's f64-rebased view-projection — the `starPointsLayer`
 * precision seam. `hasData` gates the pass's draw (the slot commit uploads).
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { ConstellationsArtifact } from '../loading/ConstellationsArtifact';

export type ConstellationRenderer = {
  readonly label: string;
  /** Cache the absolute-position instance data from the artifact's segments (once). */
  upload(artifact: ConstellationsArtifact): void;
  /** True once a drawable segment set is committed — the pass's draw gate. */
  hasData(): boolean;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    halfWidthPx: number,
    intensity: number,
    fadeOpacity: number,
    camPos: Vec3,
    lineColor: Vec3,
  ): void;
  destroy(): void;
};
