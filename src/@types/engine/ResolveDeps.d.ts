import type { StructureStore } from './data/StructureStore';

/**
 * ResolveDeps — the engine resources core's `SelectionKindRow`s close over:
 * the structure store. Bundled (not threaded individually) so the saga gets
 * the whole bag from `getContext('resolveDeps')()`. The getters read LIVE
 * engine state each call (structures change as they load), so a row always
 * sees current data.
 */
export type ResolveDeps = {
  // Widened to the two methods the structure selection row needs (Ruling 5):
  // `resolveStructureFromPick` reads `byCategory`, `extractRow` reads `byId`.
  // `loaded` is OPTIONAL rather than folded into the Pick: it exists only for
  // `watchFocusTweenSaga`'s retry loop (true once the anchors group has landed,
  // synchronously ahead of the async bulk group), and making it required
  // would force every other ResolveDeps stub in the test suite (none of which
  // exercise structure deferral) to grow a field they don't use. A stub that
  // omits it is treated as already-loaded by the loop, matching today's
  // no-retry behaviour.
  readonly structures: Pick<StructureStore, 'byId' | 'byCategory'> & {
    loaded?(): boolean;
  };
};
