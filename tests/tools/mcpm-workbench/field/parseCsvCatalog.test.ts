import { describe, expect, it } from 'vitest';
import type { CatalogImportSettings } from '../../../../tools/mcpm-workbench/@types/CatalogImportSettings';
import { parseCsvCatalog } from '../../../../tools/mcpm-workbench/src/field/parseCsvCatalog';
import { redshiftToDistanceMpc } from '../../../../src/utils/math/redshiftToDistanceMpc';

const XYZ: CatalogImportSettings = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
};
const RADEC: CatalogImportSettings = {
  format: { kind: 'raDecRedshift', h0KmSMpc: 70, omegaM: 0.3 },
  weight: { kind: 'linear', scale: 1 },
};
const LOG: CatalogImportSettings = { ...XYZ, weight: { kind: 'log10MassMsun' } };

function parsed(text: string, settings: CatalogImportSettings) {
  const result = parseCsvCatalog(text, settings);
  if (!result.ok) throw new Error(`expected ok, got ${result.problem.message}`);
  return result;
}

function problem(text: string, settings: CatalogImportSettings) {
  const result = parseCsvCatalog(text, settings);
  if (result.ok) throw new Error('expected a problem');
  return result.problem;
}

describe('parseCsvCatalog problems', () => {
  it('fewer than 4 numbers', () => {
    expect(problem('1,2,3,1\n1,2,3\n', XYZ)).toEqual({
      line: 2,
      message: 'Line 2: expected 4 numbers, found 3',
    });
  });

  it('non-finite coordinate', () => {
    expect(problem('1,abc,3,1\n', XYZ)).toEqual({
      line: 1,
      message: 'Line 1: every value must be a finite number',
    });
  });

  it('weight × scale ≤ 0 or non-finite', () => {
    const message = 'Line 1: weight must be greater than 0';
    expect(problem('1,2,3,0\n', XYZ)).toEqual({ line: 1, message });
    expect(problem('1,2,3,-2\n', XYZ)).toEqual({ line: 1, message });
    expect(problem('1,2,3,NaN\n', XYZ)).toEqual({ line: 1, message });
  });

  // A weight stored as Float32 Infinity made deriveAgentWeights zero every deposit, built-ins too.
  it('a linear mass column read as log₁₀ of mass overflows', () => {
    expect(problem('1,2,3,1e10\n', LOG)).toEqual({
      line: 1,
      message: 'Line 1: weight 1e10 is too large for log₁₀ of mass. Did you mean linear?',
    });
  });

  it('a linear weight beyond 32-bit float range, either way', () => {
    const message = 'Line 1: weight is outside the range a 32-bit float can hold';
    expect(problem('1,2,3,1e39\n', XYZ)).toEqual({ line: 1, message });
    expect(problem('1,2,3,1e-50\n', XYZ)).toEqual({ line: 1, message });
  });

  it('RA/Dec format, Dec outside −90…90', () => {
    expect(problem('10,120,0.1,1\n', RADEC)).toEqual({
      line: 1,
      message: 'Line 1: Dec 120 is outside −90 to 90. Did you mean cartesian?',
    });
  });

  it('RA/Dec format, RA outside 0…360', () => {
    expect(problem('# ra dec z w\n-12.5,10,0.1,1\n', RADEC)).toEqual({
      line: 2,
      message: 'Line 2: RA -12.5 is outside 0 to 360. Did you mean cartesian?',
    });
  });

  it('RA/Dec format, z < 0', () => {
    expect(problem('10,10,-0.01,1\n', RADEC)).toEqual({
      line: 1,
      message: 'Line 1: redshift must be 0 or more',
    });
  });

  it('no data lines', () => {
    expect(problem('x,y,z,w\n# nothing here\n\n', XYZ)).toEqual({
      line: null,
      message: 'No data rows found',
    });
  });
});

describe('parseCsvCatalog', () => {
  it('loads comma, semicolon, tab and space separated rows alike', () => {
    const { points } = parsed(
      '1,2,3,4\n5;6;7;8\n9\t10\t11\t12\n13  14 15 16\n17, 18, 19, 20\n',
      XYZ,
    );

    expect(points.count).toBe(5);
    expect(Array.from(points.positions)).toEqual([
      1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19,
    ]);
    expect(Array.from(points.weight)).toEqual([4, 8, 12, 16, 20]);
  });

  it('skips a header row, # comments and blank lines and counts them', () => {
    const { points, skippedLines } = parsed('x,y,z,w\n# comment\n\n1,2,3,4\n  \n.5,+6,-7,8\n', XYZ);

    expect(Array.from(points.positions)).toEqual([1, 2, 3, 0.5, 6, -7]);
    expect(skippedLines).toBe(4);
  });

  it('reads CRLF line endings', () => {
    const { points, skippedLines } = parsed('x,y,z,w\r\n1,2,3,4\r\n5,6,7,8\r\n', XYZ);

    expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(Array.from(points.weight)).toEqual([4, 8]);
    expect(skippedLines).toBe(1);
  });

  it('ignores columns after the fourth', () => {
    const { points } = parsed('1,2,3,4,99,abc\n', XYZ);

    expect(Array.from(points.weight)).toEqual([4]);
  });

  it('applies the weight scale', () => {
    const { points } = parsed('1,2,3,42\n', { ...XYZ, weight: { kind: 'linear', scale: 0.001 } });

    expect(points.weight[0]).toBeCloseTo(0.042, 6);
  });

  it('converts a log10 mass column to linear 1e12 Msun', () => {
    const { points } = parsed('1,2,3,12\n1,2,3,9\n1,2,3,0\n1,2,3,-1\n', LOG);

    expect(points.weight[0]).toBe(1);
    expect(points.weight[1]).toBeCloseTo(0.001, 9);
    expect(points.weight[2]).toBeGreaterThan(0);
    expect(points.weight[3]).toBeGreaterThan(0);
  });

  it('reports min, median and max of the stored weights', () => {
    const { weightStats } = parsed('0,0,0,4\n0,0,0,1\n0,0,0,3\n0,0,0,2\n', XYZ);

    expect(weightStats).toEqual({ min: 1, median: 2.5, max: 4 });
  });

  it("places RA 0, Dec 0 on +x and Dec 90 on +z at the redshift's distance", () => {
    const { points } = parsed('0,0,0.1,1\n0,90,0.1,1\n', RADEC);
    const d = redshiftToDistanceMpc(0.1, { h0KmSMpc: 70, omegaM: 0.3 });
    const p = Array.from(points.positions);

    expect(p[0]).toBeCloseTo(d, 3);
    expect(p[1]).toBeCloseTo(0, 3);
    expect(p[2]).toBeCloseTo(0, 3);
    expect(p[3]).toBeCloseTo(0, 3);
    expect(p[4]).toBeCloseTo(0, 3);
    expect(p[5]).toBeCloseTo(d, 3);
  });

  it('uses the given H0', () => {
    const row = '45,30,0.2,1\n';
    const at70 = parsed(row, RADEC).points.positions;
    const at140 = parsed(row, {
      ...RADEC,
      format: { kind: 'raDecRedshift', h0KmSMpc: 140, omegaM: 0.3 },
    }).points.positions;
    const radius = (p: Float32Array) => Math.hypot(p[0]!, p[1]!, p[2]!);

    expect(radius(at140) / radius(at70)).toBeCloseTo(0.5, 5);
  });
});
