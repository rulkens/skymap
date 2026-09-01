/**
 * anchoredZoomStep — the FW-H/FW-B/FW-D guards (spec §6b).
 *
 * The 260-notch round trip uses `cursorAnchorM: null` throughout (a cursor
 * that never hits the body): mixing a centre-anchored leg with a
 * cursor-anchored leg can *never* cancel exactly — the affine map toward an
 * off-centre point doesn't invert a pure radial scale, regardless of how
 * close the factor sits to 1 — so an honest round-trip fixture keeps both
 * legs on the centre anchor and lets the miss-handling (FW-H) and the
 * statelessness (FW-B) carry the proof.
 */

import { describe, it, expect } from 'vitest';

import { anchoredZoomStep } from '../../../src/utils/camera/anchoredZoomStep';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';

const BASIS_IDENTITY: BodyFixedPose['basisLocal'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const BODY_RADIUS_M = 6_371_000;

function eyeOf(pose: BodyFixedPose): readonly [number, number, number] {
  return [
    pose.anchorLocalM[0] + pose.eyeRelAnchorM[0],
    pose.anchorLocalM[1] + pose.eyeRelAnchorM[1],
    pose.anchorLocalM[2] + pose.eyeRelAnchorM[2],
  ];
}

function magnitude([x, y, z]: readonly [number, number, number]): number {
  return Math.hypot(x, y, z);
}

describe('anchoredZoomStep', () => {
  it('260 notches out and back with the cursor parked (missing) returns to the starting pose', () => {
    const start: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 30_000_000],
      basisLocal: BASIS_IDENTITY,
    };

    const OUT_FACTOR = 1.01;
    let pose = start;
    for (let i = 0; i < 260; i++) {
      pose = anchoredZoomStep(pose, OUT_FACTOR, null, BODY_RADIUS_M);
    }
    for (let i = 0; i < 260; i++) {
      pose = anchoredZoomStep(pose, 1 / OUT_FACTOR, null, BODY_RADIUS_M);
    }

    const [sx, sy, sz] = eyeOf(start);
    const [ex, ey, ez] = eyeOf(pose);
    expect(ex).toBeCloseTo(sx, 6);
    expect(ey).toBeCloseTo(sy, 6);
    expect(ez).toBeCloseTo(sz, 6);
  });

  it('is stateless: the same input pose and factor give the same output twice', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [1_000_000, 2_000_000, 20_000_000],
      basisLocal: BASIS_IDENTITY,
    };
    const cursorAnchorM: [number, number, number] = [
      BODY_RADIUS_M * 0.3,
      BODY_RADIUS_M * 0.2,
      BODY_RADIUS_M * 0.9,
    ];

    const first = anchoredZoomStep(pose, 0.9, cursorAnchorM, BODY_RADIUS_M);
    const second = anchoredZoomStep(pose, 0.9, cursorAnchorM, BODY_RADIUS_M);

    expect(second).toEqual(first);
  });

  it('zooming out ignores the cursor anchor', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 20_000_000],
      basisLocal: BASIS_IDENTITY,
    };
    const cursorAnchorM: [number, number, number] = [
      BODY_RADIUS_M * 0.4,
      BODY_RADIUS_M * 0.1,
      BODY_RADIUS_M * 0.9,
    ];

    const withCursor = anchoredZoomStep(pose, 1.2, cursorAnchorM, BODY_RADIUS_M);
    const withoutCursor = anchoredZoomStep(pose, 1.2, null, BODY_RADIUS_M);

    expect(withCursor).toEqual(withoutCursor);
  });

  it('an approach step never goes below the surface floor', () => {
    const floorM = surfaceFloorM(BODY_RADIUS_M);
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, floorM * 1.2],
      basisLocal: BASIS_IDENTITY,
    };

    const out = anchoredZoomStep(pose, 0.01, null, BODY_RADIUS_M);

    expect(magnitude(eyeOf(out))).toBeGreaterThanOrEqual(floorM - 1e-6);
  });

  it('an oversized factor is clamped on both signs', () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 50_000_000],
      basisLocal: BASIS_IDENTITY,
    };

    const hugeOut1 = anchoredZoomStep(pose, 1e6, null, BODY_RADIUS_M);
    const hugeOut2 = anchoredZoomStep(pose, 1e9, null, BODY_RADIUS_M);
    expect(hugeOut2).toEqual(hugeOut1);

    const tinyIn1 = anchoredZoomStep(pose, 1e-9, null, BODY_RADIUS_M);
    const tinyIn2 = anchoredZoomStep(pose, 1e-12, null, BODY_RADIUS_M);
    expect(tinyIn2).toEqual(tinyIn1);

    // And the clamp actually bites: an oversized factor doesn't move the eye
    // by anywhere near its raw (unclamped) ratio.
    const unclamped = eyeOf(pose)[2] * 1e6;
    expect(magnitude(eyeOf(hugeOut1))).toBeLessThan(unclamped / 1000);
  });

  it('an approach never crosses the cursor anchor point onto its far side', () => {
    // Convex-combination invariant: with a visible (on-sphere) anchor and
    // factor ∈ (0, 1], the stepped eye's projection onto the anchor's own
    // outward normal never drops below the anchor's — i.e. it never crosses
    // the anchor's tangent plane. A regression here (e.g. an off-by-one on
    // the clamp bounds letting factor go non-positive) is exactly the bug
    // class the "force a fresh anchor pick after an overshoot" rule guards.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 20_000_000],
      basisLocal: BASIS_IDENTITY,
    };
    const cursorAnchorM: [number, number, number] = [
      BODY_RADIUS_M * 0.6,
      BODY_RADIUS_M * 0.3,
      BODY_RADIUS_M * Math.sqrt(1 - 0.6 * 0.6 - 0.3 * 0.3),
    ];
    const normal = cursorAnchorM.map((c) => c / BODY_RADIUS_M) as [number, number, number];

    const out = anchoredZoomStep(pose, 0.5, cursorAnchorM, BODY_RADIUS_M);
    const eye = eyeOf(out);
    const projection = eye[0] * normal[0] + eye[1] * normal[1] + eye[2] * normal[2];

    expect(projection).toBeGreaterThanOrEqual(BODY_RADIUS_M - 1e-6);
  });
});
