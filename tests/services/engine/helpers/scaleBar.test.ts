/**
 * scaleBar — unit tests for the pure scale-bar computation.
 *
 * We exercise the {1, 2, 5} × 10^k tick selection across a few
 * representative camera distances (close-up galaxy, mid-galaxy catalog, deep
 * field) and verify the output `widthPx` always fits inside the target
 * pixel envelope (a property of `niceRound`'s floor behaviour).  We
 * also verify the degenerate-input short-circuits (zero canvas, infinite
 * pxPerMpc) return `null` rather than emitting NaN.
 */

import { describe, it, expect } from 'vitest';

import { computeScaleInfo } from '../../../../src/services/engine/helpers/scaleBar';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

const FOV = (Math.PI / 180) * 60;
const TARGET_PX = 150;
const CANVAS = { width: 1280, height: 720 };

describe('computeScaleInfo', () => {
  it('returns null when canvas height is zero', () => {
    const result = computeScaleInfo({
      cam: { distance: 100, fovYRad: FOV },
      canvasSize: { width: 1280, height: 0 },
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when distance is zero (pxPerMpc would be infinite)', () => {
    const result = computeScaleInfo({
      cam: { distance: 0, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when distance is negative (pxPerMpc <= 0)', () => {
    const result = computeScaleInfo({
      cam: { distance: -10, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).toBeNull();
  });

  it('emits a Mpc label at mid-galaxy catalog distance', () => {
    // distance = 100 Mpc, 720px tall, 60° FOV.
    // h_world = 2 * 100 * tan(30°) ≈ 115.47
    // pxPerMpc ≈ 720 / 115.47 ≈ 6.235
    // desiredMpc = 150 / 6.235 ≈ 24.06 → niceRound → 20
    const result = computeScaleInfo({
      cam: { distance: 100, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.label).toBe('20.0 Mpc / 65.2 Mly');
    // widthPx = 20 * 6.235 ≈ 124.7 → rounds to 125
    expect(result!.widthPx).toBeCloseTo(125, 0);
  });

  it('emits a Gpc label at very deep distances', () => {
    // distance = 5000 Mpc → desiredMpc ≈ 1203 → niceRound → 1000 (= 1 Gpc)
    const result = computeScaleInfo({
      cam: { distance: 5000, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.label).toBe('1.00 Gpc / 3.26 Gly');
  });

  it('emits a kpc label at close-up galaxy distance', () => {
    // distance = 0.5 Mpc → desiredMpc ≈ 0.12 → niceRound → 0.1 (= 100 kpc)
    const result = computeScaleInfo({
      cam: { distance: 0.5, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.label).toBe('100 kpc / 326 kly');
  });

  it('always returns widthPx ≤ targetPx (floor rounding fits inside envelope)', () => {
    // Sweep a handful of distances spanning 4 orders of magnitude.
    const distances = [0.05, 0.5, 5, 50, 500, 5000];
    for (const d of distances) {
      const result = computeScaleInfo({
        cam: { distance: d, fovYRad: FOV },
        canvasSize: CANVAS,
        targetPx: TARGET_PX,
        pivotAltitudeMpc: null,
      });
      expect(result).not.toBeNull();
      expect(result!.widthPx).toBeLessThanOrEqual(TARGET_PX);
    }
  });

  it('selects the {1, 2, 5} × 10^k family for the niceMpc tick', () => {
    // The label's leading digit must be 1, 2, or 5 across the range.
    const distances = [1, 3, 10, 30, 100, 300, 1000, 3000];
    for (const d of distances) {
      const result = computeScaleInfo({
        cam: { distance: d, fovYRad: FOV },
        canvasSize: CANVAS,
        targetPx: TARGET_PX,
        pivotAltitudeMpc: null,
      });
      expect(result).not.toBeNull();
      const leading = result!.label.match(/^([0-9]+)/)?.[1];
      expect(leading).toBeDefined();
      // Strip trailing zeros to get the mantissa's leading family digit.
      const mantissa = leading!.replace(/0+$/, '');
      expect(['1', '2', '5']).toContain(mantissa);
    }
  });

  it('scales linearly with viewport height', () => {
    // Doubling the canvas height doubles pxPerMpc, halves desiredMpc,
    // typically lands on the same niceMpc tick (the widths themselves differ).
    const a = computeScaleInfo({
      cam: { distance: 100, fovYRad: FOV },
      canvasSize: { width: 1280, height: 720 },
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    const b = computeScaleInfo({
      cam: { distance: 100, fovYRad: FOV },
      canvasSize: { width: 1280, height: 1440 },
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Doubled viewport: pxPerMpc doubles, desiredMpc halves.
    // 24 → 12, both round down to 10 in the {1,2,5}×10^k family.
    expect(b!.label).toBe('10.0 Mpc / 32.6 Mly');
  });

  it('measures altitude above a body pivot, not distance to its centre', () => {
    // Earth's radius in Mpc, camera 1.00015x that out — i.e. ~956 m of
    // altitude above the surface (6371 km * 0.00015 ≈ 0.956 km). Reading
    // `cam.distance` directly (the pre-fix bug) saturates at ~1 Earth radius
    // and pins the bar at a fixed centre-distance label regardless of how
    // close to the ground the camera actually is. The caller now resolves
    // this EYE-based altitude itself (`eyeAltitudeMpc`); this pure helper
    // just takes the resulting number.
    const earthRadiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC;
    const altitudeMpc = earthRadiusMpc * 0.00015;
    const result = computeScaleInfo({
      cam: { distance: earthRadiusMpc * 1.00015, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: altitudeMpc,
    });
    expect(result).not.toBeNull();
    expect(result!.label).toBe('154 m');

    // Same camera distance, but read as pivot-less (the old behavior): pins
    // at the centre-distance label instead of the ground-relative one.
    const centreDistance = computeScaleInfo({
      cam: { distance: earthRadiusMpc * 1.00015, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: null,
    });
    expect(centreDistance).not.toBeNull();
    expect(centreDistance!.label).not.toBe(result!.label);
  });

  it('returns null when the pivot altitude is zero or negative (effectiveDistance <= 0)', () => {
    const result = computeScaleInfo({
      cam: { distance: 10, fovYRad: FOV },
      canvasSize: CANVAS,
      targetPx: TARGET_PX,
      pivotAltitudeMpc: 0,
    });
    expect(result).toBeNull();
  });
});
