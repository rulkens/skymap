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
 * Every field is read live by `milkyWayCloudRenderer.writeUniforms` and lands
 * in the `params0` / `params1` lanes of `milkyWayCloud/io.wesl`'s `Uniforms`.
 * The STAR COUNT is deliberately absent: it feeds generation
 * (`milkyWayCloud.generate`), not the uniforms, so a live slider over it would
 * silently do nothing until the next tier switch.
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
};
