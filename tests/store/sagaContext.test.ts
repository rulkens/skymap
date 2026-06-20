/**
 * SagaContext shape contract — type-level assertions that each member of
 * SagaContext carries the correct function type.
 *
 * `runTierTransition` and `reconcile` predate this task (added by PRs #349 and
 * #352 respectively). `resolveDeps` is the lazy live-resource read introduced
 * in Part 1: the selection reconciler calls it per saga run to get the current
 * catalog + structure state without coupling to the engine's internals.
 * `runFocusTween` is the engine-injected camera-tween runner added in Task 4b:
 * `watchFocusTween` calls it on every focus ref change.
 *
 * Render-wake is NOT added to SagaContext here — it already arrives via
 * `reconcile.requestRender` (see ReconcileEffects).
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { SagaContext } from '../../src/store/types';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';
import type { SelectionRef } from '../../src/@types/engine/SelectionRef';

describe('SagaContext', () => {
  it('carries resolveDeps alongside the existing reconcile/tier capabilities', () => {
    expectTypeOf<SagaContext['resolveDeps']>().toEqualTypeOf<() => ResolveDeps>();
    expectTypeOf<SagaContext['reconcile']>().toEqualTypeOf<ReconcileEffects>();
  });
  it('carries runFocusTween — the engine-injected camera-tween runner', () => {
    expectTypeOf<SagaContext['runFocusTween']>().toEqualTypeOf<
      (ref: SelectionRef | null) => void
    >();
  });
});
