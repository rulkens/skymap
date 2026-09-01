/**
 * SgrAStarLensingTuning — TEMPORARY (Task 15) DebugPanel knobs for the Sgr
 * A* lens pass, deleted at the removal step once Task 17 converges (tuned
 * values baked back into `BLACK_HOLES` / shader consts / module constants).
 * Tier 1 overrides `BLACK_HOLES` at pack time; Tier 2 + emission
 * strength/tint are new `SgrAStarLensingUniforms` fields (struct grew
 * 144→176 bytes); the rest are non-uniform CPU-side knobs on the same
 * settings seam. No `glintTint`/`glintIntensity` — see `bodyGlintsLayer.ts`.
 */

import type { Vec3 } from '../math/Vec3';

export type SgrAStarLensingTuning = {
  // ── Tier 1 — BLACK_HOLES override, rides the existing uniform fields ────
  innerRs: number;
  outerRs: number;
  inclinationRad: number;
  positionAngleRad: number;
  flickerAmp: number;
  flickerTimescaleS: number;

  // ── Tier 2 — new uniform fields (struct grown for this task) ────────────
  /** Was `fragment.wesl`'s `DISK_SCALE_HEIGHT_RS` const. */
  diskScaleHeightRs: number;
  /** Was the escape branch's hardcoded `lutMaxImpactParamRs * 0.7` edge-fade start. */
  edgeFadeStartFraction: number;
  /** Was `fragment.wesl`'s `DOPPLER_STRENGTH` const. */
  dopplerStrength: number;
  /** 2nd addendum: overall multiplier on the annulus emission's summed output. Default 1 reproduces today's brightness. */
  emissionStrength: number;
  /** 2nd addendum: overall multiplier on the annulus emission's summed tint. Default [1,1,1] is a no-op. */
  emissionTint: Vec3;

  // ── Non-uniform, same settings seam ──────────────────────────────────────
  /** Was `skyCubemapCaptureSchedule.ts`'s `SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION`. */
  skyCubemapRecaptureCameraMoveFraction: number;
  /**
   * The `sky-cubemap` render-target row's per-axis pixel size (256/512/1024/2048).
   * Read by `renderTargets.ts`'s state-driven `fixedSizePx.size` resolver, so
   * a change takes effect on the next `reconcile()` — no reload needed.
   */
  cubemapResolutionPx: number;
};
