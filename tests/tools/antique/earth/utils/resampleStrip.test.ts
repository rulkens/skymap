/**
 * A border's dots are spaced by arc length, so the running arc must be the
 * great-circle distance, continuous across the polyline's corners, with the
 * input's own vertices kept exactly and no piece longer than asked.
 */

import { describe, it, expect } from 'vitest';

import { resampleStrip } from '../../../../../tools/antique/earth/utils/resampleStrip';

const R = 6371;

describe('resampleStrip', () => {
  it('cuts each span into equal great-circle pieces with a continuous arc', () => {
    // Along the equator 0→90°E, then up the meridian to 45°N.
    const { points } = resampleStrip(
      [
        [0, 0],
        [90, 0],
        [90, 45],
      ],
      { maxKm: 1000, radiusKm: R, kind: 2, level: 4, widthAt: (arc, total) => 0.5 + arc / total },
    );
    const quarter = (Math.PI / 2) * R;
    const eighth = quarter / 2;
    expect(points.length).toBe(1 + Math.ceil(quarter / 1000) + Math.ceil(eighth / 1000));
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.arcKm - points[i - 1]!.arcKm).toBeLessThanOrEqual(1000 + 1e-9);
      expect(points[i]!.arcKm).toBeGreaterThan(points[i - 1]!.arcKm);
    }
    const corner = points.find((p) => p.lonDeg === 90 && p.latDeg === 0)!;
    expect(corner.arcKm).toBeCloseTo(quarter, 6);
    expect(points.at(-1)).toMatchObject({ lonDeg: 90, latDeg: 45 });
    expect(points.at(-1)!.arcKm).toBeCloseTo(quarter + eighth, 6);
    expect(points[0]!.widthUnits).toBe(0.5);
    expect(points.at(-1)!.widthUnits).toBeCloseTo(1.5, 12);
    // A midpoint of the equator span stays on the equator.
    expect(Math.abs(points[3]!.latDeg)).toBeLessThan(1e-9);
  });
});
