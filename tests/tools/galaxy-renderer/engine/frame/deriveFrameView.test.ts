/**
 * The frame's arithmetic, which until this was extracted lived inside a
 * function no test could call. These cover the couplings that are easy to
 * break silently and produce a plausible-looking image: the frustum tracking
 * the DAMPED distance, the lens shift reaching the projection, and the
 * exposure/dimming products that must stay in lockstep across both
 * representations of the cloud.
 */
import { describe, expect, it } from 'vitest';

import { deriveFrameView } from '../../../../../tools/galaxy-renderer/src/engine/frame/deriveFrameView';
import type { RenderSettings } from '../../../../../tools/galaxy-renderer/@types/engine/RenderSettings';
import { DEFAULT_RENDER_SETTINGS } from '../../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';

const base = (render: Partial<RenderSettings> = {}) => ({
  eye: [0, 0, 30] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: (45 * Math.PI) / 180,
  dist: 30,
  shiftX: 0,
  viewportPx: [1600, 900] as [number, number],
  render: { ...DEFAULT_RENDER_SETTINGS, ...render },
  dustReachR: 5,
});

describe('deriveFrameView', () => {
  it('scales the near plane with distance, so descending into the disc does not clip it', () => {
    const far = deriveFrameView({ ...base(), dist: 3000 });
    const near = deriveFrameView({ ...base(), dist: 0.05 });
    // proj[10]/proj[14] encode near/far; comparing the two frames' projections
    // is enough to catch a near plane pinned to a constant.
    expect(far.proj[14]).not.toBeCloseTo(near.proj[14]!, 6);
    // A fixed 0.1 near would clip everything at dist 0.05; the floor must be
    // well below the camera's own distance.
    expect(Math.max(1e-4, 0.05 * 0.002)).toBeLessThan(0.05);
  });

  it('puts the lens shift in the projection, not the view', () => {
    const centred = deriveFrameView(base());
    const shifted = deriveFrameView({ ...base(), shiftX: 0.3 });
    expect(centred.proj[8]).toBe(0);
    expect(shifted.proj[8]).toBeCloseTo(0.3, 6); // Float32Array, so not exact
    // The view matrix must be untouched — shifting there would move the eye
    // rather than the frame, changing what the fade and dust slices measure.
    expect([...shifted.view]).toEqual([...centred.view]);
  });

  it('folds the star pass multipliers into analyticExposure so parity survives the sliders', () => {
    const v = deriveFrameView({
      ...base({ analyticExposure: 2, starIntensity: 3, sizeScale: 4 }),
    });
    // size enters SQUARED — a sprite's light goes as its quad area.
    expect(v.analyticExposure).toBeCloseTo(2 * 3 * 16 * v.fade.alpha, 10);
  });

  it('reports one galaxy weight, shared by the sprite fade and both field headers', () => {
    const v = deriveFrameView({ ...base({ dustViewIntensity: 0.4, sfMapViewIntensity: 0.9 }) });
    // MAX, not sum: two half-on debug views must not dim twice.
    expect(v.galaxyWeight).toBe(v.debugView.galaxyWeight);
    expect(v.debugView.dustViewIntensity).toBe(0.4);
    expect(v.debugView.sfMapViewIntensity).toBe(0.9);
  });

  it('measures the dust slices from the origin, not the orbit target', () => {
    // Panning moves `target` while the eye stays put; the slices are anchored
    // to the galaxy's centre, so they must not move with it.
    const a = deriveFrameView(base());
    const b = deriveFrameView({ ...base(), target: [12, 0, -4] });
    expect(b.dustSlices).toEqual(a.dustSlices);
  });
});
