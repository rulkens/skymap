/**
 * Destroyable — minimal base contract every engine subsystem satisfies.
 *
 * ### Why this type exists
 *
 * skymap's engine constructs ~13 subsystems at boot. Pre-this-PR their
 * teardown was a mosaic: some had a `destroy()` method, some had
 * `detach()`, some had `cancelRender()`, and seven had no teardown
 * method at all — so `engine.destroy()` had to know each subsystem's
 * specific name (or skip it entirely, as it did for several).
 *
 * The `Destroyable` contract is intentionally minimal — just
 * `destroy(): void`. The corresponding `satisfies Destroyable` clause
 * at each factory return turns "I forgot to add destroy()" into a
 * compile-time error rather than a runtime leak.
 *
 * ### Why a `type` not an `interface`
 *
 * Per skymap convention; `type` aliases compose more cleanly with
 * intersection types like `SomeSubsystem & Destroyable`.
 */
export type Destroyable = {
  destroy(): void;
};
