/**
 * pickFrameContext — unit tests for the pick-time camera as a value.
 *
 * `pickFrameContext` re-derives a `ReadyFrameContext` from the last RENDERED
 * pose (`state.cameraRuntime.lastPose.current`) and the live projection, using
 * the PICK source mask so `ctx.visibleSourceMask` means "pickable sources". It
 * returns `null` before the engine is ready. These tests pin all three
 * properties.
 *
 * The fixture composes the two upstream fixtures this helper's inputs come from:
 * the bootstrap-gate handles that `frameContext.test.ts` builds (`cam`, `gpu.*`,
 * `subsystems.texturedDisks`), plus the `settings.galaxyCatalogs.items` +
 * `subsystems.fades` stub that `deriveSourceMasks.test.ts` builds, plus a
 * `cameraRuntime` carrying the last pose and projection.
 */

import { describe, it, expect } from 'vitest';

import { pickFrameContext } from '../../../../src/services/engine/helpers/pickFrameContext';
import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { FadeId } from '../../../../src/@types/animation/FadeId';

const LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
const PROJECTION: CameraProjection = { fovYRad: 1.2, aspect: 16 / 9, near: 0.1, far: 10000 };
// A distinct non-J2000 instant so the pick's epoch is observable on `ctx.simDays`
// and separable from the J2000 seed a construction-time derive would poison with.
const LAST_SIM_DAYS = 2460000.0;

/**
 * Build an `EngineState`-shaped fixture with every bootstrap-gate handle
 * populated (so `isEngineReady` passes by default), a `cameraRuntime` carrying
 * `LAST_POSE` + `PROJECTION`, and the `settings`/`fades` that `deriveSourceMasks`
 * reads. `enabledOverrides` flips specific galaxy-catalog ids to control the
 * pick mask; nulling any gate handle exercises the not-ready branch.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
    enabledOverrides?: Partial<Record<GalaxyCatalogId, boolean>>;
  } = {},
): EngineState {
  const cam =
    overrides.cam === undefined
      ? ({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: 100,
          position: new Float32Array(3),
        } as unknown as OrbitCamera)
      : overrides.cam;
  const galaxyPointRenderer =
    overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const galaxyPickRenderer =
    overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;

  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => {
      const id = galaxyCatalogIdOf(s);
      const enabled = overrides.enabledOverrides?.[id] ?? true;
      return [id, { enabled, labelEnabled: true }];
    }),
  );

  return {
    cam,
    gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
    subsystems: {
      texturedDisks,
      // Fully faded by default; pick mask is driven by `enabled` alone anyway.
      fades: { opacityOf: (id: FadeId) => (id.kind === 'galaxyCatalog' ? 0 : 0) },
    },
    settings: {
      galaxyCatalogs: { items },
      orientation: 'equatorial',
      // Read unconditionally by `visibleStars` past the ready gate — see
      // frameContext.test.ts's makeState for the same addition and why.
      starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
      bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
    },
    // No focused pivot in this fixture — see frameContext.test.ts's makeState
    // for why `deriveSlabs` needs this field once a pivot radius is threaded in.
    selectionRows: { hover: null, select: null, focus: null },
    // No seeded bodies/stars — see frameContext.test.ts's makeState for why
    // `deriveFrameContext` needs this now.
    data: { bodies: { earth: null, planets: [], stars: [] } },
    cameraRuntime: {
      lastPose: { current: LAST_POSE },
      projection: PROJECTION,
      lastRenderedSimDays: { current: LAST_SIM_DAYS },
    },
  } as unknown as EngineState;
}

function makeCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement;
}

describe('pickFrameContext', () => {
  it('returns null before the engine is ready', () => {
    // Any missing bootstrap-gate handle → `deriveFrameContext` reports
    // not-ready → `pickFrameContext` returns null (not a not-ready context).
    expect(pickFrameContext(makeState({ cam: null }), makeCanvas())).toBeNull();
    expect(pickFrameContext(makeState({ galaxyPointRenderer: null }), makeCanvas())).toBeNull();
    expect(pickFrameContext(makeState({ galaxyPickRenderer: null }), makeCanvas())).toBeNull();
  });

  it('reproduces the frame’s camera from lastPose + projection', () => {
    const state = makeState();
    const canvas = makeCanvas();
    const ctx = pickFrameContext(state, canvas);
    expect(ctx).not.toBeNull();
    if (ctx === null) return;

    // The camera the pick pass draws from must equal the one `deriveFrameContext`
    // produces for the SAME lastPose + projection the last frame rendered.
    const expected = deriveFrameContext(
      state,
      canvas,
      state.cameraRuntime.lastPose.current,
      state.cameraRuntime.projection,
      // Same steady basis `pickFrameContext` resolves internally for BOTH
      // halves, so the two cameras decode position and screen-up through the
      // same pole and their vp matches.
      ORIENTATION_FRAMES[state.settings.orientation],
      ORIENTATION_FRAMES[state.settings.orientation],
      deriveSourceMasks(state).pick,
      0,
      // simDays does not affect the view-projection this test compares; any
      // valid epoch reproduces the same vp.
      0,
    );
    expect(expected.isReady).toBe(true);
    if (!expected.isReady) return;
    expect(Array.from(ctx.vp)).toEqual(Array.from(expected.vp));
  });

  it('derives at the last FRAME instant even after a between-frames J2000 derive', () => {
    // The poison scenario: a construction-time / selection-time caller runs
    // `deriveBodyStates(CONST_J2000)` in the gap between the last frame and this
    // pick (e.g. `extractSelectionRow`). If the pick read the derive memo's
    // cached key it would re-derive pickable bodies at J2000 while the screen
    // still shows LAST_SIM_DAYS — a pick/draw epoch desync. Single-writer state
    // (`cameraRuntime.lastRenderedSimDays`, written only by runFrame) is immune:
    // the memo write does not touch it, so the pick stays at the frame instant.
    const state = makeState();
    deriveBodyStates(CONST_J2000);
    const ctx = pickFrameContext(state, makeCanvas());
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.simDays).toBe(LAST_SIM_DAYS);
    expect(ctx.simDays).not.toBe(CONST_J2000);
  });

  it('carries the pick mask as visibleSourceMask', () => {
    // Disable one catalog: its pick bit clears, so the mask on the ready context
    // must equal `deriveSourceMasks(state).pick`, NOT `.draw`.
    const disabledId = galaxyCatalogIdOf(GALAXY_CATALOG_SOURCES[0]!);
    const state = makeState({ enabledOverrides: { [disabledId]: false } });
    const ctx = pickFrameContext(state, makeCanvas());
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.visibleSourceMask).toBe(deriveSourceMasks(state).pick);
  });
});
