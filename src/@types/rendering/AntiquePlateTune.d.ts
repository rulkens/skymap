/** `AntiqueTuning` as the plate's uniform record reads it (io.wesl `tune`, `borderWash`, `tint`, `hidden`). */
export type AntiquePlateTune = {
  readonly hatchUnits: number;
  readonly washGain: number;
  readonly inkGain: number;
  readonly lineInk: number;
  readonly borderWash: number;
  readonly tint: readonly [number, number, number];
  /** Bit i set: `ANTIQUE_PLATE_ROWS[i]` is switched off (fragment.wesl `HIDE_*`). */
  readonly hidden: number;
};
