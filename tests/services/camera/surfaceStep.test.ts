/**
 * surfaceStep — the body arm's gesture memory as a value. Unit-radius
 * closed-form fixtures, per the controller suite's convention: the eye sits at
 * h/R = 0.3, inside the blend band, so `bodyUpWeight` is strictly between 0
 * and 1 and the un-map is visible in the numbers rather than an identity.
 */

import { describe, it, expect } from 'vitest';

import { noteBody, surfaceStep } from '../../../src/services/camera/surfaceStep';
import { bodyUpWeight } from '../../../src/utils/camera/bodyUpWeight';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { InputStep } from '../../../src/@types/camera/InputStep';
import type { SurfaceMemory } from '../../../src/@types/camera/SurfaceMemory';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 1;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const POLE: Vec3 = [0, 0, 1];
/** Columns right | up | forward. Nadir: at +Z looking down, screen-up = +Y. */
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
const CTX = { viewportPx: VIEWPORT, fovYRad: FOV, bodyRadiusM: R, sceneUpLocal: POLE };

const IN_BAND: BodyFixedPose = {
  bodyId: 'earth',
  anchorLocalM: [0, 0, 0],
  eyeRelAnchorM: [0, 0, 1.3],
  basisLocal: NADIR,
};

const EMPTY: SurfaceMemory = {
  gesture: null,
  pointerDown: false,
  rememberedTiltRad: 0,
  memoryBodyId: null,
};

/** The secondary drag ('pan' step mode) is the tilt handle; drag UP tilts up. */
function tiltDrag(px: number): InputStep {
  return { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 50 - px] };
}

function eyeOf(p: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = p;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}

function tiltOf(p: BodyFixedPose): number {
  const e = eyeOf(p);
  const m = Math.hypot(...e);
  const b = p.basisLocal;
  const vert = (b[6] * e[0] + b[7] * e[1] + b[8] * e[2]) / m;
  return Math.acos(Math.max(-1, Math.min(1, -vert)));
}

function hrOf(p: BodyFixedPose): number {
  return Math.hypot(...eyeOf(p)) / R - 1;
}

describe('surfaceStep', () => {
  it('a drag with the pointer up is declined', () => {
    // FW-C: a trackpad burst can deliver a drag run after the pointerup. The
    // flat pair can spell it, so the arm has to check rather than trust.
    const up = surfaceStep(EMPTY, IN_BAND, tiltDrag(15), CTX);
    expect(up.pose).toBe(IN_BAND);
    expect(up.next).toEqual(EMPTY);

    const down = surfaceStep({ ...EMPTY, pointerDown: true }, IN_BAND, tiltDrag(15), CTX);
    expect(tiltOf(down.pose)).toBeGreaterThan(0.1);
  });

  it('a tilt drag writes the un-mapped memory and returns a new object', () => {
    const prev = Object.freeze({ ...EMPTY, pointerDown: true, memoryBodyId: 'earth' });
    const { pose, next } = surfaceStep(prev, IN_BAND, tiltDrag(15), CTX);

    expect(next).not.toBe(prev);
    expect(prev.rememberedTiltRad).toBe(0);
    // Ruling 12: the memory is the display tilt un-mapped through the band
    // weight, so it is strictly LARGER than what the drag put on screen.
    const w = bodyUpWeight(hrOf(pose));
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    expect(next.rememberedTiltRad).toBeCloseTo(tiltOf(pose) / w, 9);
    expect(next.gesture?.mode).toBe('tilt');
    expect(next.gesture?.prevPixel).toEqual([50, 35]);
  });

  it('noteBody wipes the tilt on a different body and keeps it on null', () => {
    const seeded: SurfaceMemory = { ...EMPTY, rememberedTiltRad: 0.4, memoryBodyId: 'earth' };

    expect(noteBody(seeded, null)).toEqual(seeded);
    expect(noteBody(seeded, 'earth').rememberedTiltRad).toBe(0.4);
    // Ruling 18: a body SWITCH wipes the memory, never restores it per body.
    expect(noteBody(seeded, 'mars')).toEqual({
      ...seeded,
      rememberedTiltRad: 0,
      memoryBodyId: 'mars',
    });
    // Nothing noted yet is not a switch: the first note adopts the body.
    expect(noteBody({ ...seeded, memoryBodyId: null }, 'mars').rememberedTiltRad).toBe(0.4);
  });

  it('a zoom step never authors tilt', () => {
    const prev: SurfaceMemory = { ...EMPTY, rememberedTiltRad: 0.4, memoryBodyId: 'earth' };
    const step: InputStep = { kind: 'zoom', factor: 0.5, duringGesture: false, cursorPx: null };
    const { pose, next } = surfaceStep(prev, IN_BAND, step, CTX);

    expect(hrOf(pose)).toBeLessThan(hrOf(IN_BAND));
    expect(next).toEqual(prev);
  });
});
