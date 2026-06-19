// @vitest-environment jsdom

/**
 * registerReconcile — asserts that createEngine registers the reconcile effects
 * bag into the saga context alongside runTierTransition.
 *
 * `createEngine`'s synchronous prefix builds `state` + `bootstrapDeps` and
 * calls `cb.setSagaContext(...)` BEFORE the async GPU bootstrap IIFE. That
 * prefix touches no GPU device and no canvas methods, but it does bind
 * `requestAnimationFrame` via the RenderScheduler (a global the sync prefix
 * constructs), so the test runs under jsdom. The async IIFE then fails GPU
 * init in Node, but the error is caught internally and reported via
 * `cb.lifecycle.onStatusChange`. No unhandled rejection; no assertion about
 * engine readiness.
 *
 * What we assert:
 *   - `setSagaContext` is called exactly once during the synchronous prefix.
 *   - The argument carries a `reconcile` bag with four function members
 *     (`requestRender`, `syncFades`, `reseedFlow`, `bakeBias`), confirming
 *     `makeReconcileEffects(state)` ran and its closures are in the context.
 *   - The same argument carries `runTierTransition` as a function — the two
 *     runners reach the saga context in one unified call, not split across two.
 *
 * The real store (via `createAppStore`) is used for `cb.store` because the
 * engine reads `store.getState().settings` immediately in its synchronous
 * prefix; a plain object stub would fail that read.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEngine } from '../../../src/services/engine/engine';
import { createAppStore } from '../../../src/store/createAppStore';
import { makeSettingsFixture } from '../../state/settings/makeSettingsFixture';
import type { SetSagaContext } from '../../../src/store/types';
import type { EngineCallbacks } from '../../../src/@types/engine/EngineCallbacks';

describe('createEngine — saga context registration', () => {
  it('registers runTierTransition and reconcile in one setSagaContext call', () => {
    // A canvas stub — the synchronous prefix does not read any canvas property,
    // so the empty object satisfies the HTMLCanvasElement slot.
    const canvas = {} as unknown as HTMLCanvasElement;

    // A real store so the engine's synchronous settings read doesn't throw.
    const { store } = createAppStore({
      settings: makeSettingsFixture(),
    });

    // Typed spy: the return type of SetSagaContext is void, so `() => void`
    // is the correct typing for tsc to accept it where SetSagaContext is expected.
    const setSagaContext = vi.fn<SetSagaContext>();

    const cb: EngineCallbacks = {
      store,
      setSagaContext,
      lifecycle: { onStatusChange: vi.fn<() => void>() },
      selection: {
        onSelectChange: vi.fn<() => void>(),
        onHoverChange: vi.fn<() => void>(),
      },
    };

    // Call createEngine — runs the synchronous prefix, which calls setSagaContext,
    // then launches the async GPU bootstrap IIFE (which will fail in Node, caught
    // internally and forwarded to onStatusChange above).
    createEngine(canvas, cb);

    // The registration is synchronous — assert immediately after the call.
    expect(setSagaContext).toHaveBeenCalledTimes(1);

    const [ctx] = setSagaContext.mock.calls[0]!;

    // runTierTransition remains on the same call — the registration is unified.
    expect(typeof ctx.runTierTransition).toBe('function');

    // reconcile is the new bag from makeReconcileEffects.
    expect(ctx.reconcile).toBeDefined();
    expect(typeof ctx.reconcile!.requestRender).toBe('function');
    expect(typeof ctx.reconcile!.syncFades).toBe('function');
    expect(typeof ctx.reconcile!.reseedFlow).toBe('function');
    expect(typeof ctx.reconcile!.bakeBias).toBe('function');
  });
});
