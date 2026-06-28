/**
 * MilkyWayRenderer — public handle for the procedural Milky-Way impostor
 * pass.  Renders a single instanced quad at the galactic center; the
 * fragment shader generates the spiral disk procedurally.
 */

import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

export type MilkyWayRenderer = {
  /**
   * Human-readable identifier (`'milkyWayRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Issue the single-instance draw.  Encodes a 6-vertex / 1-instance
   * call after writing the uniform buffer.  Caller is responsible for
   * gating on the user's "Show Milky Way" toggle and the distance-fade
   * threshold (`fadeAlpha === 0` is the natural skip condition; the
   * caller should `return` instead of submitting a no-op draw to keep
   * the per-frame cost honest at zero when the impostor is invisible).
   *
   * `centerWorld` is the world-space position the impostor should
   * render at — in practice the Milky Way's actual galactic center
   * (Sgr A\*), which sits ~8 kpc away from the catalog origin
   * (Earth).  Defaults to `[0, 0, 0]` so callers that don't yet
   * thread the offset through still work; production passes
   * `MILKY_WAY_CENTER_WORLD` from `data/galacticCenter.ts`.
   *
   * Implementation note: the offset is applied *entirely* on the CPU
   * by pre-multiplying `viewProj` with a translation and subtracting
   * the offset from `cameraPosWorld` before upload — the shader keeps
   * treating world origin as the galactic center, which means no
   * shader changes were needed to move the impostor off-origin.  See
   * the comment block inside this method for the math.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: Vec2,
    fadeAlpha: number,
    iTimeSec: number,
    cameraPosWorld: Readonly<Vec3>,
    centerWorld?: Vec3,
  ): void;
  /** Release the per-frame uniform buffer. */
  destroy(): void;
};
