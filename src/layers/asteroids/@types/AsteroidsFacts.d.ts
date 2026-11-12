/**
 * What the Layer publishes into `state.engine.asteroids`. Its flip is the pulse core re-resolves
 * pending selections on, which is how an asteroid linked before the catalog loaded gets its row.
 */
export type AsteroidsFacts = {
  readonly catalogReady: boolean;
};
