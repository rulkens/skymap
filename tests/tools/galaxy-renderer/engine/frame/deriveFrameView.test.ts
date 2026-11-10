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

  it('field camera rays land on their own NDC under viewProj, lens shift included', () => {
    // The oracle is the sprites' own projection (`proj[8] = shiftX`), not the
    // tangent formula under test; an oblique pose keeps the basis honest.
    const fv = deriveFrameView({
      ...base(),
      eye: [7, 4, 30],
      target: [1, -2, 0],
      fov: 0.9,
      shiftX: 0.17,
    });
    const { eye, right, up, fwd, frustum } = fv.camera;
    const mid = [(frustum.tanLeft + frustum.tanRight) / 2, (frustum.tanDown + frustum.tanUp) / 2];
    const half = [(frustum.tanRight - frustum.tanLeft) / 2, (frustum.tanUp - frustum.tanDown) / 2];
    const m = fv.viewProj;
    for (const ndc of [
      [-1, -1],
      [1, 1],
      [0.3, -0.6],
    ]) {
      const tx = mid[0]! + ndc[0]! * half[0]!;
      const ty = mid[1]! + ndc[1]! * half[1]!;
      const p = [0, 1, 2].map((i) => eye[i]! + 10 * (fwd[i]! + right[i]! * tx + up[i]! * ty));
      const clip = [0, 1, 3].map(
        (r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!,
      );
      expect(clip[0]! / clip[2]!).toBeCloseTo(ndc[0]!, 5);
      expect(clip[1]! / clip[2]!).toBeCloseTo(ndc[1]!, 5);
    }
  });

  it("keeps the field's exposure independent of the sprite pass's starIntensity/sizeScale", () => {
    // Guards against `analyticExposure` being multiplied by the sprite pass's
    // own knobs — that coupling would let retuning a SPRITE slider silently
    // move the FIELD's brightness with it. The two passes are separate
    // representations of the same cloud and must be tunable independently.
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

  it('blends the star-grain feature scale from near to far as the camera pulls out', () => {
    // dustReachR: 5 (the fixture's disc radius) — 1 radius out is inside the
    // NEAR anchor, 40 radii out is well past the FAR one.
    const grain = { starGrainFeatureScaleNear: 2, starGrainFeatureScaleFar: 15 };
    const close = deriveFrameView({ ...base(grain), eye: [0, 0, 5] });
    const far = deriveFrameView({ ...base(grain), eye: [0, 0, 200] });
    expect(close.starGrainFeatureScale).toBeCloseTo(2, 5);
    expect(far.starGrainFeatureScale).toBeCloseTo(15, 5);
  });
});
