import { describe, expect, it } from 'vitest';

import type { MpcorbRow } from '../../../../tools/@types/asteroids/MpcorbRow';
import { writeAsteroidCatalog } from '../../../../tools/utils/io/writeAsteroidCatalog';
import { ASTEROID_CLASSES } from '../../../../src/data/asteroids/asteroidClasses';
import { ASTEROID_FORMAT as F } from '../../../../src/data/asteroids/asteroidFormat';

const EPOCH = 2461200.5;
const row = (number: number, over: Partial<MpcorbRow> = {}): MpcorbRow => ({
  number,
  h: 3.34,
  g: 0.15,
  epochJd: EPOCH,
  meanAnomalyDeg: 274.41935,
  argPeriDeg: 73.2942,
  nodeDeg: 80.24863,
  inclDeg: 10.58803,
  e: 0.0796923,
  aAu: 2.7655526,
  asteroidClass: 'jupiterTrojan',
  name: null,
  ...over,
});

/** The decoder in miniature: column k of row r, read through the header's directory. */
function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = (id: number) =>
    view.getUint32(F.headerBytes + F.directoryEntryBytes * id + 4, true);
  const u24 = (id: number, r: number) => {
    const at = offset(id) + 3 * r;
    return bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
  };
  return {
    count: view.getUint32(8, true),
    epochJd: view.getFloat64(16, true),
    a: (r: number) => view.getFloat32(offset(0) + 4 * r, true),
    e: (r: number) => u24(1, r) / F.u24Steps,
    turns: (id: number, r: number) => u24(id, r) / F.u24Steps,
    h: (r: number) => view.getUint16(offset(6) + 2 * r, true),
    g: (r: number) => bytes[offset(7) + r]!,
    flags: (r: number) => bytes[offset(8) + r]!,
  };
}

describe('writeAsteroidCatalog', () => {
  it('writer round-trips one row within one quantization step', () => {
    const input = row(1);
    const { bytes } = writeAsteroidCatalog([input], EPOCH);
    const read = reader(bytes);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(F.magic);
    expect([read.count, read.epochJd]).toEqual([1, EPOCH]);
    expect(read.a(0)).toBe(Math.fround(input.aAu));
    const step = 1 / F.u24Steps;
    expect(Math.abs(read.e(0) - input.e)).toBeLessThanOrEqual(step / 2);
    const angles = [input.inclDeg, input.nodeDeg, input.argPeriDeg, input.meanAnomalyDeg];
    angles.forEach((deg, k) => {
      expect(Math.abs(read.turns(2 + k, 0) - deg / 360), `column ${2 + k}`).toBeLessThanOrEqual(
        step / 2,
      );
    });
    expect(read.h(0) / F.hScale - F.hOffset).toBeCloseTo(input.h!, 6);
    expect(read.g(0) / F.gScale - F.gOffset).toBeCloseTo(input.g!, 6);
    expect(read.flags(0)).toBe(ASTEROID_CLASSES.indexOf('jupiterTrojan'));
  });

  it('a gap in numbering writes an ABSENT row and keeps row k = number k + 1', () => {
    const { bytes, gaps } = writeAsteroidCatalog([row(1), row(2), row(4, { aAu: 5.2 })], EPOCH);
    const read = reader(bytes);
    expect(gaps).toEqual([3]);
    expect(read.count).toBe(4);
    expect(read.flags(2)).toBe(F.flagAbsent);
    expect(read.h(2)).toBe(F.hNone);
    expect(read.flags(3) & F.flagAbsent).toBe(0);
    expect(read.a(3)).toBe(Math.fround(5.2));
  });

  it('a row with no class is written ABSENT, not as a gap', () => {
    const { bytes, gaps } = writeAsteroidCatalog([row(1), row(2, { asteroidClass: null })], EPOCH);
    const read = reader(bytes);
    expect(gaps).toEqual([]);
    expect(read.count).toBe(2);
    expect(read.flags(1)).toBe(F.flagAbsent);
    expect(read.h(1)).toBe(F.hNone);
  });

  it('throws on e >= 1, on more than 100 gaps and on a row off the shared epoch', () => {
    expect(() => writeAsteroidCatalog([row(1, { e: 1 })], EPOCH)).toThrow(/e = 1/);
    expect(() => writeAsteroidCatalog([row(1, { e: 0.99999999 })], EPOCH)).toThrow();
    expect(() => writeAsteroidCatalog([row(1), row(103)], EPOCH)).toThrow(/101 gaps/);
    expect(() => writeAsteroidCatalog([row(1, { epochJd: EPOCH + 1 })], EPOCH)).toThrow(/epoch/);
  });

  it('blank H writes 0xFFFF; a blank G, or one the u8 cannot hold, the MPC default', () => {
    const { bytes, defaultedG } = writeAsteroidCatalog(
      [row(1, { h: null, g: null }), row(2, { g: 6.66 })],
      EPOCH,
    );
    const read = reader(bytes);
    expect(read.h(0)).toBe(0xffff);
    expect(read.g(0) / F.gScale - F.gOffset).toBeCloseTo(F.gDefault, 6);
    expect(read.g(1) / F.gScale - F.gOffset).toBeCloseTo(F.gDefault, 6);
    expect(defaultedG).toEqual([2]);
  });
});
