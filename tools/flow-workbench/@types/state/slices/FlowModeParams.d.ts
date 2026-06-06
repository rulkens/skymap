/**
 * FlowModeParams — the tunable knobs for ONE flow mode.
 *
 * Held per-mode (advect and streamline each carry a full set) so switching
 * modes restores that mode's last-dialled look instead of re-applying shared
 * sliders. `count` is the particle count; the rest shape integration
 * (`flowSpeed`, `densityBias`, `wander`), trail accumulation (`trail`, `size`),
 * and tone mapping (`exposure`, `contrast`).
 */
export type FlowModeParams = {
  readonly count: number;
  readonly flowSpeed: number;
  readonly densityBias: number;
  readonly wander: number;
  readonly trail: number;
  readonly size: number;
  readonly exposure: number;
  readonly contrast: number;
};
