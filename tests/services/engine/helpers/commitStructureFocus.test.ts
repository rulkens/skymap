/**
 * commitStructureFocus — direct unit tests for the structure-side focus
 * protocol. Parallel to `commitGalaxyFocus.test.ts`:
 *   - selection + focus go through `setSelected` / `setFocused` with the
 *     resolved `StructureInfo` itself (the setters own `onFocusChange`,
 *     so the helper takes no `cb`);
 *   - tween distance comes from `structureFocusDistance`, not the galaxy path.
 *
 * Its own cam-null contract (only the tween is gated; selection + focus
 * still fire) differs from `focusOn`'s blanket guard — a wrong-direction
 * regression would silently strand deep-link drains that race bootstrap.
 */

import { describe, it, expect, vi } from 'vitest';

import { commitStructureFocus } from '../../../../src/services/engine/helpers/commitStructureFocus';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import { createCameraClock } from '../../../../src/services/engine/camera/cameraClock';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { AppStore } from '../../../../src/store/types';
import type { AppDispatch } from '../../../../src/store/types';

const FOV60 = (Math.PI / 180) * 60;

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

function makeStore(): AppStore {
  const dispatch = vi.fn<AppDispatch>();
  return { dispatch, getState: () => ({}) } as unknown as AppStore;
}

function makeMockState(): EngineState {
  return {
    cam: {
      target: new Float32Array([0, 0, 0]),
      distance: 100,
      yaw: 0,
      pitch: 0,
      fovYRad: FOV60,
    },
    cameraRuntime: {
      clock: createCameraClock(),
      // fovYRad must agree with the `cam` fixture above so structureFocusDistance
      // is called with the same FOV the test assertions use.
      projection: { fovYRad: FOV60, aspect: 1, near: 0.01, far: 1000 },
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 } },
      prevActiveId: { current: 'resting' },
    },
    subsystems: {
      selection: { setSelected: vi.fn(), setFocused: vi.fn(), selected: () => null },
      tweens: { start: vi.fn(), cancel: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as EngineState;
}

describe('commitStructureFocus', () => {
  it('calls selection.setSelected with the resolved StructureInfo', () => {
    const state = makeMockState();
    const store = makeStore();

    commitStructureFocus(state, virgo, store);

    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith(virgo);
  });

  it('latches the focus slot with the same resolved StructureInfo', () => {
    const state = makeMockState();
    const store = makeStore();

    commitStructureFocus(state, virgo, store);

    // The focus slot — not just the selection slot — drives the
    // cluster-focus member-isolation fade in runFrame (and owns the
    // onFocusChange URL-hash fan-out).  A bare single-click select must
    // NOT set it, but a focus commit must.
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith(virgo);
  });

  it('starts a tween with structureFocusDistance', () => {
    const state = makeMockState();
    const store = makeStore();
    commitStructureFocus(state, virgo, store);
    const dispatch = store.dispatch as ReturnType<typeof vi.fn>;
    // tweenToStructure dispatches startCameraTween (the tweens.start dual-write
    // was removed in the camera-intent cutover). Inspect that action's payload.
    const tweenCall = dispatch.mock.calls
      .map(([a]) => a)
      .find((a) => a && a.type === 'camera/startCameraTween');
    if (!tweenCall) throw new Error('startCameraTween was not dispatched');
    const payload = tweenCall.payload;
    // Virgo has no apparentRadiusMpc → frames the physical core (2 Mpc) at the
    // camera's 60° FOV. Asserts against the helper so the framing law has one
    // source of truth.
    expect(payload.to.distance).toBe(structureFocusDistance(2, FOV60));
    expect(payload.to.target).toEqual([10, 0, 0]);
  });

  it('skips the tween when state.cam is null, but still updates selection + focus', () => {
    const state = makeMockState();
    const store = makeStore();
    (state as unknown as { cam: unknown }).cam = null;
    commitStructureFocus(state, virgo, store);
    // Tween is skipped because cam is null (tweenToStructure absorbs the
    // guard), but selection + focus still fire — they can land before
    // the camera is ready, and the deep-link drain depends on that
    // ordering.
    expect(state.subsystems.selection.setSelected).toHaveBeenCalledWith(virgo);
    expect(state.subsystems.selection.setFocused).toHaveBeenCalledWith(virgo);
    const dispatch = store.dispatch as ReturnType<typeof vi.fn>;
    const tweenDispatched = dispatch.mock.calls
      .map(([a]) => a)
      .some((a) => a && a.type === 'camera/startCameraTween');
    expect(tweenDispatched).toBe(false);
  });
});
