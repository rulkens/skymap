/**
 * Public surface of the constellation stick-figure renderer. A thin sibling of
 * `FilamentRenderer` — same instanced-quad thick-line technique, additive HDR
 * target, and per-frame fade opacity — but fed by the CPU-resident
 * `ConstellationsArtifact` (line segments between real stars) rather than a
 * binary point/segment cloud.
 *
 * `upload` builds the per-instance buffer ONCE from the artifact (the segment
 * set is static — a tier-agnostic `constellations.json`), converting each
 * endpoint's parsecs to the world Mpc the vertex shader projects. `draw` is a
 * single instanced call; the caller (the pass) hands the already-resolved
 * NEAR0 view-projection so the renderer stays a dumb f32 pipeline. `hasData`
 * lets the pass upload lazily on first ready frame and gate its draw.
 */

import type { Vec2 } from '../math/Vec2';
import type { ConstellationsArtifact } from '../loading/ConstellationsArtifact';

export type ConstellationRenderer = {
  readonly label: string;
  /** Build the per-instance buffer from the artifact's segments (once). */
  upload(artifact: ConstellationsArtifact): void;
  /** True once a drawable segment set is committed — the pass's upload/draw gate. */
  hasData(): boolean;
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    halfWidthPx: number,
    intensity: number,
    fadeOpacity: number,
  ): void;
  destroy(): void;
};
