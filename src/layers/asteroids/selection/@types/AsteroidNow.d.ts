/** Where an asteroid is at the extract instant, as its card reads it; distances in AU. */
export type AsteroidNow = {
  readonly sunDistanceAu: number;
  readonly earthDistanceAu: number;
  /** V seen from Earth; null when MPC gives no H. */
  readonly magnitude: number | null;
};
