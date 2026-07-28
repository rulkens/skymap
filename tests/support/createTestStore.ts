/**
 * createTestStore — `createAppStore` plus the reconcile saga-context the running
 * app always has by the time a wake write can occur.
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
 */

import { createAppStore, type PreloadedState } from '../../src/store/createAppStore';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';

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
};

export function createTestStore(preloadedState?: PreloadedState) {
  const handle = createAppStore(preloadedState);
  handle.setSagaContext({ reconcile: NOOP_RECONCILE });
  return handle;
}
