import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { MESH_BODY_PERIOD_DAYS } from '../../../src/data/bodies/orbitalElements';

// The whale's rotation row and its orbit row are one physical claim written
// twice, and every part of the chain that could slip a sign is invisible in the
// rows themselves: the pole, W₀, and the body frame the bake's `bodyFromSource`
// remap establishes. So the lock is checked against the MOTION — a tail-first or
// belly-out whale fails here and nowhere else.

const SECOND_IN_DAYS = 1 / 86400;
/** The body-frame contract the bake's remap delivers. */
const HEAD = [1, 0, 0];
const DORSAL = [0, -1, 0];

function geocentricMpc(simDays: number): number[] {
  const states = deriveBodyStates(simDays);
  const whale = states.get('whale')!.positionMpc;
  const earth = states.get('earth')!.positionMpc;
  return [whale[0] - earth[0], whale[1] - earth[1], whale[2] - earth[2]];
}

function normalize(v: readonly number[]): number[] {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / length, v[1]! / length, v[2]! / length];
}

function rotate(m: readonly number[], v: readonly number[]): number[] {
  return [
    m[0]! * v[0]! + m[3]! * v[1]! + m[6]! * v[2]!,
    m[1]! * v[0]! + m[4]! * v[1]! + m[7]! * v[2]!,
    m[2]! * v[0]! + m[5]! * v[1]! + m[8]! * v[2]!,
  ];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

describe('the whale is orbit-locked', () => {
  it.each([0, 0.25, 0.37, 0.5])('flies head-first, belly to Earth at %s of an orbit', (phase) => {
    const simDays = CONST_J2000 + phase * MESH_BODY_PERIOD_DAYS;
    const orientation = deriveBodyStates(simDays).get('whale')!.orientation;
    const radialOut = normalize(geocentricMpc(simDays));
    const before = geocentricMpc(simDays - SECOND_IN_DAYS);
    const after = geocentricMpc(simDays + SECOND_IN_DAYS);
    const velocity = normalize([
      after[0]! - before[0]!,
      after[1]! - before[1]!,
      after[2]! - before[2]!,
    ]);

    expect(dot(rotate(orientation, HEAD), velocity)).toBeCloseTo(1, 3);
    expect(dot(rotate(orientation, DORSAL), radialOut)).toBeCloseTo(1, 3);
  });
});
