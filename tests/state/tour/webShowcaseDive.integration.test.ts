/**
 * webShowcaseDive integration test — proves the three dive invariants for the
 * webShowcase tour's Virgo → M87 beat sequence.
 *
 * ### What is proven
 *
 *   1. Beat 2 (`flyAndFocusOnClip('cluster-virgo-m87')`) resolves to a clip
 *      that carries a `{ kind:'focus', ref: { type:'structure', id:'cluster-virgo-m87' } }`
 *      cue — the Virgo focus fires at beat start.
 *
 *   2. Beat 3 (`flyToClip('m87')`) resolves to a clip with NO `kind:'focus'` /
 *      `kind:'focusId'` entry anywhere in its timeline — camera-only, so the
 *      Virgo focus from beat 2 persists. M87 rides bright under the isolation dim
 *      because it is a Virgo member and the focus has not changed.
 *
 *   3. A `focus()` cue that fires during an active clip does NOT plant
 *      `camera.tween`. `suspendDuringClip` (see `src/state/selection/suspendDuringClip.ts`)
 *      parks `watchFocusTweenSaga` for the duration of any clip — dispatching
 *      `updateSelectionFocus` while `camera.clip !== null` returns early before
 *      `put(startCameraTween(...))` is reached. The clip@95 driver owns the camera
 *      and navigates to the framing on its own timeline; a leftover tween would
 *      race it on clip-end.
 *
 * ### Approach
 *
 * Assertions 1 and 2 call `resolveClipFoci` directly on each beat's `.enterClip`,
 * which is simpler and faster than running the full saga: the resolved clip is
 * plain data whose structure we can inspect without any async machinery. The
 * deps stub is minimal — Virgo resolves via `structures.byId`, M87 resolves
 * via `famousGalaxiesMeta` + a one-row FamousGalaxy cloud.
 *
 * Assertion 3 wires `watchFocusTweenSaga` into a real Redux store via
 * `sagaMiddleware`, then uses `clipStarted` to activate a clip and
 * `updateSelectionFocus` to trigger the saga worker. After a macrotask flush the
 * tween must remain null — proving `suspendDuringClip` short-circuited the
 * `startCameraTween` dispatch.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { webShowcase } from '../../../src/data/animation/tours/webShowcase';
import { resolveClipFoci } from '../../../src/services/engine/animation/resolveClipFoci';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';

import { Source } from '../../../src/data/source';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';
import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { Effect } from '../../../src/@types/animation/Effect';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { LiveCameraRuntime } from '../../../src/store/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Macro-task boundary — one `flush()` lets a settled Promise continuation run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Collect every node in a clip timeline depth-first, including structural
 * wrappers (seq/all/fork) and their children.
 */
function collectNodes(effects: Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    out.push(e);
    if (e.kind === 'seq' || e.kind === 'all') out.push(...collectNodes(e.children));
    else if (e.kind === 'fork') out.push(...collectNodes([e.child]));
  }
  return out;
}

// ─── Stubs ───────────────────────────────────────────────────────────────────

/** Minimal one-row FamousGalaxy cloud for resolving 'm87' via famousGalaxiesMeta. */
const M87_CLOUD: GalaxyCatalog = makeGalaxyCatalog(1, {
  positions: new Float32Array([1, 0, 0]),
  spectroscopicZ: new Float32Array([0.004]),
  magU: new Float32Array([9]),
  magG: new Float32Array([8.6]),
  magR: new Float32Array([8.6]),
  magI: new Float32Array([8.6]),
  magZ: new Float32Array([8.6]),
  objIDs: new BigUint64Array([41361n]),
  diameterKpc: new Float32Array([40]),
  axisRatio: new Float32Array([0.85]),
  positionAngleDeg: new Float32Array([155]),
});

/**
 * ResolveDeps stub: Virgo resolves via `structures.byId`, M87 via
 * `famousGalaxiesMeta` + the one-row FamousGalaxy cloud. All other catalogs
 * return undefined.
 */
const DIVE_DEPS: ResolveDeps = {
  catalogs: {
    get: (source) => (source === Source.FamousGalaxy ? M87_CLOUD : undefined),
  },
  famousGalaxiesMeta: [
    {
      id: 'm87',
      names: ['M87', 'Virgo A', 'NGC 4486'],
      description: 'Giant elliptical',
      type: 'galaxy',
    },
  ],
  stars: { current: () => null },
  structures: {
    byId: (id) =>
      ({
        type: 'structure',
        id,
        name: id === 'cluster-virgo-m87' ? 'Virgo Cluster' : 'Unknown',
        category: 'cluster',
        worldPos: [16.5, 12.3, -1.2] as [number, number, number],
        physicalRadiusMpc: 2,
        apparentRadiusMpc: 4,
        featured: true,
      }) as const,
  },
};

const CAMERA_RUNTIME: LiveCameraRuntime = {
  from: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  fovYRad: 0.8,
  upBasisQuat: [0, 0, 0, 1],
};

// Arbitrary — both beats resolve only structure refs, never a body.
const SIM_DAYS = 2451545;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('webShowcase dive invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Assertion 1: beat 2 resolved clip carries a focus cue for Virgo ───────

  it('beat 2 resolved clip carries a { kind:"focus", ref: { type:"structure", id:"cluster-virgo-m87" } } cue', () => {
    // flyAndFocusOnClip('cluster-virgo-m87') prepends a focusId cue before
    // the camera-move block. resolveClipFoci rewrites it to a concrete focus cue.
    const beat2Clip: ClipData = webShowcase.beats[1]!.enterClip!;
    const resolved = resolveClipFoci(
      beat2Clip,
      DIVE_DEPS,
      CAMERA_RUNTIME.fovYRad,
      CAMERA_RUNTIME.from,
      SIM_DAYS,
    );

    const nodes = collectNodes(resolved.timeline);
    const focusCues = nodes.filter((e) => e.kind === 'focus') as Array<{
      kind: 'focus';
      ref: unknown;
    }>;

    expect(focusCues.length).toBeGreaterThan(0);
    expect(focusCues[0]).toEqual({
      kind: 'focus',
      ref: { type: 'structure', id: 'cluster-virgo-m87' },
    });
  });

  // ── Assertion 2: beat 3 resolved clip has NO focus cue ────────────────────

  it('beat 3 (flyToClip m87) resolved clip has no focus cue — Virgo focus persists', () => {
    // flyToClip('m87') produces only camera cues (moveTargetId + dollyToId).
    // After resolution there must be no 'focus' or 'focusId' kind, so the
    // selection.focus that beat 2 set (Virgo) stays in place.
    const beat3Clip: ClipData = webShowcase.beats[2]!.enterClip!;
    const resolved = resolveClipFoci(
      beat3Clip,
      DIVE_DEPS,
      CAMERA_RUNTIME.fovYRad,
      CAMERA_RUNTIME.from,
      SIM_DAYS,
    );

    const nodes = collectNodes(resolved.timeline);
    const focusKinds = nodes.filter((e) => e.kind === 'focus' || e.kind === 'focusId');

    expect(focusKinds).toHaveLength(0);
  });

  // ── Assertion 3: focus cue dispatched during a clip does NOT plant tween ──

  it('updateSelectionFocus dispatched while camera.clip !== null does not plant camera.tween', async () => {
    // suspendDuringClip (src/state/selection/suspendDuringClip.ts) guards
    // watchFocusTweenSaga: if selectClipActive returns true the worker exits
    // before put(startCameraTween(...)), so camera.tween stays null.
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefault) => getDefault().concat(sagaMiddleware),
    });

    // Provide resolveDeps and cameraRuntime so the tween-build path has what
    // it needs — if suspendDuringClip did NOT guard, these would be used.
    sagaMiddleware.setContext({
      resolveDeps: () => DIVE_DEPS,
      cameraRuntime: () => CAMERA_RUNTIME,
      playClip: vi.fn<(clip: ClipData) => Promise<void>>().mockResolvedValue(undefined),
    });

    sagaMiddleware.run(watchFocusTweenSaga);

    // Activate a clip so camera.clip !== null.
    const beat2Clip = webShowcase.beats[1]!.enterClip!;
    store.dispatch(clipStarted({ data: beat2Clip, frame: DEFAULT_ORIENTATION }));
    expect(store.getState().camera.clip).not.toBeNull(); // guard: clip is active

    // Dispatch a focus update — this is what an in-clip focus() cue would
    // trigger when applySceneEffect processes it during playback.
    store.dispatch(updateSelectionFocus({ type: 'structure', id: 'cluster-virgo-m87' }));

    // Give the saga worker a chance to run (it won't reach startCameraTween).
    await flush();

    // tween must remain null — suspendDuringClip short-circuited the worker.
    expect(store.getState().camera.tween).toBeNull();
  });
});
