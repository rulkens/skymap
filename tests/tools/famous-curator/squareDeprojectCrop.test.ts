import { describe, it, expect } from 'vitest';
import { squareDeprojectCrop } from '../../../tools/famous/squareDeprojectCrop';
import type { RecipeDisk } from '../../../tools/famous-curator/plugin/recipe';

const disk = (over: Partial<RecipeDisk> = {}): RecipeDisk => ({
  centerPx: [100, 100],
  radiusPx: 40,
  paDeg: 30,
  axisRatio: 0.5,
  deproject: true,
  ...over,
});

describe('squareDeprojectCrop', () => {
  it('snaps rotationDeg to disk.paDeg', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 0 },
      disk({ paDeg: 30 }),
      0.5,
    );
    expect(out.rotationDeg).toBe(30);
  });

  it('snaps height to round(width * effectiveAxisRatio)', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 0 },
      disk(),
      0.5,
    );
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
  });

  it('preserves the crop centre', () => {
    const inCrop = { x: 50, y: 60, width: 200, height: 200, rotationDeg: 0 };
    const out = squareDeprojectCrop(inCrop, disk(), 0.5);
    const cx = inCrop.x + inCrop.width / 2;
    const cy = inCrop.y + inCrop.height / 2;
    expect(out.x + out.width / 2).toBeCloseTo(cx, 6);
    expect(out.y + out.height / 2).toBeCloseTo(cy, 6);
  });

  it('is identity-on-aspect at b/a = 1 (height == width, square stays square)', () => {
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 200, height: 200, rotationDeg: 45 },
      disk({ axisRatio: 1, paDeg: 90 }),
      1,
    );
    expect(out.width).toBe(out.height);
    expect(out.rotationDeg).toBe(90);
  });

  it('the post-deproject extent is square (width === height * (1/aspect) ⇒ width === square side)', () => {
    // height = width*aspect; minor-axis stretch by 1/aspect ⇒ stretched height = width.
    const aspect = 0.4;
    const out = squareDeprojectCrop(
      { x: 0, y: 0, width: 300, height: 300, rotationDeg: 0 },
      disk({ axisRatio: aspect }),
      aspect,
    );
    expect(out.height * (1 / aspect)).toBeCloseTo(out.width, 6);
  });
});
