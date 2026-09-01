/**
 * SgrAStarLensingTuning — TEMPORARY (Task 15) DebugPanel knobs for the Sgr A*
 * lens pass, live-tuned during Task 17's visual gate. Deleted (type + every
 * reader) at Task 15's removal step, once Task 17 converges and the tuned
 * values are baked back into `BLACK_HOLES` (Task 6), `fragment.wesl`'s shader
 * constants (Task 6/13), and the relevant module constants as shipped
 * literals — see the task-15 brief's "Removal step".
 *
 * Two tiers, per the brief:
 *   - TIER 1 (`innerRs`..`flickerTimescaleS`): already ride the 144-byte
 *     `SgrAStarLensingUniforms` struct via `BLACK_HOLES`; this settings
 *     cluster is read at pack time INSTEAD of the static registry, same as
 *     `MilkyWayTuning` overrides `milkyWayCalibration`'s seed after boot.
 *   - TIER 2 (`diskScaleHeightRs`..`dopplerStrength`): were shader-local
 *     `const`s in `fragment.wesl`; the struct grew 144 → 160 bytes to carry
 *     them (see `sgrAStarLensing.wesl` + `packSgrAStarLensingUniforms.ts`).
 * Plus two CPU-side (non-uniform) knobs riding the same settings seam:
 * `skyCubemapRecaptureCameraMoveFraction` (was a module constant in
 * `skyCubemapCaptureSchedule.ts`) and `cubemapResolutionPx` (the sky-cubemap
 * render-target row's `fixedSizePx.size`, now state-driven — see
 * `renderTargets.ts`'s `resolveFixedSize`).
 *
 * No `glintTint` / `glintIntensity`: wiring those (the far-field glint marker
 * in `bodyGlintsLayer.ts`) through this seam would mean threading `state`
 * into the pure, gate-and-emit-shared `sgrAStarGlintBrightness` helper and
 * expanding `bodyGlintsLayer.test.ts`'s several hand-built `EngineState`
 * fixtures — beyond this task's "don't invent new plumbing" bound. Left as
 * `bodyGlintsLayer.ts`'s own module constants.
 */

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

  // ── Non-uniform, same settings seam ──────────────────────────────────────
  /** Was `skyCubemapCaptureSchedule.ts`'s `SKY_CUBEMAP_RECAPTURE_CAMERA_MOVE_FRACTION`. */
  skyCubemapRecaptureCameraMoveFraction: number;
  /**
   * The `sky-cubemap` render-target row's per-axis pixel size (256/512/1024).
   * Read by `renderTargets.ts`'s state-driven `fixedSizePx.size` resolver, so
   * a change takes effect on the next `reconcile()` — no reload needed.
   */
  cubemapResolutionPx: number;
};
