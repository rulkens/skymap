/**
 * anchoredZoomStep — the FW-H/FW-B/FW-D guards (spec §6b).
 *
 * The 260-notch round trip uses `cursorAnchorM: null` throughout (a cursor
 * that never hits the body): mixing an off-axis cursor-anchored leg with a
 * radial one can *never* cancel exactly — the affine map toward an off-axis
 * point doesn't invert a radial scale, regardless of how close the factor
 * sits to 1 — so an honest round-trip fixture keeps both legs on the sub-eye
 * anchor and lets the miss-handling (FW-H) and the statelessness (FW-B) carry
 * the proof. The reciprocity fixture below is the deliberate exception: it
 * parks the cursor on the sub-eye point, where the two anchors coincide and
 * the legs DO cancel.
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

  it('undoes a low-altitude notch in with one notch out (§12-R4 reciprocity)', () => {
    // The racing zoom-out this rules out: anchored at the body CENTRE, one
    // notch out at 1 km altitude multiplied the whole 6371 km geocentric range
    // and climbed ~700 km, while the notch in it was meant to undo had moved
    // 100 m. Anchored at the sub-eye surface point both legs scale ALTITUDE,
    // so `f` and `1/f` cancel — here to the metre out of 6371 km.
    const altitudeM = 1000;
    const start: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, BODY_RADIUS_M + altitudeM],
      basisLocal: BASIS_IDENTITY,
    };
    // Cursor parked on the sub-eye point (nadir view, cursor at screen centre).
    const subEyeM: [number, number, number] = [0, 0, BODY_RADIUS_M];

    const f = 0.9;
    const inOnce = anchoredZoomStep(start, f, subEyeM, BODY_RADIUS_M);
    expect(Math.hypot(...eyeOf(inOnce)) - BODY_RADIUS_M).toBeCloseTo(altitudeM * f, 6);

    const back = anchoredZoomStep(inOnce, 1 / f, null, BODY_RADIUS_M);
    const [bx, by, bz] = eyeOf(back);
    expect(bx).toBeCloseTo(0, 6);
    expect(by).toBeCloseTo(0, 6);
    expect(bz).toBeCloseTo(BODY_RADIUS_M + altitudeM, 6);
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

  it('zooming out recedes from the cursor anchor, mirroring the dive (ruling 7)', () => {
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

    // Closed-form: `A + f·(eye − A)` with f > 1 — the same affine map as the
    // dive, so the point under the cursor stays pinned in BOTH directions (GM
    // behaviour; overrules FW-H's sub-eye zoom-out). The old sub-eye value
    // (`R + f·(|eye| − R)` on the eye radial, x = y = 0) is what this pins out.
    const withCursor = anchoredZoomStep(pose, 1.2, cursorAnchorM, BODY_RADIUS_M);
    const eyeStart = [0, 0, 20_000_000] as const;
    const [ex, ey, ez] = eyeOf(withCursor);
    expect(ex).toBeCloseTo(cursorAnchorM[0] + 1.2 * (eyeStart[0] - cursorAnchorM[0]), 6);
    expect(ey).toBeCloseTo(cursorAnchorM[1] + 1.2 * (eyeStart[1] - cursorAnchorM[1]), 6);
    expect(ez).toBeCloseTo(cursorAnchorM[2] + 1.2 * (eyeStart[2] - cursorAnchorM[2]), 6);
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

  it("an approach genuinely anchors on the cursor, and never crosses onto the anchor's far side", () => {
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 20_000_000],
      basisLocal: BASIS_IDENTITY,
    };
    const eyeStart = eyeOf(pose);
    const cursorAnchorM: [number, number, number] = [
      BODY_RADIUS_M * 0.6,
      BODY_RADIUS_M * 0.3,
      BODY_RADIUS_M * Math.sqrt(1 - 0.6 * 0.6 - 0.3 * 0.3),
    ];

    const out = anchoredZoomStep(pose, 0.5, cursorAnchorM, BODY_RADIUS_M);
    const [ex, ey, ez] = eyeOf(out);

    // Closed-form pin: the positive assertion that this step genuinely
    // anchored on the cursor (`A + factor·(eye − A)`), not on the centre or
    // some other fallback.
    expect(ex).toBeCloseTo(cursorAnchorM[0] + 0.5 * (eyeStart[0] - cursorAnchorM[0]), 6);
    expect(ey).toBeCloseTo(cursorAnchorM[1] + 0.5 * (eyeStart[1] - cursorAnchorM[1]), 6);
    expect(ez).toBeCloseTo(cursorAnchorM[2] + 0.5 * (eyeStart[2] - cursorAnchorM[2]), 6);

    // Consequence: a convex combination of two points already on-or-outside
    // the anchor's tangent plane can't cross it (spec's tangent-plane
    // overshoot guard — see the module header's algebra).
    const normal = cursorAnchorM.map((c) => c / BODY_RADIUS_M) as [number, number, number];
    const projection = ex * normal[0] + ey * normal[1] + ez * normal[2];
    expect(projection).toBeGreaterThanOrEqual(BODY_RADIUS_M - 1e-6);
  });
});
