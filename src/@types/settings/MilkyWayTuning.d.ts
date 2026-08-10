/**
 * MilkyWayTuning — the Milky Way star-cloud's per-frame LOOK knobs, kept apart
 * from `MilkyWaySettings` (adds `enabled` / `labelEnabled`) so a knob patch
 * can never flip the layer's visibility by accident. Shared by three
 * consumers: `MILKY_WAY_TUNING_DEFAULTS` (calibration seed), `setMilkyWayTuning`
 * (patch payload), `MilkyWayCloudDrawArgs.tuning` (per-frame renderer arg).
 *
 * Most fields reach the frame via `milkyWayCloudRenderer.writeUniforms`;
 * `aggregateDivisor` resizes the star pass's offscreen target instead;
 * `starCount` regenerates the cloud's instance buffers outright. All three
 * still change the NEXT frame — the mechanism just differs.
 */

export type MilkyWayTuning = {
  /**
   * Dimensionless multiplier on each generated star sprite's world size — the
   * one lever that trades sprite count for sprite area without regenerating
   * the cloud.
   */
  starSizeScale: number;
  /**
   * Emission factor into the HDR → tonemap chain. Absolute, not relative:
   * growing `starSizeScale` raises integrated brightness by roughly its
   * square, and compensating for that automatically would hide the very
   * brightness change a tuning pass needs to see.
   */
  exposure: number;
  /**
   * Screen-space sprite half-extent FLOOR, in pixels of the render target.
   * The anti-sparkle lever: a distant star never shrinks below a stable dot,
   * so it stops twinkling as sub-pixel coverage flickers.
   */
  starPxMin: number;
  /**
   * Screen-space sprite half-extent CAP, in pixels of the render target.
   * Bounds foreground swell on close flythroughs. The star pass renders into
   * the reduced-res `mw-aggregate` target, so one unit here is
   * `aggregateDivisor` screen pixels.
   */
  starPxMax: number;
  /**
   * Fragment profile blend: 0 = the tight core+glow falloff, 1 = a broad
   * Gaussian. Both profiles carry the same integral over the unit disc, so
   * this changes sprite SHAPE without changing how much light it contributes.
   */
  softness: number;
  /**
   * NDC apparent-size threshold of the flux-conserving star LOD; 0 disables
   * it. Sub-threshold stars are culled in the vertex stage and the survivors
   * brightened to hold the field's total light.
   */
  lodApparent: number;
  /**
   * Downsample divisor of the `mw-aggregate` offscreen the additive star pass
   * draws into: the target is allocated at `floor(canvas / aggregateDivisor)`,
   * so the pass's fragment cost falls as this number's SQUARE — the strongest
   * perf lever the cloud has. It trades directly against `starPxMin` /
   * `starPxMax`, which clamp in TARGET pixels: doubling the divisor doubles a
   * clamped sprite's on-screen size at the same clamp value. Unlike its
   * neighbours it reaches the frame by reallocating a render target rather
   * than by riding the uniform buffer.
   */
  aggregateDivisor: number;
  /**
   * Absolute star count fed straight into `milkyWayCloud.generate`'s
   * `GalaxyParams.starCount`. Seeded from the current tier's budget
   * (`MILKY_WAY_STARS_PER_TIER[tier]`) at boot and re-seeded by
   * `watchTierSaga` on every tier change, so a device that drops to the
   * small tier gets the small tier's budget rather than whatever a previous
   * session's slider left behind; the DebugPanel slider owns it between tier
   * changes. Moving it regenerates the cloud's instance buffers outright
   * (`runFrame`'s mismatch branch), unlike the uniform-write/render-target
   * paths the other fields take.
   *
   * `totalStarBudget` floors the total at 20,000 regardless of what's
   * requested, so `MILKY_WAY_SLIDER_FIELDS`'s `starCount.min` must match —
   * a lower `min` would let the slider display a count the renderer ignores.
   */
  starCount: number;
};
