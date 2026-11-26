import { describe, expect, it } from 'vitest';
import type { CatalogImportSettings } from '../../../../../../tools/mcpm-workbench/@types/catalog/import/CatalogImportSettings';
import type { CsvColumns } from '../../../../../../tools/mcpm-workbench/@types/catalog/import/CsvColumns';
import { catalogFromCsvColumns } from '../../../../../../tools/mcpm-workbench/src/catalog/import/catalogFromCsvColumns';
import { createCsvColumnReader } from '../../../../../../tools/mcpm-workbench/src/catalog/import/createCsvColumnReader';

const XYZ: CatalogImportSettings = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
};
const RADEC: CatalogImportSettings = {
  format: { kind: 'raDecRedshift', h0KmSMpc: 70, omegaM: 0.3 },
  weight: { kind: 'linear', scale: 1 },
};
const LOG: CatalogImportSettings = { ...XYZ, weight: { kind: 'log10MassMsun' } };

// The text in chunks cut at `cuts` (byte offsets), as a file streams in.
function columnsOf(text: string, cuts: readonly number[] = []): CsvColumns {
  const bytes = new TextEncoder().encode(text);
  const reader = createCsvColumnReader(bytes.length);
  const ends = [...cuts, bytes.length];
  ends.reduce((from, to) => (reader.push(bytes.subarray(from, to)), to), 0);
  return reader.finish();
}

function parse(text: string, settings: CatalogImportSettings) {
  return catalogFromCsvColumns(columnsOf(text), settings);
}

function parsed(text: string, settings: CatalogImportSettings) {
  const result = parse(text, settings);
  if (result.kind === 'problem') throw new Error(`expected parsed, got ${result.message}`);
  return result;
}

function problem(text: string, settings: CatalogImportSettings) {
  const result = parse(text, settings);
  if (result.kind === 'parsed') throw new Error('expected a problem');
  return result.message;
}

describe('catalogFromCsvColumns problems', () => {
  it('fewer than 4 numbers', () => {
    expect(problem('1,2,3,1\n1,2,3\n', XYZ)).toBe('Line 2: expected 4 numbers, found 3');
  });

  // Collapsed separators once read this row as x=10, y=20, z=0.03, w=0.5 without a word.
  it('an empty field between commas', () => {
    expect(problem('10,,20,0.03,0.5,7\n', XYZ)).toBe('Line 1: every value must be a finite number');
  });

  // Collapsing the two tabs read y as 3 and the weight as 5.
  it('an empty field between tabs', () => {
    expect(problem('1\t\t3\t4\t5\n', XYZ)).toBe('Line 1: every value must be a finite number');
  });

  it('a line separated differently from the first data line', () => {
    expect(problem('# x y z w\n1,2,3,4\n5\t6\t7\t8\n', XYZ)).toBe(
      'Line 3: expected 4 numbers, found 1',
    );
    expect(problem('1 2 3 4\n5,6,7,8\n', XYZ)).toBe('Line 2: expected 4 numbers, found 1');
  });

  it('non-finite coordinate', () => {
    expect(problem('1,abc,3,1\n', XYZ)).toBe('Line 1: every value must be a finite number');
  });

  it('weight × scale ≤ 0 or non-finite', () => {
    const message = 'Line 1: weight must be greater than 0';
    expect(problem('1,2,3,0\n', XYZ)).toBe(message);
    expect(problem('1,2,3,-2\n', XYZ)).toBe(message);
    expect(problem('1,2,3,NaN\n', XYZ)).toBe(message);
  });

  // A weight stored as Float32 Infinity made deriveAgentWeights zero every deposit, built-ins too.
  it('a linear mass column read as log₁₀ of mass overflows', () => {
    expect(problem('1,2,3,1e10\n', LOG)).toBe(
      'Line 1: weight 1e10 is too large for log₁₀ of mass. Did you mean linear?',
    );
  });

  it('a linear weight beyond 32-bit float range, either way', () => {
    const message = 'Line 1: weight is outside the range a 32-bit float can hold';
    expect(problem('1,2,3,1e39\n', XYZ)).toBe(message);
    expect(problem('1,2,3,1e-50\n', XYZ)).toBe(message);
  });

  // A position stored as Float32 Infinity turns the catalog bounds, and so auto fit, infinite.
  it('a position beyond 32-bit float range', () => {
    const message = 'Line 2: position is outside the range a 32-bit float can hold';
    expect(problem('1,2,3,1\n1e39,0,0,0.1\n', XYZ)).toBe(message);
    expect(problem('1,2,3,1\n0,0,-1e39,0.1\n', XYZ)).toBe(message);
  });

  it('RA/Dec format, Dec outside −90…90', () => {
    expect(problem('10,120,0.1,1\n', RADEC)).toBe(
      'Line 1: Dec 120 is outside −90 to 90. Did you mean cartesian?',
    );
  });

  it('RA/Dec format, RA outside 0…360', () => {
    expect(problem('# ra dec z w\n-12.5,10,0.1,1\n', RADEC)).toBe(
      'Line 2: RA -12.5 is outside 0 to 360. Did you mean cartesian?',
    );
  });

  it('RA/Dec format, z < 0', () => {
    expect(problem('10,10,-0.01,1\n', RADEC)).toBe('Line 1: redshift must be 0 or more');
  });

  it('no data lines', () => {
    expect(problem('x,y,z,w\n# nothing here\n\n', XYZ)).toBe('No data rows found');
  });

  // The text is read before any setting applies, yet the first bad line in the file still wins.
  it('the first bad line wins, whether the text or a setting refuses it', () => {
    expect(problem('10,120,0.1,1\n1,abc,3,1\n', RADEC)).toBe(
      'Line 1: Dec 120 is outside −90 to 90. Did you mean cartesian?',
    );
    expect(problem('1,abc,3,1\n10,120,0.1,1\n', RADEC)).toBe(
      'Line 1: every value must be a finite number',
    );
  });

  // Read as float32 first, this Dec would round to 90 and load.
  it('tests ranges on the value as written, not as stored', () => {
    expect(problem('10,90.000001,0.1,1\n', RADEC)).toBe(
      'Line 1: Dec 90.000001 is outside −90 to 90. Did you mean cartesian?',
    );
  });
});

describe('catalogFromCsvColumns', () => {
  it('loads comma, semicolon, tab and space separated files alike', () => {
    const files = [
      '1,2,3,4\n5;6;7;8\n9, 10 ,11 , 12,\n',
      '1\t2\t3\t4\n5 \t 6\t7\t8\t\n\t9\t10\t11\t12\n',
      '1 2 3 4\n  5   6\t7 \t 8  \n9 10 11 12\n',
    ];
    for (const text of files) {
      const { points } = parsed(text, XYZ);

      expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
      expect(Array.from(points.weight)).toEqual([4, 8, 12]);
    }
  });

  it('skips a header row, # comments and blank lines', () => {
    const { points } = parsed('x,y,z,w\n# comment\n\n1,2,3,4\n  \n.5,+6,-7,8\n', XYZ);

    expect(Array.from(points.positions)).toEqual([1, 2, 3, 0.5, 6, -7]);
  });

  it('reads CRLF line endings', () => {
    const { points } = parsed('x,y,z,w\r\n1,2,3,4\r\n5,6,7,8\r\n', XYZ);

    expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(Array.from(points.weight)).toEqual([4, 8]);
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
    expect(points.weight[2]! / 1e-12).toBeCloseTo(1, 5);
    expect(points.weight[3]! / 1e-13).toBeCloseTo(1, 5);
  });

  it('reports min, median and max of the stored weights', () => {
    const { weightStats } = parsed('0,0,0,4\n0,0,0,1\n0,0,0,3\n0,0,0,2\n', XYZ);

    expect(weightStats).toEqual({ min: 1, median: 2.5, max: 4 });
  });

  it("places RA 0, Dec 0 on +x and Dec 90 on +z at the redshift's distance", () => {
    const { points } = parsed('0,0,0.1,1\n0,90,0.1,1\n', RADEC);
    // An independent Simpson integration (1e5 panels): d_C(0.1) at H0 70, Ωm 0.3.
    const d = 418.4545;
    const p = Array.from(points.positions);

    expect(p[0]).toBeCloseTo(d, 3);
    expect(p[1]).toBeCloseTo(0, 3);
    expect(p[2]).toBeCloseTo(0, 3);
    expect(p[3]).toBeCloseTo(0, 3);
    expect(p[4]).toBeCloseTo(0, 3);
    expect(p[5]).toBeCloseTo(d, 3);
  });

  it('reads a line led by a non-breaking space or a byte order mark', () => {
    const { points } = parsed('\u00a01,2,3,4\n\ufeff5,6,7,8\n', XYZ);

    expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it('reads the same however the file is cut into chunks', () => {
    const text = '# ra dec z w\r\n10,20,0.1,1\r\n30,40,0.2,2\r\n10,abc,0.1,1\r\n5,6\r\n7,8,9,1';
    const whole = catalogFromCsvColumns(columnsOf(text), XYZ);
    const bytes = new TextEncoder().encode(text).length;
    for (let a = 0; a <= bytes; a++) {
      for (let b = a; b <= bytes; b += 7) {
        expect(catalogFromCsvColumns(columnsOf(text, [a, b]), XYZ)).toEqual(whole);
      }
    }
  });

  it('derives again under new settings from the same columns', () => {
    const text = '10,20,0.1,12\n30,40,0.2,11\n';
    const columns = columnsOf(text);

    catalogFromCsvColumns(columns, RADEC);
    expect(catalogFromCsvColumns(columns, LOG)).toEqual(parse(text, LOG));
    expect(catalogFromCsvColumns(columns, RADEC)).toEqual(parse(text, RADEC));
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
