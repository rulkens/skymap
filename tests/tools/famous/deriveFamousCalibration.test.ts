/**
 * Tests for deriveFamousCalibration — pure source-px disk + crop → normalised
 * FamousCalibration.
 *
 * Expected values for the rotated-crop case are derived by hand:
 *   crop { x:100, y:100, w:256, h:256, rotationDeg:45 }
 *   cropCenter = (228, 228)
 *   disk.centerPx = [292, 228]  → dx=64, dy=0
 *   R(-45°): localX =  64·cos(45°) + 0·sin(45°) = 64/√2 = 32√2
 *             localY = -64·sin(45°) + 0·cos(45°) = -64/√2 = -32√2
 *   u = (32√2  + 128) / 256 = 0.5 + √2/8 ≈ 0.67677669
 *   v = (-32√2 + 128) / 256 = 0.5 - √2/8 ≈ 0.32322331
 */
import { describe, expect, it } from 'vitest';
import { deriveFamousCalibration } from '../../../tools/famous/deriveFamousCalibration';
import type { RecipeCrop, RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid RecipeDisk.  Override individual fields per test. */
function makeDisk(overrides: Partial<RecipeDisk> = {}): RecipeDisk {
  return {
    centerPx: [256, 256],
    radiusPx: 64,
    paDeg: 0,
    deproject: false,
    ...overrides,
  };
}

/** Minimal valid RecipeCrop centred at (256,256) with no rotation. */
function makeCrop(overrides: Partial<RecipeCrop> = {}): RecipeCrop {
  return {
    x: 128,
    y: 128,
    width: 256,
    height: 256,
    rotationDeg: 0,
    ...overrides,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('deriveFamousCalibration', () => {
  it('centred nucleus, unrotated crop → center [0.5, 0.5]', () => {
    // Nucleus sits exactly at the crop centre → should map to [0.5, 0.5].
    const disk = makeDisk({ centerPx: [256, 256] });  // crop center = (128+128, 128+128) = (256,256)
    const crop = makeCrop();
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.center[0]).toBeCloseTo(0.5, 10);
    expect(cal.center[1]).toBeCloseTo(0.5, 10);
  });

  it('off-centre nucleus → expected normalized center', () => {
    // Nucleus at right edge of crop half-way → u=0.75, v=0.5.
    // Crop: x=0, y=0, w=256, h=256 → cropCenter=(128,128).
    // disk.centerPx = [192, 128] → dx=64, dy=0.
    // No rotation: localX=64, localY=0.
    // u = (64+128)/256 = 192/256 = 0.75,  v = (0+128)/256 = 0.5.
    const crop: RecipeCrop = { x: 0, y: 0, width: 256, height: 256, rotationDeg: 0 };
    const disk = makeDisk({ centerPx: [192, 128] });
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.center[0]).toBeCloseTo(0.75, 10);
    expect(cal.center[1]).toBeCloseTo(0.5, 10);
  });

  it('diskRadiusFrac = radiusPx / (width/2)', () => {
    // radiusPx=64, crop.width=256 → 64 / (256/2) = 64/128 = 0.5.
    const disk = makeDisk({ radiusPx: 64 });
    const crop = makeCrop();
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.diskRadiusFrac).toBeCloseTo(0.5, 10);
  });

  it('paDeg rotated into final frame: disk 40, crop 10 → 30', () => {
    const disk = makeDisk({ paDeg: 40 });
    const crop = makeCrop({ rotationDeg: 10 });
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.paDeg).toBeCloseTo(30, 10);
  });

  it('paDeg wraparound: disk 10, crop 30 → 160 (stays in [0,180))', () => {
    // 10 - 30 = -20 → normalise to 160.
    const disk = makeDisk({ paDeg: 10 });
    const crop = makeCrop({ rotationDeg: 30 });
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.paDeg).toBeCloseTo(160, 10);
  });

  it('rotated crop maps the nucleus through R(-rotationDeg)', () => {
    // See module-level comment for the derivation.
    // crop { x:100, y:100, w:256, h:256, rotationDeg:45 }
    // cropCenter = (228, 228), disk.centerPx = [292, 228]
    // dx=64, dy=0; R(-45°): localX=32√2, localY=-32√2
    // u = 0.5 + √2/8,  v = 0.5 - √2/8
    const crop: RecipeCrop = { x: 100, y: 100, width: 256, height: 256, rotationDeg: 45 };
    const disk = makeDisk({ centerPx: [292, 228] });
    const expected_u = 0.5 + Math.SQRT2 / 8;
    const expected_v = 0.5 - Math.SQRT2 / 8;
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: 0.6, deprojected: false });

    expect(cal.center[0]).toBeCloseTo(expected_u, 10);
    expect(cal.center[1]).toBeCloseTo(expected_v, 10);
  });

  it('axisRatio falls back to catalogAxisRatio when disk.axisRatio absent', () => {
    // disk has no axisRatio field → should use catalogAxisRatio.
    const disk = makeDisk();  // no axisRatio
    const cal = deriveFamousCalibration({ disk, crop: makeCrop(), catalogAxisRatio: 0.42, deprojected: false });

    expect(cal.axisRatio).toBeCloseTo(0.42, 10);
  });

  it('disk.axisRatio takes precedence over catalogAxisRatio when present', () => {
    const disk = makeDisk({ axisRatio: 0.7 });
    const cal = deriveFamousCalibration({ disk, crop: makeCrop(), catalogAxisRatio: 0.42, deprojected: false });

    expect(cal.axisRatio).toBeCloseTo(0.7, 10);
  });

  it('deprojected flag passes through', () => {
    const disk = makeDisk();
    const calTrue = deriveFamousCalibration({ disk, crop: makeCrop(), catalogAxisRatio: 0.6, deprojected: true });
    const calFalse = deriveFamousCalibration({ disk, crop: makeCrop(), catalogAxisRatio: 0.6, deprojected: false });

    expect(calTrue.deprojected).toBe(true);
    expect(calFalse.deprojected).toBe(false);
  });
});

describe('deriveFamousCalibration deprojected branch', () => {
  // Normalised square-deproject crop: rotationDeg === disk.paDeg, height = width*aspect.
  const aspect = 0.5;
  const crop = { x: 100, y: 100, width: 400, height: 200, rotationDeg: 30 };
  const disk = {
    centerPx: [300, 200] as [number, number], // off-centre vs crop centre (300,200)
    radiusPx: 80, paDeg: 30, axisRatio: aspect, deproject: true,
  };

  it('emits PA = 0 (texture is face-on)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.paDeg).toBe(0);
  });

  it('emits axisRatio = 1 (no runtime re-tilt)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.axisRatio).toBe(1);
  });

  it('diskRadiusFrac is radiusPx / (crop.width/2)', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.diskRadiusFrac).toBeCloseTo(80 / (400 / 2), 6); // 0.4
  });

  it('center accounts for the minor-axis stretch (off-centre disk)', () => {
    // Disk centre = crop centre here ⇒ local (0,0) ⇒ normalised (0.5,0.5)
    // even after the Y stretch (0/aspect = 0).
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.center[0]).toBeCloseTo(0.5, 6);
    expect(cal.center[1]).toBeCloseTo(0.5, 6);
  });

  it('center Y-stretch: a disk offset along the minor axis grows post-deproject', () => {
    // Move the disk centre off the crop centre along image-Y (paDeg=0 case for clarity).
    const c2 = { x: 0, y: 0, width: 400, height: 200, rotationDeg: 0 };
    const d2 = { centerPx: [200, 120] as [number, number], radiusPx: 40, paDeg: 0, axisRatio: aspect, deproject: true };
    // localY = 120 - 100 = 20; stretched = 20 / 0.5 = 40; normalised = (40 + 200)/400 = 0.6
    const cal = deriveFamousCalibration({ disk: d2, crop: c2, catalogAxisRatio: aspect, deprojected: true });
    expect(cal.center[1]).toBeCloseTo(0.6, 6);
    expect(cal.center[0]).toBeCloseTo(0.5, 6);
  });

  it('non-deprojected branch is unchanged', () => {
    const cal = deriveFamousCalibration({ disk, crop, catalogAxisRatio: aspect, deprojected: false });
    expect(cal.axisRatio).toBe(aspect);
    expect(cal.deprojected).toBe(false);
  });
});
