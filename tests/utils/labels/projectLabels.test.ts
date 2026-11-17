import { describe, expect, it } from 'vitest';
import { mat4d } from 'wgpu-matrix';
import type { Label2D } from '../../../src/@types/rendering/Label2D';
import type { Label2DProjection } from '../../../src/@types/rendering/Label2DProjection';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { ATLAS_FONT_SIZE } from '../../../src/data/fonts';
import { projectLabels } from '../../../src/utils/labels/projectLabels';

// View space = world space: a 2000×1000 pinhole, 1000 px per radian.
const PROJECTION: Label2DProjection = {
  vp: mat4d.identity() as Float64Array,
  viewFromSlab: mat4d.identity() as Float64Array,
  nearClipMpc: 0,
  output: {
    kind: 'pinhole',
    viewFromWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    camHi: [0, 0, 0],
    camLo: [0, 0, 0],
    up3: [0, 1, 0],
    sizePx: [2000, 1000],
    centrePx: [1000, 500],
    focalPx: 1000,
    pxScale: 1,
  },
};

// Off both centre lines; the subject lands on px (1020, 490).
const SUBJECT: Vec3 = [0.2, 0.1, 10];
const DISTANCE = Math.hypot(...SUBJECT);

/** A label `diameterPx` across whose em is pinned so one atlas px is one screen px. */
function lifted(diameterPx: number): Label2D {
  return {
    id: 'a',
    text: 'a',
    font: 'cormorant',
    pixelSize: 0,
    worldPos: SUBJECT,
    minPixelSize: ATLAS_FONT_SIZE,
    maxPixelSize: ATLAS_FONT_SIZE,
    lift: { radiusMpc: ((diameterPx / 2) * DISTANCE) / 1000 },
  };
}
const inkBottom = (maxY: number) => () => ({ minX: 0, minY: -30, maxX: 40, maxY });

describe('projectLabels', () => {
  it("a lifted label's declutter box sits where the shader draws it: 1.5 diameters up", () => {
    const [p] = projectLabels([lifted(40)], PROJECTION, inkBottom(12));
    expect(p!.subjectSizePx).toBeCloseTo(40, 9);
    expect(p!.screenPx![0]).toBeCloseTo(1020, 9);
    expect(p!.screenPx![1]).toBeCloseTo(490 - 60, 9);
  });

  it('raises a small subject’s text until its ink bottom clears the subject by 28 px', () => {
    const [p] = projectLabels([lifted(4)], PROJECTION, inkBottom(30));
    expect(p!.screenPx![1]).toBeCloseTo(490 - (28 + 30), 9);
  });

  it('leaves the anchor at the subject when asked for no lift (the NEAR0 declutter rule)', () => {
    const [p] = projectLabels([lifted(40)], PROJECTION, null);
    expect(p!.screenPx![1]).toBeCloseTo(490, 9);
    expect(p!.subjectSizePx).toBeCloseTo(40, 9);
  });
});
