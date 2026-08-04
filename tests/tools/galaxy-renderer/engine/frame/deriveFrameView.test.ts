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

  it("keeps the field's exposure independent of the sprite pass's starIntensity/sizeScale", () => {
    // Regression for the fold this replaced: `analyticExposure` used to be
    // multiplied by the sprite pass's own knobs, so retuning a SPRITE slider
    // (#541) silently moved the FIELD's brightness with it. The two passes
    // are separate representations of the same cloud and must be tunable
    // independently.
    const reference = deriveFrameView(base({ analyticExposure: 2 }));
    const movedSprites = deriveFrameView({
      ...base({ analyticExposure: 2, starIntensity: 3, sizeScale: 4 }),
    });
    expect(movedSprites.analyticExposure).toBeCloseTo(reference.analyticExposure, 10);
  });

  it('measures the dust slices from the origin, not the orbit target', () => {
    // Panning moves `target` while the eye stays put; the slices are anchored
    // to the galaxy's centre, so they must not move with it.
    const a = deriveFrameView(base());
    const b = deriveFrameView({ ...base(), target: [12, 0, -4] });
    expect(b.dustSlices).toEqual(a.dustSlices);
  });
});
