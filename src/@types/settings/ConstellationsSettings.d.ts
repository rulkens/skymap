/**
 * ConstellationsSettings — constellation stick figures. `enabled` shows the figures;
 * `labelEnabled` the name captions, which also vanish with the figures (`of`). Neither
 * `labelEnabled` nor `intensity` has a panel control: cues write the one, the
 * line-brightness math reads the other.
 */

export type ConstellationsSettings = {
  enabled: boolean;
  labelEnabled: boolean;
  intensity: number;
};
