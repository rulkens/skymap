/** One tick on the sky HUD's compass ribbon; `offset` runs 0 (left edge) to 1 (right edge). */
export type CompassTick = {
  /** The unwrapped bearing, stable across 0°/360° so a drag keeps each tick's identity. */
  readonly key: number;
  readonly offset: number;
  readonly kind: 'cardinal' | 'intercardinal' | 'major' | 'minor';
  readonly label: string | null;
};
