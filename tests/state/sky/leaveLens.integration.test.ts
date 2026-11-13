/**
 * Leave from sky mode, end to end: the takeover sagas, the real clip player and the frame loop.
 * Standing, the wheel narrows the lens to anything; the return flight must ease it back to the
 * lens the person had before the first entry, a chained entry included (D11).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { enterSky } from '../../../src/state/sky/enterSky';
import { exitTakeover } from '../../../src/state/takeover/takeoverActions';
import { commitCameraPose, setFovYRad } from '../../../src/state/camera/cameraIntentSlice';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { degToRad } from '../../../src/utils/math/degToRad';
import { earthArm } from '../../fixtures/earthArm';
import { makeCameraSimHarness } from '../../helpers/camera/makeCameraSimHarness';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';
import type { FramedCameraPose } from '../../../src/@types/camera/pose/FramedCameraPose';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { RootState } from '../../../src/store/types';

installAppSelectionKinds();

const EARTH = asSceneBodyId('earth');
const PARIS: SkySpot = { body: EARTH, lonRad: 0.041, latRad: 0.8527 };
const COPENHAGEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };
const BEFORE = degToRad(40);
const NARROW = degToRad(5);

/** Enters each spot in turn from `entry` (the harness's world pose when null) at the 40° lens,
 *  narrows the lens standing, leaves, and returns the drawn lens over the return flight. */
async function leaveAfter(entry: FramedCameraPose | null, spots: readonly SkySpot[]) {
  const h = makeCameraSimHarness({ realClipPlayer: true, sagas: [watchTakeoverSaga] });
  const state = () => h.store.getState() as unknown as RootState;
  const settle = () => {
    for (let i = 0; i < 2000 && state().camera.intent.clip !== null; i++) h.frame(1);
    h.frame(2);
  };
  h.frame(2);
  if (entry !== null) h.store.dispatch(commitCameraPose(entry));
  h.store.dispatch(setFovYRad(BEFORE));
  h.frame(2);
  for (const spot of spots) {
    h.store.dispatch(enterSky({ spot, pointLocalM: null }));
    // A superseding entry starts only once the cancelled run's bracket settles, a macrotask later.
    await new Promise((r) => setTimeout(r, 0));
    settle();
    expect(selectTakeoverSource(state())).toMatchObject({ kind: 'sky', spot });
  }
  h.store.dispatch(setFovYRad(NARROW));
  h.frame(2);

  h.store.dispatch(exitTakeover({ restore: true }));
  const drawn: number[] = [];
  for (let i = 0; i < 2000 && state().camera.intent.clip !== null; i++) {
    h.frame(1);
    drawn.push(h.state.cameraRuntime.outputs.projection.fovYRad);
  }
  h.frame(5);
  return { drawn, state: state() };
}

describe('Leave from sky mode', () => {
  it.each([
    ['from a world pose', null],
    ['from a body pose', earthArm(3)],
  ])('%s eases the lens back to the one from before the entry', async (_, entry) => {
    const { drawn, state } = await leaveAfter(entry, [PARIS]);

    expect(drawn.some((fov) => fov > NARROW * 2 && fov < BEFORE * 0.75)).toBe(true);
    expect(selectTakeoverSource(state)).toBeNull();
    expect(state.camera.intent.fovYRad).toBeCloseTo(BEFORE, 9);
  });

  it('after a chained entry lands on the lens from before the first', async () => {
    const { state } = await leaveAfter(null, [PARIS, COPENHAGEN]);

    expect(selectTakeoverSource(state)).toBeNull();
    expect(state.camera.intent.fovYRad).toBeCloseTo(BEFORE, 9);
  });
});
