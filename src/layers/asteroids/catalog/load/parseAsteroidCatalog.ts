/**
 * parseAsteroidCatalog — read `asteroids.astb` (layout in `ASTEROID_FORMAT`) and expand the ecliptic
 * angles into the equatorial Kepler basis the GPU solves in. A and B are built in f64 from the decoded
 * f32 angles, then narrowed once, so the CPU mirror and the GPU start from identical numbers.
 */
import type { AsteroidCatalog } from '../@types/AsteroidCatalog';
import { ASTEROID_FORMAT as F } from '../../../../data/asteroids/asteroidFormat';
import { GAUSS_K_RAD_PER_DAY } from '../../../../data/asteroids/gaussKRadPerDay';
import { FormatVersionError } from '../../../../data/formatVersionError';
import { perifocalAxesWorld } from '../../../../utils/orbit/perifocalAxesWorld';
import { ASTEROID_HIDDEN_FLAG } from '../data/asteroidHiddenFlag';
import { MESH_ASTEROID_NUMBERS } from '../data/meshAsteroidNumbers';
import { sortedHCentiByClass } from '../utils/sortedHCentiByClass';

const TAU = 2 * Math.PI;
const COLUMN = { a: 0, e: 1, i: 2, node: 3, peri: 4, m0: 5, h: 6, g: 7, flags: 8 } as const;

export function parseAsteroidCatalog(buf: ArrayBuffer): AsteroidCatalog {
  const view = new DataView(buf);
  const need = (end: number): void => {
    if (end > buf.byteLength) throw new Error('parseAsteroidCatalog: truncated');
  };
  need(F.headerBytes + F.directoryEntryBytes * F.columns.length);
  if (view.getUint32(0, true) !== F.magic) {
    const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
    throw new Error(`parseAsteroidCatalog: bad magic "${magic}"`);
  }
  const version = view.getUint16(4, true);
  if (version !== F.version) {
    throw new FormatVersionError(
      'asteroid catalog',
      version,
      F.version,
      `parseAsteroidCatalog: unsupported version ${version}, regenerate with "npm run build-asteroids"`,
    );
  }
  const count = view.getUint32(8, true);
  const epochJd = view.getFloat64(16, true);
  const offsets = F.columns.map((column, id) => {
    const entry = F.headerBytes + F.directoryEntryBytes * id;
    if (view.getUint16(entry, true) !== id) throw new Error(`parseAsteroidCatalog: column ${id}`);
    const offset = view.getUint32(entry + 4, true);
    need(offset + column.bytes * count);
    return offset;
  });

  const bytes = new Uint8Array(buf);
  const u24 = (column: number, k: number): number => {
    const at = offsets[column]! + 3 * k;
    return bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
  };
  const a = new Float32Array(buf.slice(offsets[COLUMN.a]!, offsets[COLUMN.a]! + 4 * count));
  const i = new Float32Array(count);
  const m0 = new Float32Array(count);
  const hCenti = new Uint16Array(buf.slice(offsets[COLUMN.h]!, offsets[COLUMN.h]! + 2 * count));
  const g = bytes.slice(offsets[COLUMN.g]!, offsets[COLUMN.g]! + count);
  const flags = bytes.slice(offsets[COLUMN.flags]!, offsets[COLUMN.flags]! + count);
  const elementsA = new Float32Array(4 * count);
  const elementsB = new Float32Array(4 * count);
  const extra = new Uint32Array(2 * count);
  const extraF32 = new Float32Array(extra.buffer);

  for (const number of MESH_ASTEROID_NUMBERS) {
    const k = number - F.firstNumber;
    if (k < count) flags[k]! |= ASTEROID_HIDDEN_FLAG;
  }
  for (let k = 0; k < count; k++) {
    if (flags[k]! & F.flagAbsent) flags[k]! |= ASTEROID_HIDDEN_FLAG;
    i[k] = (u24(COLUMN.i, k) / F.u24Steps) * TAU;
    m0[k] = (u24(COLUMN.m0, k) / F.u24Steps) * TAU;

    const ak = a[k]!;
    const ek = Math.fround(u24(COLUMN.e, k) / F.u24Steps);
    const { pWorld, qWorld } = perifocalAxesWorld({
      inclinationRad: i[k]!,
      ascendingNodeRad: Math.fround((u24(COLUMN.node, k) / F.u24Steps) * TAU),
      argPeriapsisRad: Math.fround((u24(COLUMN.peri, k) / F.u24Steps) * TAU),
    });
    const b = ak * Math.sqrt(1 - ek * ek);
    elementsA.set([ak * pWorld[0], ak * pWorld[1], ak * pWorld[2], ek], 4 * k);
    // An ABSENT row has a = 0; n = 0 keeps its M finite in the compute pass, which runs every row.
    const n = ak > 0 ? GAUSS_K_RAD_PER_DAY * ak ** -1.5 : 0;
    elementsB.set([b * qWorld[0], b * qWorld[1], b * qWorld[2], n], 4 * k);
    extraF32[2 * k] = m0[k]!;
    extra[2 * k + 1] = ((hCenti[k]! << 16) | (g[k]! << 8) | flags[k]!) >>> 0;
  }
  const hCentiByClass = sortedHCentiByClass(hCenti, flags);
  return {
    epochJd,
    count,
    a,
    i,
    m0,
    elementsA,
    elementsB,
    extra,
    hCenti,
    g,
    flags,
    hCentiByClass,
  };
}
