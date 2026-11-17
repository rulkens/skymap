/** A selected name's growth to the antique title size (`createTitleGrowth`). */
export type TitleGrowth = {
  /** This frame's 0..1 growth of label `id`, whose title target is `isTitle`. */
  blend(id: string, isTitle: boolean, nowMs: number): number;
  /** Whether `id` is growing, grown or shrinking; a name never selected is not tracked. */
  tracks(id: string): boolean;
  /** Forgets the names not blended this frame and the shrunk ones; true while a ramp runs. */
  endFrame(nowMs: number): boolean;
};
