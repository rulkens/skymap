/**
 * BlackHoleLensingTuning — the shipped DebugPanel knobs for the Sgr A* lens
 * pass. Tier 1 overrides `BLACK_HOLES` at pack time; Tier 2 + emission
 * strength/tint are `BlackHoleLensingUniforms` fields; the rest are
 * non-uniform CPU-side knobs on the same settings seam.
 */

import type { Vec3 } from '../../../@types/math/Vec3';

export type BlackHoleLensingTuning = {
  // ── Tier 1 — BLACK_HOLES override, rides the existing uniform fields ────
  innerRs: number;
  outerRs: number;
  inclinationRad: number;
  positionAngleRad: number;
  flickerAmp: number;
  flickerTimescaleS: number;

  // ── Tier 2 — uniform fields of their own ────────────────────────────────
  /** Was `fragment.wesl`'s `DISK_SCALE_HEIGHT_RS` const. */
  diskScaleHeightRs: number;
  /** Was the escape branch's hardcoded `lutMaxImpactParamRs * 0.7` edge-fade start. */
  edgeFadeStartFraction: number;
  /** Was `fragment.wesl`'s `DOPPLER_STRENGTH` const. */
  dopplerStrength: number;
  /** Overall multiplier on the annulus emission's summed output; 1 is the unscaled march. */
  emissionStrength: number;
  /** Overall multiplier on the annulus emission's summed tint; [1,1,1] is a no-op. */
  emissionTint: Vec3;

  // ── Non-uniform, same settings seam ──────────────────────────────────────
  /**
   * The `sky-cubemap` render-target row's per-axis pixel size (256/512/1024/2048).
   * Read by the Layer's `sky-cubemap` target (`fixedSizePx.size`), so
   * a change takes effect on the next `reconcile()` — no reload needed.
   */
  cubemapResolutionPx: number;
};
