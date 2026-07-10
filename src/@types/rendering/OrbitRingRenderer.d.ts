/**
 * OrbitRingRenderer — handle for the debug orbit rings drawn as analytic SDF
 * annuli into the depthless HDR accumulation.
 *
 * Each ring is a quad in its orbital plane whose fragment stage evaluates a
 * signed-distance ring (`abs(length(p) - 1)` against an `fwidth`-derived
 * stroke), so the ring stays ~1.5 px wide at ANY zoom — no tessellation, no
 * LOD, no line geometry (see `orbitRing/fragment.wesl` for why SDF beats line
 * geometry across 12+ orders of magnitude). A brightness lobe at local angle 0
 * points at the orbiting body, because the orbit table aims `uAxis` at the
 * body by construction (`sceneOrbits.ts`).
 *
 * ONE instanced draw paints every ring: each orbit's MVP + colour rides in a
 * per-instance vertex-buffer record (the `planetRenderer` idiom), so the
 * renderer needs neither a per-ring bind nor a per-draw uniform — the
 * writeBuffer-vs-submit landmine is avoided by construction. It draws into the
 * depthless `hdr` target with one/one additive blending (like
 * `starPointRenderer`), NOT the opaque foreground pass, so the rings ride the
 * same tone-map as the galaxies and never occlude anything.
 */

import type { Renderer } from './Renderer';

export type OrbitRingRenderer = Renderer & {
  /**
   * Draw `count` orbit rings into the current (depthless, additive) pass with
   * a single instanced draw. `instances` is a packed Float32Array of `count`
   * per-instance records, each 20 floats: floats 0..15 the ring's column-major
   * MVP (rotated in-plane basis · radius + centre translation, composed in f64
   * by `composeOrbitMvp`), floats 16..18 its linear-RGB tint, float 19 an
   * unused pad. The caller reuses one staging array across frames; `draw`
   * uploads the first `count` records in ONE `queue.writeBuffer` and issues
   * ONE draw. `count` is clamped to MAX_ORBITS; a zero count is a no-op.
   */
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void;
};
