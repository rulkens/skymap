import type { LabelProducer } from './LabelProducer';

export type YouAreHereSubsystem = LabelProducer & {
  /**
   * Tear down the subsystem.  No-op — the subsystem owns no closures,
   * listeners, timers, or workers; `produceLabels` is a pure function
   * of `state` + `ctx`.  Method exists so the engine's bag of
   * subsystems can be torn down uniformly via the shared `Destroyable`
   * shape (`engine.destroy()` iterates and calls `destroy()` on each).
   */
  destroy(): void;
};
