import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { BrickBox } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/BrickBox';
import type { DetailRegionPlanInput } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionPlanInput';
import type { DetailRegionState } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionState';
import { planDetailRegion } from '../../../../../src/layers/cosmicWebDensity/detailRegion/plan/planDetailRegion';
import { brickId } from '../../../../../src/utils/volume/brickId';
import { brickCoordsOf } from '../../../../../src/utils/volume/brickCoordsOf';

// MCPM: dataBox 672 × 1152 × 648 voxels, 14 × 24 × 14 bricks of 48.
const GRID: Vec3 = [14, 24, 14];
const DIMS: Vec3 = [672, 1152, 648];
const START: DetailRegionState = { target: null, settled: null, fade: null, inReach: false };
// The middle of brick (7, 12, 7): target (5, 10, 5)–(10, 15, 10).
const MID: Vec3 = [360, 600, 360];
const TARGET: BrickBox = { lo: [5, 10, 5], hi: [10, 15, 10] };

const input = (over: Partial<DetailRegionPlanInput> = {}): DetailRegionPlanInput => ({
  grid: GRID,
  dims: DIMS,
  bricksPerAxis: 5,
  eyeVox: MID,
  gateVox: 340,
  held: () => false,
  failed: () => false,
  rampStep: 1,
  ...over,
});

const id = (x: number, y: number, z: number) => brickId([x, y, z], GRID);
const inBox = (box: BrickBox) => (b: number) =>
  brickCoordsOf(b, GRID).every((c, a) => c >= box.lo[a]! && c < box.hi[a]!);

/** Runs frames until no fade is left. */
const settle = (
  prev: DetailRegionState,
  over: Partial<DetailRegionPlanInput>,
): DetailRegionState => {
  let state = planDetailRegion(prev, input(over)).state;
  for (let i = 0; i < 10 && state.fade; i++) state = planDetailRegion(state, input(over)).state;
  expect(state.fade).toBeNull();
  return state;
};

describe('planDetailRegion', () => {
  it('the target is K bricks around the centre brick, shifted inside the grid at both corners', () => {
    expect(planDetailRegion(START, input({ eyeVox: [10, 10, 10] })).state.target).toEqual({
      lo: [0, 0, 0],
      hi: [5, 5, 5],
    });
    expect(planDetailRegion(START, input({ eyeVox: [670, 1150, 640] })).state.target).toEqual({
      lo: [9, 19, 9],
      hi: [14, 24, 14],
    });
  });

  it('an even K keeps the eye within half a brick of the target centre, either half of its brick', () => {
    // Brick 7 along x: 346 voxels sits in its lower half, 374 in its upper half.
    const target = (eyeVox: Vec3) =>
      planDetailRegion(START, input({ bricksPerAxis: 8, eyeVox })).state.target!;
    const lower = target([346, 590, 346]);
    const upper = target([374, 590, 346]);
    expect(upper.lo).toEqual([lower.lo[0] + 1, lower.lo[1], lower.lo[2]]);
    for (const [box, eyeVox] of [
      [lower, [346, 590, 346]],
      [upper, [374, 590, 346]],
    ] as const) {
      box.lo.forEach((lo, a) => {
        expect(Math.abs(eyeVox[a]! / 48 - (lo + box.hi[a]!) / 2)).toBeLessThanOrEqual(0.5);
      });
    }
  });

  it('an eye outside the box but in reach gets a target against the nearest face', () => {
    const { state } = planDetailRegion(START, input({ eyeVox: [-100, 600, 300] }));
    expect(state.target).toEqual({ lo: [0, 10, 4], hi: [5, 15, 9] });
    expect(state.inReach).toBe(true);
  });

  it('moving parallel to the face slides the target; moving straight away does not', () => {
    const target = (eyeVox: Vec3) => planDetailRegion(START, input({ eyeVox })).state.target;
    expect(target([-100, 696, 300])!.lo[1]).toBe(target([-100, 600, 300])!.lo[1] + 2);
    expect(target([-200, 600, 300])).toEqual(target([-100, 600, 300]));
  });

  it('an eye out of reach wants nothing, keeps its target and settled box, and is not in reach', () => {
    const near = settle(START, { eyeVox: [-100, 600, 300], held: () => true });
    const plan = planDetailRegion(near, input({ eyeVox: [-400, 600, 300] }));
    expect(plan.state).toEqual({ ...near, inReach: false });
    expect(plan.wanted).toEqual([]);
    expect(plan.busy).toBe(false);
  });

  it('settled grows one whole layer per face, only when every brick of the layer is held', () => {
    // The centre brick, its +x neighbour, and half of the +y layer the grown box would need next.
    const held = new Set([id(7, 12, 7), id(8, 12, 7), id(8, 13, 7)]);
    const { state } = planDetailRegion(START, input({ held: (b) => held.has(b) }));
    expect(state.fade?.into).toEqual({ lo: [7, 12, 7], hi: [9, 13, 8] });
    expect(planDetailRegion(START, input({ held: () => true })).state.fade?.into).toEqual(TARGET);
  });

  it('a failed brick is not wanted', () => {
    const bad = id(8, 12, 7);
    const { wanted } = planDetailRegion(START, input({ failed: (b) => b === bad }));
    expect(wanted).toHaveLength(124);
    expect(wanted).not.toContain(bad);
  });

  it('a shift clips settled to the new target and keeps the rest', () => {
    const before = settle(START, { held: inBox(TARGET) });
    expect(before.settled).toEqual(TARGET);
    // Three bricks along +x: the eye's brick (10, 12, 7) sits in the entering slab, not held yet,
    // so regrowing from it would draw nothing.
    const plan = planDetailRegion(before, input({ eyeVox: [504, 600, 360], held: inBox(TARGET) }));
    const kept = { lo: [8, 10, 5], hi: [10, 15, 10] };
    expect(plan.state.settled).toEqual(kept);
    expect(plan.state.fade).toEqual({ into: kept, out: TARGET, w: 0 });
    expect(plan.wanted).toHaveLength(75);
  });

  it('a change of settled becomes a fade; the new box settles when w reaches 1; shown holds settled, into and out meanwhile', () => {
    const part: BrickBox = { lo: [5, 10, 5], hi: [9, 15, 10] };
    const before = settle(START, { held: inBox(part) });
    expect(before.settled).toEqual(part);

    const step = (prev: DetailRegionState) =>
      planDetailRegion(prev, input({ held: () => true, rampStep: 0.6 }));
    const start = step(before);
    expect(start.state.settled).toEqual(part);
    expect(start.state.fade).toEqual({ into: TARGET, out: part, w: 0 });
    expect(start.shown).toEqual([part, TARGET, part]);
    expect(start.busy).toBe(true);

    const mid = step(start.state);
    expect(mid.state.fade?.w).toBeCloseTo(0.6);
    expect(mid.state.settled).toEqual(part);

    const end = step(mid.state);
    expect(end.state.settled).toEqual(TARGET);
    expect(end.state.fade).toBeNull();
    expect(end.shown).toEqual([TARGET]);
    expect(end.busy).toBe(false);
  });

  it('a target shift during a fade keeps its boxes; at w = 1 the settled box is clipped to the new target', () => {
    const part: BrickBox = { lo: [5, 10, 5], hi: [9, 15, 10] };
    const before = settle(START, { held: inBox(part) });
    const step = (prev: DetailRegionState, eyeVox: Vec3) =>
      planDetailRegion(prev, input({ eyeVox, held: () => true, rampStep: 0.6 }));
    const start = step(before, MID);
    expect(start.state.fade).toEqual({ into: TARGET, out: part, w: 0 });

    // Three bricks along +x: the target moves to (8, 10, 5)–(13, 15, 10) under the running fade.
    const shifted: Vec3 = [504, 600, 360];
    const mid = step(start.state, shifted);
    expect(mid.state.fade).toEqual({ into: TARGET, out: part, w: 0.6 });

    const end = step(mid.state, shifted);
    const kept = { lo: [8, 10, 5], hi: [10, 15, 10] };
    expect(end.state.settled).toEqual(kept);
    expect(end.state.fade).toEqual({
      into: { lo: [8, 10, 5], hi: [13, 15, 10] },
      out: TARGET,
      w: 0,
    });
  });

  it('a far jump fades the old box out to nothing, shown until w reaches 1', () => {
    const before = settle(START, { held: inBox(TARGET) });
    const step = (prev: DetailRegionState) =>
      planDetailRegion(prev, input({ eyeVox: [10, 10, 10], held: inBox(TARGET), rampStep: 0.6 }));
    const start = step(before);
    expect(start.state.settled).toBeNull();
    expect(start.state.fade).toEqual({ into: null, out: TARGET, w: 0 });
    expect(start.shown).toEqual([TARGET]);

    const mid = step(start.state);
    expect(mid.shown).toEqual([TARGET]);

    const end = step(mid.state);
    expect(end.state).toMatchObject({ settled: null, fade: null });
    expect(end.shown).toEqual([]);
  });

  it('a fade does not advance while out of reach', () => {
    const fading = planDetailRegion(
      START,
      input({ eyeVox: [-100, 600, 300], held: () => true, rampStep: 0.5 }),
    ).state;
    expect(fading.fade?.w).toBe(0);
    const away = planDetailRegion(
      fading,
      input({ eyeVox: [-400, 600, 300], held: () => true, rampStep: 0.5 }),
    );
    expect(away.state.fade).toBe(fading.fade);
    expect(away.shown).toEqual([]);
  });

  it('wanted is nearest first from the centre brick', () => {
    const { wanted, busy } = planDetailRegion(START, input());
    expect(wanted).toHaveLength(125);
    expect(wanted[0]).toBe(id(7, 12, 7));
    expect(busy).toBe(true);
    const rank = (b: number) => {
      const d = brickCoordsOf(b, GRID).map((c, a) => c - [7, 12, 7][a]!);
      return Math.max(...d.map(Math.abs)) * 1000 + d.reduce((s, v) => s + v * v, 0);
    };
    const ranks = wanted.map(rank);
    expect(ranks).toEqual([...ranks].sort((p, q) => p - q));
    expect(ranks.slice(1, 7)).toEqual([1001, 1001, 1001, 1001, 1001, 1001]);
  });
});
