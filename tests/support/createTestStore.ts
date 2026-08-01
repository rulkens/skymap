/**
 * createTestStore — `createAppStore` plus the inert saga-context the running app
 * always has by the time any saga worker can reach for a capability.
 *
 * `createAppStore` runs `mainSaga`, which forks `watchWakeSaga`. That watcher
 * reaches the engine's render scheduler via `getContext('reconcile')` on every
 * settings/camera/time write. In the real app the engine registers that context
 * (`setSagaContext({ reconcile })`, see `registerReconcile`) immediately after
 * construction, BEFORE any user interaction dispatches a wake write — so the
 * context is always present when the worker runs.
 *
 * A test that boots the store directly and then dispatches a wake write (a
 * container toggling `autoRotate`, a scene effect flipping `filaments`) skips
 * that engine step, so the worker dereferences an undefined context and prints
 * `Cannot read properties of undefined (reading 'requestRender')` to stderr. The
 * test still passes (the reducer ran before the async worker), but the stack
 * trace is noise. Registering a no-op `reconcile` here mirrors what the engine
 * does and drops the write on the floor — exactly the right behaviour for a test
 * with no renderer to wake.
 *
 * Guarding inside `watchWakeSaga` is the wrong layer: in production the context
 * is always present, so a source guard would mask a genuine future
 * misconfiguration. This is a test-setup completion, not a runtime change.
 *
 * `reconcile` was for a long time the only member registered here, which was a
 * habit rather than a decision: `setSagaContext` used to take a `Partial`, so the
 * bag grew a capability at a time as sagas needed one. The setter now takes the
 * whole `SagaContext`, and the reason is visible from this file — registering is
 * what fires `sagaContextRegistered`, which is what releases the hash bridge, so
 * a test store with a hash left on `window.location` by an earlier test in the
 * same file performs a real arrival read and reaches `resolveDeps`. With one
 * member registered that read threw and cancelled every watcher in the root
 * saga, leaving the test's actual subject dead for reasons nothing on screen
 * explained.
 */

import { createAppStore, type PreloadedState } from '../../src/store/createAppStore';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';
import type { SagaContext } from '../../src/store/types';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';

// The narrow engine surface `watchWakeSaga` (and its sibling reconcile watchers)
// reach for. Every method is a no-op: a test store has no scheduler, fade
// registry, flow field or bias LUT to drive, and no assertion here inspects
// these — they exist only so `getContext('reconcile')` resolves.
export const NOOP_RECONCILE: ReconcileEffects = {
  requestRender: () => {},
  syncFades: () => {},
  reseedFlow: () => {},
  bakeBias: () => {},
  logCameraState: () => {},
  applySwapFormat: () => {},
};

// An engine that has booted and loaded nothing. Empty, not absent: a `#focus=`
// arrival resolves against this and gets null, so the command saga parks waiting
// for a catalog pulse that never comes — which is the correct behaviour for a
// store with no data behind it, and the difference between a deferred deep link
// and a TypeError that cancels the root saga.
const EMPTY_RESOLVE_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
};

/**
 * The whole context bag, every capability inert. A test store has no engine, so
 * the honest registration is one where each capability answers "nothing here"
 * rather than one where some are missing: an absent capability is a throw at the
 * `getContext` call site, an inert one is a saga that no-ops or defers.
 *
 * Exported so a test needing ONE real capability spreads this and overrides it,
 * instead of hand-assembling five no-ops around it.
 */
export const NOOP_SAGA_CONTEXT: SagaContext = {
  runTierTransition: () => {},
  reconcile: NOOP_RECONCILE,
  resolveDeps: () => EMPTY_RESOLVE_DEPS,
  // Null is the same answer the engine gives pre-bootstrap and post-destroy, and
  // both camera sagas already handle it by no-opping.
  cameraRuntime: () => null,
  // Resolves immediately: a clip with no player has already finished, so the
  // tour saga advances rather than awaiting a promise nothing will settle.
  playClip: () => Promise.resolve(),
  clipPathInspect: {
    compute: () => {},
    recompute: () => {},
    clear: () => {},
    pinnedClip: () => null,
    pinnedFrame: () => null,
  },
};

export function createTestStore(preloadedState?: PreloadedState) {
  const handle = createAppStore(preloadedState);
  handle.setSagaContext(NOOP_SAGA_CONTEXT);
  return handle;
}
