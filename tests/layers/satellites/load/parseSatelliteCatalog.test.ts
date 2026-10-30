import { describe, expect, it } from 'vitest';
import { parseSatelliteCatalog } from '../../../../src/layers/satellites/load/parseSatelliteCatalog';
import { writeSatelliteCatalog } from '../../../../tools/utils/io/writeSatelliteCatalog';
import type { SatelliteCatalog } from '../../../../src/@types/satellites/SatelliteCatalog';

// Three objects with deliberately awkward values: f64s no f32 could hold, a non-ASCII name, an empty
// COSPAR id. A column read from the wrong offset or a string sliced one off fails exactly here.
const column = (...v: number[]): Float64Array => Float64Array.from(v);
const CATALOG: SatelliteCatalog = {
  fetchedAtMs: 1_793_072_744_572.896,
  noradId: Uint32Array.from([5, 25544, 339_999]),
  classCode: Uint8Array.from([2, 0, 1]),
  epochMs: column(1_793_072_744_572.896, 1_793_000_000_000.001, 0.5),
  meanMotion: column(15.49, 13.7674406, 1.0027),
  eccentricity: column(0.0005, 0.00248374, 0.7),
  inclinationDeg: column(51.6416, 90.222, 63.4),
  raanDeg: column(1e-9, 74.828, 359.999999),
  argPericenterDeg: column(1 / 3, 250.5973, 270),
  meanAnomalyDeg: column(Math.PI, 164.285, 0),
  bstar: column(-1.234e-5, 0.0004452936, 0),
  meanMotionDot: column(4.47e-6, 0, -1e-8),
  meanMotionDdot: column(0, 1e-12, 0),
  names: ['VANGUARD 1', 'ISS (ZARYA)', 'ДЕБРИС ✦'],
  cosparIds: ['1958-002B', '1998-067A', ''],
};

const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe('parseSatelliteCatalog', () => {
  it('reads back every column and string writeSatelliteCatalog wrote, bit for bit', () => {
    expect(parseSatelliteCatalog(bufferOf(writeSatelliteCatalog(CATALOG)))).toEqual(CATALOG);
  });

  it('rejects a buffer that is not a satellite catalog', () => {
    const bytes = writeSatelliteCatalog(CATALOG);
    bytes[0] = 0x58;
    expect(() => parseSatelliteCatalog(bufferOf(bytes))).toThrow(/bad magic/);
  });

  it('rejects another format version with the command that regenerates it', () => {
    const bytes = writeSatelliteCatalog(CATALOG);
    new DataView(bytes.buffer).setUint32(4, 2, true);
    expect(() => parseSatelliteCatalog(bufferOf(bytes))).toThrow(/npm run build-satellites/);
  });

  it('rejects a truncated download instead of reading past its end', () => {
    const bytes = writeSatelliteCatalog(CATALOG);
    expect(() => parseSatelliteCatalog(bufferOf(bytes.subarray(0, bytes.length - 3)))).toThrow(
      /truncated/,
    );
  });
});
