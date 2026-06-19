/**
 * SagaContext shape contract — type-level assertions that each member of
 * SagaContext carries the correct function type.
 *
 * `runTierTransition` and `reconcile` predate this task (added by PRs #349 and
 * #352 respectively). `resolveDeps` is the lazy live-resource read introduced
 * here: the selection reconciler calls it per saga run to get the current
 * catalog + structure state without coupling to the engine's internals.
 *
 * Render-wake is NOT added to SagaContext here — it already arrives via
 * `reconcile.requestRender` (see ReconcileEffects).
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { SagaContext } from '../../src/store/types';
import type { ResolveDeps } from '../../src/@types/engine/ResolveDeps';
import type { ReconcileEffects } from '../../src/store/effects/ReconcileEffects';

describe('SagaContext', () => {
  it('carries resolveDeps alongside the existing reconcile/tier capabilities', () => {
    expectTypeOf<SagaContext['resolveDeps']>().toEqualTypeOf<() => ResolveDeps>();
    expectTypeOf<SagaContext['reconcile']>().toEqualTypeOf<ReconcileEffects>();
  });
});
