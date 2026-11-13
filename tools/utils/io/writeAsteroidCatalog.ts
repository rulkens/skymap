/**
 * writeAsteroidCatalog — serialise numbered MPCORB rows to the `asteroids.astb` layout of
 * `ASTEROID_FORMAT`. Rows must be in ascending number order and share `epochJd` (propagate first).
 * A number missing upstream, or a row with no class (left out of the Layer), gets an ABSENT placeholder
 * row, so row k is always number k + 1; more than `MAX_GAPS` holes means the parse is wrong, not that
 * MPC dropped them, so it throws. `defaultedG`
 * names the rows whose G the format cannot hold; they are written with MPC's default slope.
 */
import type { MpcorbRow } from '../../@types/asteroids/MpcorbRow';
import { ASTEROID_CLASSES } from '../../../src/data/asteroids/asteroidClasses';
import { ASTEROID_FORMAT as F } from '../../../src/data/asteroids/asteroidFormat';

const MAX_GAPS = 100;
const COLUMN = { a: 0, e: 1, i: 2, node: 3, peri: 4, m0: 5, h: 6, g: 7, flags: 8 } as const;

const align4 = (n: number): number => Math.ceil(n / 4) * 4;
const turns24 = (deg: number): number => {
  const v = Math.round((deg / 360) * F.u24Steps) % F.u24Steps;
  return v < 0 ? v + F.u24Steps : v;
};

function quantize(value: number, offset: number, scale: number, max: number, what: string): number {
  const q = Math.round((value + offset) * scale);
  if (!(q >= 0 && q < max)) throw new Error(`writeAsteroidCatalog: ${what} ${value} out of range`);
  return q;
}

function setU24(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >> 8) & 0xff;
  bytes[at + 2] = value >> 16;
}

export function writeAsteroidCatalog(
  rows: readonly MpcorbRow[],
  epochJd: number,
): { bytes: Uint8Array; gaps: number[]; defaultedG: number[] } {
  const n = rows.length === 0 ? 0 : rows[rows.length - 1]!.number - F.firstNumber + 1;
  const gaps: number[] = [];
  const defaultedG: number[] = [];
  let expected = F.firstNumber;
  for (const row of rows) {
    if (row.number < expected)
      throw new Error(`writeAsteroidCatalog: (${row.number}) out of order`);
    while (expected < row.number) gaps.push(expected++);
    expected++;
  }
  if (gaps.length > MAX_GAPS) {
    throw new Error(`writeAsteroidCatalog: ${gaps.length} gaps in the numbering (max ${MAX_GAPS})`);
  }

  const offsets: number[] = [];
  let cursor = F.headerBytes + F.directoryEntryBytes * F.columns.length;
  for (const { bytes } of F.columns) {
    cursor = align4(cursor);
    offsets.push(cursor);
    cursor += bytes * n;
  }
  const bytes = new Uint8Array(align4(cursor));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, F.magic, true);
  view.setUint16(4, F.version, true);
  view.setUint16(6, F.columns.length, true);
  view.setUint32(8, n, true);
  view.setUint32(12, F.firstNumber, true);
  view.setFloat64(16, epochJd, true);
  offsets.forEach((offset, id) => {
    view.setUint16(F.headerBytes + F.directoryEntryBytes * id, id, true);
    view.setUint32(F.headerBytes + F.directoryEntryBytes * id + 4, offset, true);
  });
  const at = (column: number, k: number): number => offsets[column]! + F.columns[column]!.bytes * k;

  const writeAbsent = (number: number): void => {
    const k = number - F.firstNumber;
    view.setUint16(at(COLUMN.h, k), F.hNone, true);
    bytes[at(COLUMN.flags, k)] = F.flagAbsent;
  };
  gaps.forEach(writeAbsent);
  for (const row of rows) {
    const k = row.number - F.firstNumber;
    if (row.asteroidClass === null) {
      writeAbsent(row.number);
      continue;
    }
    if (row.epochJd !== epochJd) {
      throw new Error(`writeAsteroidCatalog: (${row.number}) is not at epoch ${epochJd}`);
    }
    // e that rounds up to 2^24 would wrap to a circle, so the bound is on the stored value.
    const e = Math.round(row.e * F.u24Steps);
    if (!(e >= 0 && e < F.u24Steps))
      throw new Error(`writeAsteroidCatalog: (${row.number}) e = ${row.e}`);
    if (!(row.aAu > 0)) throw new Error(`writeAsteroidCatalog: (${row.number}) a = ${row.aAu}`);
    view.setFloat32(at(COLUMN.a, k), row.aAu, true);
    setU24(bytes, at(COLUMN.e, k), e);
    setU24(bytes, at(COLUMN.i, k), turns24(row.inclDeg));
    setU24(bytes, at(COLUMN.node, k), turns24(row.nodeDeg));
    setU24(bytes, at(COLUMN.peri, k), turns24(row.argPeriDeg));
    setU24(bytes, at(COLUMN.m0, k), turns24(row.meanAnomalyDeg));
    const h = row.h === null ? F.hNone : quantize(row.h, F.hOffset, F.hScale, F.hNone, 'H');
    view.setUint16(at(COLUMN.h, k), h, true);
    // A G the u8 cannot hold (one row on 2026-11-12, G = 6.66) is no HG slope at all: use MPC's default.
    const gFits = row.g !== null && row.g >= -F.gOffset && row.g <= 0xff / F.gScale - F.gOffset;
    if (row.g !== null && !gFits) defaultedG.push(row.number);
    bytes[at(COLUMN.g, k)] = Math.round(((gFits ? row.g! : F.gDefault) + F.gOffset) * F.gScale);
    bytes[at(COLUMN.flags, k)] =
      ASTEROID_CLASSES.indexOf(row.asteroidClass) |
      (row.neo ? F.flagNeo : 0) |
      (row.pha ? F.flagPha : 0);
  }
  return { bytes, gaps, defaultedG };
}
