/** The one bounded orientation decay both arms' settles read (R1, ruling 8):
 * `clamp(share·residual, ±capRad)` per driven write. A reference move beyond
 * `rideBoundRad` in ONE notch is unauthored, so a blend flip cannot whip. */
export const ORIENT_DECAY = {
  share: 0.25,
  capRad: 0.1,
  rideBoundRad: 0.3,
} as const;
