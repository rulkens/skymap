/** The march inputs one `VolumeFieldRenderer.draw` call reads, chosen per view by its pass row. */
export type VolumeFieldDrawInputs = {
  /** Index into the jitter sequence: the engine frame index. */
  jitterIndex: number;
  /** March steps per ray. */
  steps: number;
  /** Blend constant each field's march is scaled by as it adds into the target; 1 = plain additive. */
  weight: number;
};
