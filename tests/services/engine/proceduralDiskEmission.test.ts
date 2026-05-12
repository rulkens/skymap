/*
 * Sanity tests for `maybeEmitProceduralDisk` — Task 9 of the procedural-
 * disk-impostor plan.
 *
 * The runtime call lives inside `thumbnailSubsystem.runFrame`'s per-galaxy
 * loop, which can't be reached without a full WebGPU device + bootstrapped
 * engine.  Pulling the per-galaxy emission decision into a pure function
 * lets us pin its branches — apparent-size gate, NaN orientation guard,
 * smoothstep crossfade math — directly.  See the helper's own
 * doc-comment in `thumbnailSubsystem.ts` for the deeper "why" on each
 * branch.
 *
 * NOTE on smoothstep boundaries:  the inline runtime check is `px >
 * fadeStart` (strict).  These tests pin that boundary with `8.0001` vs.
 * `8.0` — flipping to `>=` would silently emit a zero-alpha instance at
 * exactly `px === 8`, which adds no pixels but does waste a quad and a
 * z-sort slot.
 */

import { describe, it, expect } from 'vitest';
import { maybeEmitProceduralDisk } from '../../../src/services/engine/subsystems/proceduralDiskSubsystem';

describe('maybeEmitProceduralDisk', () => {
  // Fixture values used across most cases.  Distinct primes so a swap-
  // bug between x/y/z would be obvious; tiny-but-non-zero sizeWorldMpc
  // matches the "few-Mpc nearby galaxy" regime where procedural disks
  // actually emit.
  const base = {
    x: 1,
    y: 2,
    z: 3,
    sizeWorldMpc: 0.03,
    colourIndex: 1.0,
    fadeStartPx: 8,
    fadeEndPx: 14,
  };

  it('returns null below the fade start (strictly-greater gate)', () => {
    const r = maybeEmitProceduralDisk(
      7,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null exactly at the fade-start edge', () => {
    // Boundary pin: 8 px is the exclusive lower edge.  Flipping the
    // helper's `<=` to `<` would break this and emit a zero-alpha
    // instance per fade-edge galaxy per frame.
    const r = maybeEmitProceduralDisk(
      8,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null when axisRatio is NaN', () => {
    const r = maybeEmitProceduralDisk(
      10,
      NaN,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('returns null when positionAngleDeg is NaN', () => {
    const r = maybeEmitProceduralDisk(
      10,
      0.7,
      NaN,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).toBeNull();
  });

  it('emits with crossfadeAlpha ≈ 0 just above the fade-start edge', () => {
    const r = maybeEmitProceduralDisk(
      8.0001,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).not.toBeNull();
    expect(r!.crossfadeAlpha).toBeCloseTo(0, 3);
  });

  it('emits with crossfadeAlpha ≈ 1 at and beyond fadeEnd', () => {
    const atEnd = maybeEmitProceduralDisk(
      14,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(atEnd!.crossfadeAlpha).toBeCloseTo(1, 6);

    // Far beyond the band — clamp keeps t at 1, smoothstep stays at 1.
    const farPast = maybeEmitProceduralDisk(
      50,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(farPast!.crossfadeAlpha).toBeCloseTo(1, 6);
  });

  it('smoothstep crossfade hits 0.5 at the band midpoint', () => {
    // (11 - 8) / (14 - 8) = 0.5 → smoothstep(0.5) = 0.5 exactly.
    // The cubic `3t² − 2t³` is symmetric about t = 0.5, so this is the
    // canonical pin for "the curves are actually smoothstep, not
    // linear" — a linear ramp would also hit 0.5 here, so we add a
    // separate pin below at t = 0.25.
    const r = maybeEmitProceduralDisk(
      11,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.crossfadeAlpha).toBeCloseTo(0.5, 6);
  });

  it('smoothstep crossfade matches the cubic at t = 0.25', () => {
    // (9.5 - 8) / (14 - 8) = 0.25 → smoothstep(0.25) =
    // 3·0.0625 − 2·0.015625 = 0.15625.  Distinguishes smoothstep from
    // a plain linear ramp (which would give 0.25).
    const r = maybeEmitProceduralDisk(
      9.5,
      0.7,
      30,
      base.x,
      base.y,
      base.z,
      base.sizeWorldMpc,
      base.colourIndex,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r!.crossfadeAlpha).toBeCloseTo(0.15625, 6);
  });

  it('forwards positional + orientation fields verbatim onto the instance', () => {
    const r = maybeEmitProceduralDisk(
      11,
      0.42,
      137,
      11,
      22,
      33,
      0.05,
      1.7,
      base.fadeStartPx,
      base.fadeEndPx,
    );
    expect(r).not.toBeNull();
    expect(r!.x).toBe(11);
    expect(r!.y).toBe(22);
    expect(r!.z).toBe(33);
    expect(r!.sizeWorldMpc).toBe(0.05);
    expect(r!.axisRatio).toBe(0.42);
    expect(r!.positionAngleDeg).toBe(137);
    expect(r!.colourIndex).toBe(1.7);
  });
});
