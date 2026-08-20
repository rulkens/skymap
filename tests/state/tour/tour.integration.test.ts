/**
 * tour.integration.test — opacity-composition integration test for the
 * `cosmicFlows` clip.
 *
 * ### What is proven here
 *
 * Three load-bearing behavioural properties:
 *
 *   1. The `fade(['flow'], 0, 0)` clip-opacity mask holds the composed flow alpha
 *      at zero from the moment `setFlowEnabled` fires until the
 *      `fade(['flow'], 1, 3)` lift completes, even as the intent opacity rises.
 *
 *   2. The crossfade `all([fade flow→1, fade survey→0])` dims the galaxy-points
 *      layer via `clipOpacity` only — the FadeRegistry intent value (survey
 *      intentOpacity) stays at 1 because no `hide(['survey'])` is dispatched.
 *
 *   3. Calling `clipPlayer.stop()` resets every clip factor to 1, restoring the
 *      composed alpha to `intentOpacity × focusRecession` (the clip-free steady state).
 *
 * ### What is NOT built here
 *
 * This test READS the composed alpha — it builds NONE of the channel/composition
 * machinery that Plan A's tasks implement. Specifically:
 *   - `resolveLayerOpacity` is imported as-is (tested in focusRecession.test.ts).
 *   - `createClipPlayer` is imported as-is (tested in playClipFlyout.integration.test.ts).
 *   - No ad-hoc frame driver beyond what Template 2 (playClipFlyout) shows.
 *
 * ### Harness pattern
 *
 * Follows two templates:
 *   - Template 1 (focusRecession.test.ts): `makeClipPlayer(factor)` stub for the
 *     three-way product assertion; `resolveLayerOpacity` for the composition call.
 *   - Template 2 (playClipFlyout.integration.test.ts): real `createClipPlayer` +
 *     real Redux store + `tick(nowMs)` frame simulation for driving scene cues.
 *
 * ### Clock model
 *
 * `clipElapsed` keys on `camera.clip` reference identity. `clipStarted(data)`
 * stores a fresh wrapper, setting the start stamp on the first tick. A tick at
 * `nowMs=0` primes the clock (elapsed=0). Ticking at `nowMs=N` gives
 * `elapsed = N/1000` seconds, so:
 *   - nowMs=2000 → elapsed=2s → cues at atSec=2 fire (hide, mask-fade, scene).
 *   - nowMs=4000 → elapsed=4s → crossfade cues at atSec=4 fire.
 *   - nowMs=7000 → elapsed=7s → 3-second fades started at t=4000ms complete.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { createClipPlayer } from '../../../src/services/engine/subsystems/clipPlayer';
import { createCameraClock } from '../../../src/services/engine/camera/cameraClock';
import { createFadeRegistry } from '../../../src/services/animation/fadeRegistry';
import { resolveLayerOpacity } from '../../../src/services/engine/presentation/focusRecession';
import { cosmicFlows } from '../../../src/data/animation/clips/cosmicFlows';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';

import type { ClipPlayer } from '../../../src/@types/engine/subsystems/ClipPlayer';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { FadeId } from '../../../src/@types/animation/FadeId';

// ---------------------------------------------------------------------------
// Template 1 helper — three-way-product composition stub
// (Mirrors makeClipPlayer in focusRecession.test.ts exactly.)
// ---------------------------------------------------------------------------

/**
 * Build a minimal ClipPlayer stub: `clipOpacityOf` returns `factor` for every
 * call; `tick`, `stop`, `registerEndResolver`, and `destroy` are no-ops. Typed
 * to satisfy `ClipPlayer` without bare `vi.fn()` (bare fails tsc).
 */
function makeClipStub(factor: number): ClipPlayer {
  return {
    tick: vi.fn<(nowMs: number) => void>(),
    stop: vi.fn<() => void>(),
    registerEndResolver: vi.fn<(onEnd: () => void) => void>(),
    clipOpacityOf: vi.fn<(layer: VisibilityLayerKey, nowMs: number) => number>(() => factor),
    destroy: vi.fn<() => void>(),
  };
}

/**
 * Minimal `Pick<EngineState, 'subsystems'>` fixture for `resolveLayerOpacity` —
 * only the two fields it reads. Cast through `unknown` since the two-field
 * literal doesn't structurally satisfy the full `EngineSubsystemHandles` the
 * picked type still demands.
 */
function makeResolveOpacityState(
  fades: ReturnType<typeof createFadeRegistry>,
  clipPlayer: ClipPlayer,
): Pick<EngineState, 'subsystems'> {
  return { subsystems: { fades, clipPlayer } } as unknown as Pick<EngineState, 'subsystems'>;
}

// ---------------------------------------------------------------------------
// Template 2 helpers — real clipPlayer harness
// (Mirrors the fixture style in playClipFlyout.integration.test.ts.)
// ---------------------------------------------------------------------------

/** Build a minimal Redux store from the production root reducer. */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

/**
 * Build a minimal fake EngineState for applySceneEffect's show/hide/scene arms.
 *
 * Pattern from applySceneEffect.test.ts's makeEngineState. The closures inside
 * syncVisibilityFades reach for:
 *   - `state.settings` — snapshot at call time; `getEngineState()` is called
 *     fresh per cue, so each cue sees the live settings.
 *   - `state.subsystems.fades.setImmediate` — no-op stub (hide with over:0).
 *   - `state.subsystems.scheduler.requestRender` — no-op stub (snap path wake).
 *   - `state.assetSlots`, `state.gpu` — stub objects for guard closures that
 *     check loaded-state on demand-loaded rows (flow, filament).
 */
function makeEngineState(settings: EngineSettingsState): EngineState {
  return {
    settings,
    subsystems: {
      fades: {
        fadeTo: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        setImmediate: vi.fn<() => void>(),
      },
      scheduler: { requestRender: vi.fn<() => void>() },
    },
    gpu: { flowFieldRenderer: { fieldLoaded: () => false } },
    assetSlots: {},
  } as unknown as EngineState;
}

// ---------------------------------------------------------------------------
// Three-way composition check (Template 1)
// ---------------------------------------------------------------------------

describe('three-way opacity product: intent × focus × clip', () => {
  it('a clip factor of 0 collapses composed alpha regardless of intent', () => {
    // Mirrors the existing test in focusRecession.test.ts —
    // proves resolveLayerOpacity includes the clip factor.
    const fades = createFadeRegistry({ requestRender: () => {} });
    const handle: FadeId = { kind: 'flow' };
    fades.register(handle, 1); // flow fully visible (intent=1)

    const clipAtZero = makeClipStub(0);
    const stateAtZero = makeResolveOpacityState(fades, clipAtZero);
    // 1 (intent) × 1 (no focus recession for flow) × 0 (clip) = 0
    expect(resolveLayerOpacity(stateAtZero, { focusBlend: 0, nowMs: 0 }, handle)).toBe(0);
  });

  it('a clip factor of 1 is neutral — composed alpha is the bare intent × recession product', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    const handle: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.8, 0, 0); // intent = 0.8

    const clipAtOne = makeClipStub(1);
    const state = makeResolveOpacityState(fades, clipAtOne);
    // Hand-computed: intent 0.8 × recession 1 (galaxyCatalog never recedes) × clip 1 = 0.8.
    expect(resolveLayerOpacity(state, { focusBlend: 0, nowMs: 0 }, handle)).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// Real clipPlayer integration — drive cosmicFlows through tick() frames
// ---------------------------------------------------------------------------

describe('cosmicFlows clip — clipOpacity end-to-end', () => {
  /**
   * Shared setup: one store, one clock, one clipPlayer. The cosmicFlows start
   * pose is concrete (not 'live'), so clipStarted can take it directly — no
   * resolveClipStart call needed. We dispatch clipStarted at nowMs=0; ticking
   * at nowMs=N gives elapsed = N/1000 seconds.
   */
  function setupClip() {
    const store = makeStore();
    const clock = createCameraClock();

    // `getEngineState` is a lazy closure — called per-cue at fire time — so
    // each cue sees the live settings state after any dispatches the hide cue
    // itself issued. A fresh EngineState object is built per call.
    const clipPlayer = createClipPlayer({
      store,
      requestRender: () => {},
      clock,
      getEngineState: () =>
        makeEngineState(store.getState().settings as unknown as EngineSettingsState),
    });

    // Activate the clip. cosmicFlows.data.start is a concrete CameraPose — no
    // 'live' token — so clipStarted receives it as-is. The fresh wrapper object
    // triggers the clipElapsed clock reset on the first tick.
    store.dispatch(clipStarted({ data: cosmicFlows.data, frame: DEFAULT_ORIENTATION }));

    return { store, clock, clipPlayer };
  }

  // ── Assertion 1 ───────────────────────────────────────────────────────────
  //
  // The flow mask keeps composed alpha at 0 until the lift.
  // - `fade(['flow'], 0, 0)` fires at elapsed=2s → clipOpacity('flow')=0 instantly.
  // - `fade(['flow'], 1, 3)` fires at elapsed=4s → 3-second lift.
  // - At elapsed=3s (between mask and lift), flow clipOpacity is still 0.
  // - At elapsed=7s (lift complete), flow clipOpacity is 1.

  it('the flow mask keeps composed alpha at 0 until the lift', () => {
    const { clipPlayer } = setupClip();

    // Prime the clock (arrival frame, elapsed=0). No cues fire yet.
    clipPlayer.tick(0);

    // Advance to elapsed=3s: the mask-fade and scene cues have fired (at 2s),
    // but the lift (atSec=4) has not. Flow clipOpacity should be exactly 0.
    clipPlayer.tick(2_000); // fire mask + scene cues (elapsed=2)
    clipPlayer.tick(3_000); // between mask and lift (elapsed=3)

    const flowFactorBeforeLift = clipPlayer.clipOpacityOf('flow', 3_000);
    expect(flowFactorBeforeLift).toBe(0);

    // Advance to elapsed=4s: the lift cue fires (`fade(['flow'], 1, 3000ms)`).
    clipPlayer.tick(4_000);

    // At the exact lift-start moment the factor is still near 0 (smoothstep at t=0).
    const flowFactorAtLiftStart = clipPlayer.clipOpacityOf('flow', 4_000);
    expect(flowFactorAtLiftStart).toBeCloseTo(0, 5);

    // Advance to elapsed=7s: the 3-second lift (started at t=4000ms) is complete.
    clipPlayer.tick(7_000);

    const flowFactorAfterLift = clipPlayer.clipOpacityOf('flow', 7_000);
    expect(flowFactorAfterLift).toBe(1);

    clipPlayer.destroy();
  });

  // ── Assertion 2 ───────────────────────────────────────────────────────────
  //
  // The crossfade dims galaxies without touching intent.
  // - `fade(['survey'], 0, 3)` fires at elapsed=4s → 3-second dim.
  // - At elapsed=7s the survey clip factor is 0.
  // - The FadeRegistry for 'galaxyCatalog' is unregistered (untouched) →
  //   opacityOf returns 1.0 (fail-safe). The dim is ENTIRELY via clipOpacity.

  it('the crossfade dims galaxies without touching intent', () => {
    const { store, clipPlayer } = setupClip();

    clipPlayer.tick(0);
    clipPlayer.tick(2_000); // mask + scene cues fire
    clipPlayer.tick(4_000); // crossfade cues fire: fade(flow→1,3) + fade(survey→0,3)

    // At t=7000ms the 3-second survey dim is complete.
    clipPlayer.tick(7_000);

    const surveyClipFactor = clipPlayer.clipOpacityOf('survey', 7_000);
    expect(surveyClipFactor).toBe(0);

    // Confirm intent is untouched: the settings store's galaxyCatalogs.items
    // must still match its boot seed (no hide(['survey']) dispatched). Boot
    // seed is SOURCE_REGISTRY's `visible` field per catalog (buildInitialSettings),
    // not a blanket `true` — DesiDeep boots with visible:false. So the fixture
    // for "untouched" is the registry entry per id, not a hardcoded literal.
    const settings = store.getState().settings;
    // Every catalog item's `enabled` should still equal its registry-seeded
    // boot value. We check that the settings slice was NOT driven away from
    // that seed for any item by the clip's crossfade (which only writes
    // clipOpacity, not intent).
    const catalogItems = settings.galaxyCatalogs.items as Record<string, { enabled: boolean }>;
    for (const [id, item] of Object.entries(catalogItems)) {
      const entry = SOURCE_ENTRIES.find((e) => e.id === id);
      expect(entry).toBeDefined();
      // Intent stays at its boot value — the clip's crossfade only dims via clipOpacity.
      expect(item.enabled).toBe(entry!.visible);
    }

    clipPlayer.destroy();
  });

  // ── Assertion 3 ───────────────────────────────────────────────────────────
  //
  // Clip end restores composed alpha to the steady state.
  // After stop(), clipOpacityOf resets to 1 for every layer, so the composed
  // alpha returns to `intentOpacity × focusRecession` (clip factor gone).

  it('clip end restores composed alpha to the steady state', () => {
    const { clipPlayer } = setupClip();

    clipPlayer.tick(0);
    clipPlayer.tick(2_000);
    clipPlayer.tick(4_000); // crossfade fires; survey → 0, flow → rising

    // Mid-crossfade: survey factor is < 1 (dimming), flow factor is > 0 (lifting).
    const surveyMid = clipPlayer.clipOpacityOf('survey', 5_000);
    expect(surveyMid).toBeGreaterThanOrEqual(0);
    expect(surveyMid).toBeLessThan(1);

    // Stop the clip immediately. clipOpacity.reset() snaps every factor to 1.
    clipPlayer.stop();

    // After stop, every layer's clip factor returns to 1.
    const surveyAfterStop = clipPlayer.clipOpacityOf('survey', 5_000);
    const flowAfterStop = clipPlayer.clipOpacityOf('flow', 5_000);
    expect(surveyAfterStop).toBe(1);
    expect(flowAfterStop).toBe(1);

    // Composed alpha for a layer with intent=1 and no focus recession is now
    // entirely determined by the registry factor. Build a stub registry to
    // confirm the three-way product with clip factor=1 equals the two-way
    // baseline (Template 1 pattern).
    const fades = createFadeRegistry({ requestRender: () => {} });
    const flowHandle: FadeId = { kind: 'flow' };
    fades.register(flowHandle, 0);
    fades.fadeTo(flowHandle, 1, 0, 0); // intent = 1

    const clipAtOne = makeClipStub(1); // factor 1 = clip is gone
    const state = makeResolveOpacityState(fades, clipAtOne);
    const composed = resolveLayerOpacity(state, { focusBlend: 0, nowMs: 0 }, flowHandle);
    // 1 (intent) × 1 (no recession for flow) × 1 (clip gone) = 1
    expect(composed).toBe(1);

    clipPlayer.destroy();
  });
});
