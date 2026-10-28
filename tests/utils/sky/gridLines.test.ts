/**
 * The sky grid line generators: unit directions in a frame whose +z is the
 * grid's pole and +x its longitude zero, every step at most the asked angle.
 */
import { describe, it, expect } from 'vitest';

import { parallelLine } from '../../../src/utils/sky/parallelLine';
import { meridianLine } from '../../../src/utils/sky/meridianLine';
import { sphericalGridLines } from '../../../src/utils/sky/sphericalGridLines';
import { dot3 } from '../../../src/utils/math/dot3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const RAD = Math.PI / 180;
const maxStepDeg = (line: readonly Vec3[]) =>
  Math.max(...line.slice(1).map((p, i) => Math.acos(Math.min(1, dot3(p, line[i]!))) / RAD));

describe('parallelLine', () => {
  it('closes on itself at a constant latitude, in unit steps no wider than asked', () => {
    const line = parallelLine(30, 1);
    expect(line[0]).toEqual(line.at(-1));
    for (const p of line) {
      expect(dot3(p, p)).toBeCloseTo(1, 12);
      expect(p[2]).toBeCloseTo(Math.sin(30 * RAD), 12);
    }
    expect(maxStepDeg(line)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('keeps every step under the bound on the equator, where the circle is longest', () => {
    expect(maxStepDeg(parallelLine(0, 0.7))).toBeLessThanOrEqual(0.7 + 1e-9);
  });
});

describe('meridianLine', () => {
  it('runs pole to pole at a constant longitude', () => {
    const line = meridianLine(90, 1);
    expect(line[0]![2]).toBeCloseTo(-1, 12);
    expect(line.at(-1)![2]).toBeCloseTo(1, 12);
    for (const p of line) {
      expect(dot3(p, p)).toBeCloseTo(1, 12);
      expect(p[0]).toBeCloseTo(0, 12);
      expect(p[1]).toBeGreaterThanOrEqual(-1e-12);
    }
    expect(maxStepDeg(line)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('sphericalGridLines', () => {
  it('draws every parallel but the poles and every meridian', () => {
    // 10° parallels: −80…80 is 17 lines; 15° meridians: 24.
    expect(sphericalGridLines(10, 15, 1)).toHaveLength(17 + 24);
  });
});
