/**
 * createTestStore — `createAppStore` plus the inert saga context the running app always has.
 * `watchWakeSaga` reads `getContext('reconcile')` on every wake write; a bare test store lacks it
 * and the undefined dereference is stderr noise. Guarding in the saga would mask a real
 * production misconfiguration, so tests fix it here.
 *
 * Registering is what fires `sagaContextRegistered`, which releases the hash bridge: a hash
 * left on `window.location` by an earlier test then does a real arrival read that reaches
 * `selection`. With a partial bag that read threw and cancelled every root-saga watcher.
 */

import { createAppStore, type PreloadedState } from '../../src/store/createAppStore';
import { composeSelectionRows } from '../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../src/layers/body/present/bodySelectionRow';
import { structureSelectionRow } from '../../src/layers/structure/present/structureSelectionRow';
import { ALL_KINDS_ENABLED } from './allKindsEnabled';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';
import type { SagaContext } from '../../src/store/types';
import type { StructureRowFixture } from './selectionResolverOver';

export const NOOP_RECONCILE: ReconcileEffects = {
  requestRender: () => {},
  syncFades: () => {},
  logCameraState: () => null,
  applySwapFormat: () => {},
};

// Empty, not absent: a `#focus=` arrival gets null and the command saga parks, where an
// absent resolver would be a TypeError that cancels the root saga.
const EMPTY_STRUCTURES: StructureRowFixture = { byId: () => null, byCategory: () => [] };

/**
 * The whole context bag, every capability inert: an absent capability throws at the
 * `getContext` call site, an inert one makes the saga no-op or defer. Spread it to override one.
 */
export const NOOP_SAGA_CONTEXT: SagaContext = {
  nextFrame: () => Promise.resolve(),
  reconcile: NOOP_RECONCILE,
  selection: composeSelectionRows(
    () => [bodySelectionRow(), structureSelectionRow(EMPTY_STRUCTURES)],
    () => ALL_KINDS_ENABLED,
  ),
  cameraRuntime: () => null,
  // Resolves immediately so the tour saga advances rather than awaiting a promise nothing settles.
  playClip: () => Promise.resolve(),
  clipPathInspect: {
    compute: () => {},
    recompute: () => {},
    clear: () => {},
    pinnedClip: () => null,
    pinnedFrame: () => null,
  },
  home: { focus: null, seedSelection: false },
};

export function createTestStore(preloadedState?: PreloadedState) {
  const handle = createAppStore(preloadedState);
  handle.setSagaContext(NOOP_SAGA_CONTEXT);
  return handle;
}
