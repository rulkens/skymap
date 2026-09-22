/**
 * pickFrameContext — unit tests for the pick-time camera as a value.
 *
 * `pickFrameContext` re-derives a `FrameView` from the last RENDERED pose
 * (`state.cameraRuntime.register.pose`) and the live projection, using the
 * PICK source mask so `ctx.snapshot.visibleSourceMask` means "pickable
 * sources". It returns `null` before the engine is ready. These tests pin
 * all three properties.
 *
 * The fixture composes the two upstream fixtures this helper's inputs come from:
 * the bootstrap-gate handles that `frameContext.test.ts` builds (`cam`,
 * `gpu.*`), plus the `settings.galaxyCatalogs.items` +
 * `subsystems.fades` stub that `deriveSourceMasks.test.ts` builds, plus a
 * `cameraRuntime` carrying the last pose and projection.
 */

import { describe, it, expect } from 'vitest';

import { pickFrameContext } from '../../../../src/services/engine/helpers/pickFrameContext';
import { canvasViewOf } from '../../../helpers/frame/canvasViewOf';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { pivotSurfaceRangeMpc } from '../../../../src/services/engine/camera/pivotSurfaceRangeMpc';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { FadeId } from '../../../../src/@types/animation/FadeId';

const LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
const PROJECTION: CameraProjection = { fovYRad: 1.2, aspect: 16 / 9, near: 0.1, far: 10000 };
// A distinct non-J2000 instant so the pick's epoch is observable on
// `ctx.snapshot.simDays` and separable from the J2000 seed a construction-time
// derive would poison with.
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
    booted?: boolean;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
    enabledOverrides?: Partial<Record<GalaxyCatalogId, boolean>>;
  } = {},
): EngineState {
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
    booted: overrides.booted ?? true,
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
      bodies: { items: {} },
    },
    // No focused pivot in this fixture — see frameContext.test.ts's makeState
    // for why `deriveSlabs` needs this field once a pivot radius is threaded in.
    selectionRows: { hover: null, select: null, focus: null },
    // No seeded bodies/stars — see frameContext.test.ts's makeState for why
    // `deriveFrameContext` needs this now.
    data: { bodies: { earth: null, planets: [], meshBodies: [] } },
    cameraRuntime: {
      register: { pose: absoluteArm(LAST_POSE) },
      outputs: {
        displayed: absoluteArm(LAST_POSE),
        projection: PROJECTION,
        simDays: LAST_SIM_DAYS,
        upBasis: ORIENTATION_FRAMES.equatorial,
      },
    },
    picking: { pickInFlight: false, pointerDown: false, cursorTexPx: null },
  } as unknown as EngineState;
}

function makeCanvas(width = 1920, height = 1080): HTMLCanvasElement {
  return { width, height } as unknown as HTMLCanvasElement;
}

describe('pickFrameContext', () => {
  it('returns null before the engine is ready', () => {
    // Missing one of the two core gate handles → `deriveFrameContext` reports
    // not-ready → `pickFrameContext` returns null (not a not-ready context).
    // The galaxy/pick renderers are no longer part of the gate (D13) — a null
    // `galaxyPointRenderer` alone no longer blocks the pick context.
    expect(pickFrameContext(makeState({ booted: false }), makeCanvas())).toBeNull();
    expect(pickFrameContext(makeState({ renderTargets: null }), makeCanvas())).toBeNull();
    expect(pickFrameContext(makeState({ compositor: null }), makeCanvas())).toBeNull();
  });

  it('reproduces the frame’s camera from register.pose + projection', () => {
    const state = makeState();
    const canvas = makeCanvas();
    const ctx = pickFrameContext(state, canvas);
    expect(ctx).not.toBeNull();
    if (ctx === null) return;

    // The camera the pick pass draws from must equal the one `deriveFrameContext`
    // produces for the SAME register.pose + projection the last frame rendered.
    const basis = ORIENTATION_FRAMES[state.settings.orientation];
    const expected = canvasViewOf(
      state,
      {
        cam: assembleOrbitCamera(LAST_POSE, state.cameraRuntime.outputs.projection, basis, basis),
        arm: absoluteArm(LAST_POSE),
        altitudeMpc: pivotSurfaceRangeMpc(absoluteArm(LAST_POSE), LAST_POSE.distance, null),
        nowMs: 0,
        // simDays does not affect the view-projection this test compares; any
        // valid epoch reproduces the same vp.
        simDays: 0,
        visibleSourceMask: deriveSourceMasks(state, 0).pick,
      },
      { width: canvas.width, height: canvas.height },
    );
    expect(expected).not.toBeNull();
    if (expected === null) return;
    expect(Array.from(ctx.vp)).toEqual(Array.from(expected.vp));
  });

  it('derives at the last FRAME instant even after a between-frames J2000 derive', () => {
    // The poison scenario: a construction-time / selection-time caller runs
    // `deriveBodyStates(CONST_J2000)` in the gap between the last frame and this
    // pick (e.g. `extractSelectionRow`). If the pick read the derive memo's
    // cached key it would re-derive pickable bodies at J2000 while the screen
    // still shows LAST_SIM_DAYS — a pick/draw epoch desync. Single-writer state
    // (`cameraRuntime.outputs.simDays`, written only by runFrame) is immune:
    // the memo write does not touch it, so the pick stays at the frame instant.
    const state = makeState();
    deriveBodyStates(CONST_J2000);
    const ctx = pickFrameContext(state, makeCanvas());
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.snapshot.simDays).toBe(LAST_SIM_DAYS);
    expect(ctx.snapshot.simDays).not.toBe(CONST_J2000);
  });

  it('carries the pick mask as visibleSourceMask', () => {
    // Disable one catalog: its pick bit clears, so the mask on the ready context
    // must equal `deriveSourceMasks(state).pick`, NOT `.draw`.
    const disabledId = galaxyCatalogIdOf(GALAXY_CATALOG_SOURCES[0]!);
    const state = makeState({ enabledOverrides: { [disabledId]: false } });
    const ctx = pickFrameContext(state, makeCanvas());
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.snapshot.visibleSourceMask).toBe(deriveSourceMasks(state, 0).pick);
  });
});
