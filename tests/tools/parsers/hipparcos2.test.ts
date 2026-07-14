import { describe, it, expect } from 'vitest';
import { parseHipparcos2 } from '../../../tools/parsers/hipparcos2';

/**
 * Fixed-width fixtures for VizieR I/311 `hip2.dat` (276-byte records).
 *
 * Rather than copy a real 276-char line (whose interesting fields would be
 * buried among proper motions and error columns), we BUILD each fixture by
 * placing known values at their 1-based inclusive byte columns straight from
 * the ReadMe table. `placeField` right-justifies each value inside its column
 * range the way the F-format source file does, so the parser's `slot()` sees
 * exactly the byte layout it will meet in production — and the placement
 * arithmetic is derived from the ReadMe, not mirrored from the parser's own
 * slice offsets.
 */
const RECORD_LEN = 276;

/** Write `text`, right-justified, into the 1-based inclusive byte range. */
function placeField(cols: string[], start1: number, end1: number, text: string): void {
  const width = end1 - start1 + 1;
  if (text.length > width) throw new Error(`field '${text}' wider than ${width} cols`);
  const padded = text.padStart(width);
  for (let i = 0; i < width; i++) cols[start1 - 1 + i] = padded[i]!;
}

type FieldValues = {
  hip: string;
  raRad: string;
  deRad: string;
  plxMas: string;
  hpMag: string;
  bv: string;
};

function buildRecord(f: FieldValues): string {
  const cols: string[] = new Array(RECORD_LEN).fill(' ');
  placeField(cols, 1, 6, f.hip); // HIP    I6
  placeField(cols, 16, 28, f.raRad); // RArad  F13.10
  placeField(cols, 30, 42, f.deRad); // DErad  F13.10
  placeField(cols, 44, 50, f.plxMas); // Plx    F7.2
  placeField(cols, 130, 136, f.hpMag); // Hpmag  F7.4
  placeField(cols, 153, 158, f.bv); // B−V    F6.3
  return cols.join('');
}

describe('parseHipparcos2', () => {
  it('parses a ReadMe-accurate fixed-width record', () => {
    // RArad = 1.5 rad → 1.5 · 180/π = 85.94366926962348°
    // DErad = -0.5 rad → -0.5 · 180/π = -28.64788975654116°
    // Plx = 250.00 mas → 1000/250 = 4 pc
    const line = buildRecord({
      hip: '12345',
      raRad: '1.5000000000',
      deRad: '-0.5000000000',
      plxMas: '250.00',
      hpMag: '5.4321',
      bv: '0.650',
    });
    expect(line.length).toBe(RECORD_LEN);

    const { rows, skipped } = parseHipparcos2(line);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.hip).toBe(12345);
    expect(row.raDeg).toBeCloseTo(85.94366926962348, 6);
    expect(row.decDeg).toBeCloseTo(-28.64788975654116, 6);
    expect(row.distPc).toBeCloseTo(4, 10);
    expect(row.hpMag).toBeCloseTo(5.4321, 4);
    expect(row.bv).toBeCloseTo(0.65, 3);
  });

  it('skips a non-positive-parallax row and counts it', () => {
    // A negative measured parallax has no physical distance; the row is
    // dropped and tallied in `skipped`. Every other required field is valid,
    // so this isolates the parallax rule.
    const line = buildRecord({
      hip: '67890',
      raRad: '2.0000000000',
      deRad: '0.3000000000',
      plxMas: '-5.00',
      hpMag: '6.1234',
      bv: '0.420',
    });

    const { rows, skipped } = parseHipparcos2(line);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});
