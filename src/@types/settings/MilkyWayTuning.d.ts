/**
 * MilkyWayTuning — the Milky Way star-cloud's per-frame LOOK knobs.
 *
 * Named apart from `MilkyWaySettings` (which adds the two visibility axes) for
 * the same reason `FlowFieldDefaults` is named apart from `FlowSettings`: three
 * consumers reference exactly this shape and would otherwise re-spell it — the
 * calibration seed (`MILKY_WAY_TUNING_DEFAULTS`), the slice's patch payload
 * (`setMilkyWayTuning`), and the renderer's per-frame draw argument
 * (`MilkyWayCloudDrawArgs.tuning`). Keeping the knobs in their own type also
 * keeps the visibility intent (`enabled` / `labelEnabled`) off the generic
 * merge path, so a knob patch can never flip the layer off by accident.
 *
 * What unites the set is that moving any of them changes the NEXT frame — not
 * that the frame loop reacts by the SAME mechanism. Most get there via
 * `milkyWayCloudRenderer.writeUniforms`, landing in the `params0` / `params1`
 * lanes of `milkyWay/sprites/io.wesl`'s `Uniforms` — a uniform write.
 * `aggregateDivisor` gets there by sizing the offscreen the star pass draws
 * into, which the frame loop reallocates when the number moves — a render-
 * target rebuild. `starCount` gets there the heaviest way of the three: it
 * feeds generation directly (`milkyWayCloud.generate` carves the star/dust
 * layouts and allocates buffers from it), so the frame loop answers a
 * mismatch by regenerating the cloud outright. All three still clear the same
 * bar — moving the knob changes the next frame — because "the frame loop
 * reacts" was never a promise about uniform buffers specifically.
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
   * the half-res `mw-aggregate` target, so one unit here is two screen pixels.
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
   * `GalaxyParams.starCount` before carving the star/dust layouts. Seeded
   * from the CURRENT tier's budget (`MILKY_WAY_STARS_PER_TIER[tier]`) at boot
   * and re-seeded by `watchTierSaga` on every explicit tier change, so an
   * absolute count doesn't quietly decouple the cloud from tier LOD — a
   * device that drops to the small tier gets the small tier's budget, not
   * whatever count a previous tier's panel session left behind. Between tier
   * changes the DebugPanel slider owns it. The heaviest-reaction knob in the
   * set: moving it doesn't touch a uniform or a render target, it regenerates
   * the cloud's instance buffers outright (destroy + allocate + compute
   * dispatch) — see `runFrame`'s mismatch branch, which mirrors
   * `aggregateDivisor`'s render-target rebuild but for generated data instead
   * of a texture.
   *
   * `totalStarBudget` floors the total at 20,000 stars — not a taste choice,
   * a hard floor the renderer always honours regardless of what's requested —
   * so `MILKY_WAY_SLIDER_FIELDS`'s `starCount` row sets its `min` to that same
   * floor. Lowering the row's `min` below 20,000 would let the slider display
   * a number the renderer silently ignores.
   */
  starCount: number;
};
