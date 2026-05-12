/**
 * InputBindings — handle returned by `attachEngineInputs`.
 *
 * Centralises the engine's pointer / keyboard / resize listener bag so
 * `engine.destroy()` can iterate over the subsystems uniformly via the
 * shared `Destroyable` shape instead of remembering each subsystem's
 * bespoke teardown method name.
 */

export type InputBindings = {
  /**
   * Detach every listener attached by `attachEngineInputs`.
   *
   * Renamed from `detach()` so the bindings handle satisfies the
   * shared `Destroyable` shape every subsystem now exposes.  The
   * underlying mechanic is unchanged — walks the same two listener
   * arrays the prior `detach()` did.
   */
  destroy(): void;
};
