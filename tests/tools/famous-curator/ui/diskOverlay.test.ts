/**
 * diskOverlay — pure helpers for drawing/interacting with the disk-overlay
 * ellipse in the curator UI.
 *
 * paDeg convention: angle of the disk MAJOR axis measured from +X (image
 * right) toward +Y (image down), in [0, 180).  majorUnit = [cos(paDeg),
 * sin(paDeg)]; minorUnit = [-sin(paDeg), cos(paDeg)].  Matches
 * deprojectDisk's θ exactly — spot-check: paDeg=0 → major is horizontal,
 * paDeg=90 → major is vertical.
 */
import { describe, expect, it } from 'vitest';
import {
  diskFromDrag,
  majorAxisHandle,
  minorAxisHandle,
  axisRatioFromMinorDrag,
  deprojectPreviewRect,
  rescaleDisk,
} from '../../../../tools/famous-curator/ui/diskOverlay';
import type { RecipeDisk } from '../../../../tools/famous-curator/plugin/recipe';

describe('diskFromDrag', () => {
  it('computes radius and PA from a horizontal drag', () => {
    // centre [100,100], edge [140,100] → dx=+40, dy=0 → atan2(0,40)=0 → paDeg 0.
    const result = diskFromDrag([100, 100], [140, 100]);
    expect(result.radiusPx).toBeCloseTo(40);
    expect(result.paDeg).toBe(0);
    expect(result.centerPx).toEqual([100, 100]);
  });

  it('computes PA for a vertical drag', () => {
    // centre [100,100], edge [100,140] → dx=0, dy=+40 → atan2(40,0)=90° → paDeg 90.
    const result = diskFromDrag([100, 100], [100, 140]);
    expect(result.radiusPx).toBeCloseTo(40);
    expect(result.paDeg).toBeCloseTo(90);
  });

  it('PA is always in [0,180)', () => {
    // edge [60,60] from centre [100,100] → dx=-40, dy=-40 → atan2(-40,-40) = -135°.
    // normalizePa(-135) = ((-135 % 180) + 180) % 180 = ((-135)+180)%180 = 45%180 = 45.
    const result = diskFromDrag([100, 100], [60, 60]);
    expect(result.paDeg).toBeGreaterThanOrEqual(0);
    expect(result.paDeg).toBeLessThan(180);
    expect(result.paDeg).toBeCloseTo(45);
  });
});

describe('majorAxisHandle', () => {
  it('round-trips through diskFromDrag: recovers radiusPx and paDeg', () => {
    const cases: Array<{ paDeg: number; radiusPx: number }> = [
      { paDeg: 0, radiusPx: 40 },
      { paDeg: 45, radiusPx: 80 },
      { paDeg: 90, radiusPx: 60 },
      { paDeg: 135, radiusPx: 30 },
    ];
    for (const { paDeg, radiusPx } of cases) {
      const disk: RecipeDisk = { centerPx: [100, 100], radiusPx, paDeg, deproject: false };
      const edge = majorAxisHandle(disk);
      const recovered = diskFromDrag(disk.centerPx, edge);
      expect(recovered.radiusPx).toBeCloseTo(radiusPx, 9);
      expect(recovered.paDeg).toBeCloseTo(paDeg, 9);
    }
  });
});

describe('minorAxisHandle', () => {
  it('is perpendicular to the major axis and has correct length', () => {
    // paDeg=0 → majorUnit=[1,0], minorUnit=[0,1].
    // handle = centre + 40 * 0.5 * [0,1] = [100, 120].
    // Vector from centre to handle = [0, 20].
    // Dot with majorUnit [1,0] = 0.  Length = 20.
    const disk: RecipeDisk = { centerPx: [100, 100], radiusPx: 40, paDeg: 0, deproject: false };
    const handle = minorAxisHandle(disk, 0.5);
    const vx = handle[0] - disk.centerPx[0];
    const vy = handle[1] - disk.centerPx[1];
    const dotMajor = vx * 1 + vy * 0; // dot with [1, 0]
    const length = Math.hypot(vx, vy);
    expect(dotMajor).toBeCloseTo(0);
    expect(length).toBeCloseTo(20);
  });
});

describe('axisRatioFromMinorDrag', () => {
  it('round-trips through minorAxisHandle for multiple axisRatios and paDeg values', () => {
    const cases: Array<{ paDeg: number; axisRatio: number }> = [
      { paDeg: 0, axisRatio: 0.3 },
      { paDeg: 0, axisRatio: 0.5 },
      { paDeg: 0, axisRatio: 0.8 },
      { paDeg: 30, axisRatio: 0.3 },
      { paDeg: 30, axisRatio: 0.5 },
      { paDeg: 90, axisRatio: 0.3 },
      { paDeg: 90, axisRatio: 0.8 },
    ];
    for (const { paDeg, axisRatio } of cases) {
      const disk: RecipeDisk = { centerPx: [100, 100], radiusPx: 60, paDeg, deproject: false };
      const handle = minorAxisHandle(disk, axisRatio);
      const recovered = axisRatioFromMinorDrag(disk, handle);
      expect(recovered).toBeCloseTo(axisRatio, 9);
    }
  });
});

describe('deprojectPreviewRect', () => {
  it('frames the disk: width = 2·radiusPx·(1+margin), height = width·aspect, centred', () => {
    const disk: RecipeDisk = {
      centerPx: [300, 300],
      radiusPx: 80,
      paDeg: 0,
      axisRatio: 0.5,
      deproject: true,
    };
    const rect = deprojectPreviewRect(disk, 0.5, 0.25);
    // width = 2·80·1.25 = 200; height = 200·0.5 = 100.
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(100);
    // Centred on [300, 300]: x = 300 − 100, y = 300 − 50.
    expect(rect.x).toBe(200);
    expect(rect.y).toBe(250);
  });
});

describe('rescaleDisk', () => {
  it('scales centre + radius and leaves angle / ratios untouched', () => {
    const disk: RecipeDisk = {
      centerPx: [300, 400],
      radiusPx: 80,
      paDeg: 30,
      axisRatio: 0.5,
      deproject: true,
      margin: 0.25,
    };
    const out = rescaleDisk(disk, 0.5);
    expect(out.centerPx).toEqual([150, 200]);
    expect(out.radiusPx).toBe(40);
    // Dimensionless / angular fields are scale-invariant.
    expect(out.paDeg).toBe(30);
    expect(out.axisRatio).toBe(0.5);
    expect(out.margin).toBe(0.25);
    expect(out.deproject).toBe(true);
  });

  it('is identity at scale 1 and returns a fresh centre tuple', () => {
    const disk: RecipeDisk = { centerPx: [10, 20], radiusPx: 5, paDeg: 0, deproject: false };
    const out = rescaleDisk(disk, 1);
    expect(out).toEqual(disk);
    expect(out.centerPx).not.toBe(disk.centerPx);
  });
});
