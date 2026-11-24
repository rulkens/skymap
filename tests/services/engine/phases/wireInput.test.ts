/**
 * wireInput — focused test for the highest-leverage invariant of the
 * third bootstrap phase: the initial camera framing call.
 *
 * `homePose` is called with a 60° FOV and the result drives the boot pose
 * seed. No bbox input — framing uses pure constants so the phase can run
 * before any galaxy catalog arrives.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../../../src/store/rootReducer';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../../src/@types/engine/BootstrapDeps';
import { APP_HOME } from '../../../../src/compositions/appHome';

const homePoseSpy = vi.fn(() => ({
  frame: 'absolute' as const,
  pose: {
    target: [0, 0, 0] as [number, number, number],
    distance: 0.43,
    yaw: 3.0045,
    pitch: 0.0609,
  },
}));
vi.mock('../../../../src/services/engine/camera/framing/homePose', () => ({
  homePose: (...args: unknown[]) => homePoseSpy(...(args as Parameters<typeof homePoseSpy>)),
}));

vi.mock('../../../../src/services/engine/frame/pickProgram', () => ({
  createPickProgram: vi.fn(() => ({
    label: 'pickProgram',
    pick: vi.fn(async () => null),
    renderForDebug: vi.fn(() => null),
    destroy: vi.fn(),
  })),
}));

vi.mock('../../../../src/services/engine/interaction/createPickDriver', () => ({
  createPickDriver: vi.fn(() => ({ destroy: vi.fn() })),
}));

vi.mock('../../../../src/services/engine/interaction/attachResizeWake', () => ({
  attachResizeWake: vi.fn(() => ({ detach: vi.fn() })),
}));

import { wireInput } from '../../../../src/services/engine/phases/wireInput';
// The registry itself: derives the wireInput-phase key set for the
// phase-split assertion below, rather than a hand-written key list that
// could drift from GPU_HANDLE_ROWS.
import { GPU_HANDLE_ROWS } from '../../../../src/services/engine/gpuHandles/gpuHandleRegistry';
import { selectSelectedRef, selectFocusRef } from '../../../../src/state/selection/selectors';
import { manualPausedAtActions } from '../../../../src/state/time/enterManualPausedAt';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';

/** Only what the phase reads; everything else it writes. A read of any other
 *  field surfaces as a runtime undefined, not a silently-passing stub. */
function makeState(): EngineState {
  return {
    gpu: {},
    subsystems: { scheduler: { requestRender: vi.fn() } },
    booted: false,
  } as unknown as EngineState;
}

function makeDeps(): BootstrapDeps {
  return {
    canvas: { width: 800, height: 600 },
    cb: { store: configureStore({ reducer: rootReducer }) },
    composition: { layers: [], home: APP_HOME },
    selection: { resolvePick: () => null },
    phaseLocals: { device: {} },
  } as unknown as BootstrapDeps;
}

describe('wireInput', () => {
  it('frames the boot camera at the canonical 60° FOV and the live sim instant', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(homePoseSpy).toHaveBeenCalledTimes(1);
    // The boot store defaults to the ecliptic orientation, so the phase threads
    // that committed basis into the framing call (first-paint encodes through the
    // frame the render path decodes with).
    expect(homePoseSpy).toHaveBeenCalledWith(
      deps.composition.home,
      (Math.PI / 180) * 60,
      expect.any(Number),
      ORIENTATION_FRAMES.ecliptic,
    );
    expect(state.booted).toBe(true);
  });

  it("frames the boot camera at a linked `t=`'s instant, not the wall clock", async () => {
    // A focus link with no pose keeps this base's yaw and pitch, so a wall-clock
    // base made the same link frame differently on every load.
    const state = makeState();
    const deps = makeDeps();
    const instant = new Date('2026-09-18T06:00:00Z');
    for (const action of manualPausedAtActions(instant)) deps.cb.store.dispatch(action);
    homePoseSpy.mockClear();

    await wireInput(state, deps);

    expect(homePoseSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      unixMsToJulianDays(instant.getTime()),
      expect.anything(),
    );
  });

  it('seeds the runtime off the PRE-commit store, so frame one reads the boot commit as outside', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    // B2: `stepCameraRuntime`'s `external` check is `prev.base !== store.base`
    // by reference — true here because the seed ran before the commit below
    // it, off the still-placeholder store, so the boot pose lands settled
    // rather than through an eased follow approach.
    expect(state.cameraRuntime.base).not.toBe(deps.cb.store.getState().camera.intent.base);
  });

  it('seeds no selection: the first view is the arrival’s', async () => {
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    const root = deps.cb.store.getState();
    expect(selectSelectedRef(root)).toBeNull();
    expect(selectFocusRef(root)).toBeNull();
  });

  it('frames the neutral pose for a composition with no home target', async () => {
    const state = makeState();
    const deps = {
      ...makeDeps(),
      composition: { layers: [], home: { ...APP_HOME, focus: null } },
    };

    await wireInput(state, deps);

    expect(homePoseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ focus: null }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('wires the camera and the resize binding when the pick renderers are absent', async () => {
    // No renderer must never mean no input and no error.
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    expect(state.booted).toBe(true);
    expect(state.subsystems.resizeWake).not.toBeNull();
  });

  it('constructs the wireInput-phase GPU_HANDLE_ROWS rows', async () => {
    // The complement of initGpu's phase-split assertion: emptying or
    // narrowing wireInput's row filter must fail here.
    const state = makeState();
    const deps = makeDeps();

    await wireInput(state, deps);

    const gpu = state.gpu as unknown as Record<string, unknown>;
    for (const row of GPU_HANDLE_ROWS) {
      if ('constructPhase' in row) {
        expect(gpu[row.key]).toBeTruthy();
      }
    }
  });
});
