/**
 * Binary on-disk format for a `GalaxyCatalog` — version 9.
 *
 * 16-byte header (magic/version/count/reserved) + one `BYTES_PER_GALAXY`
 * (64-byte) record per galaxy. `GALAXY_CATALOG_FIELD_SPECS` below is the
 * single declaration of the per-field element type and on-disk offset —
 * see `GalaxyCatalogFieldSpec`. v8-and-earlier files are rejected via the
 * version header; the fix is "regenerate via `npm run build-tiers`".
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogColumn } from '../../@types/data/galaxyCatalog/GalaxyCatalogColumn';
import type { GalaxyCatalogFieldSpec } from '../../@types/data/galaxyCatalog/GalaxyCatalogFieldSpec';
import { galaxyMedianAbsMag } from '../../utils/galaxy/galaxyMedianAbsMag';
import { FormatVersionError } from '../formatVersionError';

const MAGIC = 0x504d4b53;
const VERSION = 9;
const HEADER_BYTES = 16;
const BYTES_PER_GALAXY = 64;
// Bit 2 of the flags byte ("mass is estimated") has no backing column: every
// v9 mass is a photometric estimate, so the encoder derives it from
// `Number.isFinite(log10StellarMass[i])` instead. When measured masses land
// this becomes a real `flagBit` column and this constant goes away.
const MASS_ESTIMATED_BIT = 1 << 2;
// Byte 54 is a property of the 64-byte record layout (the flagBit column
// above), not derived from which flagBit specs happen to be in the table —
// it must stay correct even if every flagBit entry were removed, since it
// also positions the column-less MASS_ESTIMATED_BIT write below.
const FLAGS_BYTE_OFFSET = 54;

// Version-stamped folder: max-age=86400 lets a CDN serve an old .bin
// alongside new code for up to a day, so the epoch has to live in the
// path itself to make that pairing impossible (images/earth-tiles/'s
// TILE_PREFIX precedent).
export const GALAXY_CATALOG_DATA_PREFIX = `galaxy-catalog/v${VERSION}`;

export const GALAXY_CATALOG_FIELD_SPECS = {
  /** SDSS object id — full 64-bit precision (exceeds Number.MAX_SAFE_INTEGER). */
  objIDs: { column: 'u64', components: 1, disk: { kind: 'field', offset: 0 } },
  /** Interleaved xyz, Mpc. */
  positions: { column: 'f32', components: 3, disk: { kind: 'field', offset: 8 } },
  /** SDSS u-band model magnitude. */
  magU: { column: 'f32', components: 1, disk: { kind: 'field', offset: 20 } },
  /** SDSS g-band model magnitude — the renderer's primary brightness input. */
  magG: { column: 'f32', components: 1, disk: { kind: 'field', offset: 24 } },
  /** SDSS r-band model magnitude. */
  magR: { column: 'f32', components: 1, disk: { kind: 'field', offset: 28 } },
  /** SDSS i-band model magnitude. */
  magI: { column: 'f32', components: 1, disk: { kind: 'field', offset: 32 } },
  /** SDSS z-band model magnitude. */
  magZ: { column: 'f32', components: 1, disk: { kind: 'field', offset: 36 } },
  /** Minor/major axis ratio b/a in [0,1]; NaN = no measurement. */
  axisRatio: { column: 'f32', components: 1, disk: { kind: 'field', offset: 40 } },
  /** Position angle, degrees east of north, [0,180); NaN = no measurement. */
  positionAngleDeg: { column: 'f32', components: 1, disk: { kind: 'field', offset: 44 } },
  /** Physical diameter, kpc; DEFAULT_GALAXY_DIAMETER_KPC=30 when unmeasured. */
  diameterKpc: { column: 'f32', components: 1, disk: { kind: 'field', offset: 48 } },
  /** Source-interpreted classification byte (e.g. Milliquas AGN class letter). */
  classByte: { column: 'u8', components: 1, disk: { kind: 'field', offset: 52 } },
  /** Milliquas parent-survey enum byte; 0 ("no prefix") for every other source. */
  parentSurveyByte: { column: 'u8', components: 1, disk: { kind: 'field', offset: 53 } },
  /**
   * 1 = (axisRatio, positionAngleDeg) is `fallbackOrientation`'s deterministic
   * hash, stamped by `recordsToCloud` at build time — persisted rather than
   * reconstructed because re-hashing from the f32-rounded position on load
   * misclassified ~10% of rows (see git history for the derivation).
   */
  orientationIsFallback: {
    column: 'u8',
    components: 1,
    disk: { kind: 'flagBit', offset: 54, bit: 0 },
  },
  /**
   * 1 = `diameterKpc` is the flat 30-kpc fallback (no measured or angular
   * size), stamped by `recordsToCloud` at build time — persisted because
   * `diameterKpc === 30` can't tell a fallback from a real 30-kpc galaxy.
   */
  diameterIsFallback: {
    column: 'u8',
    components: 1,
    disk: { kind: 'flagBit', offset: 54, bit: 1 },
  },
  // Byte 55 is reserved/zeroed padding — no column claims it.
  /** Catalogued spectroscopic z; may be negative (peculiar-velocity blueshift). */
  spectroscopicZ: { column: 'f32', components: 1, disk: { kind: 'field', offset: 56 } },
  /**
   * log₁₀(M★/M☉) photometric estimate; NaN = no estimate. Bit 2 of the flags
   * byte ("mass is estimated") is derived from this field's finiteness at
   * encode time rather than stored as its own column — see
   * `MASS_ESTIMATED_BIT` — because every v9 mass is photometric. A future
   * measured-mass source turns bit 2 into a real `flagBit` column here.
   */
  log10StellarMass: { column: 'f32', components: 1, disk: { kind: 'field', offset: 60 } },
} as const satisfies Readonly<Record<GalaxyCatalogColumn, GalaxyCatalogFieldSpec>>;

type AlignedFloatSlot = {
  column: GalaxyCatalogColumn;
  floatSlot: number;
  stride: number;
  componentOffset: number;
};
type OffsetField = { column: GalaxyCatalogColumn; offset: number };
type FlagBitField = { column: GalaxyCatalogColumn; bit: number };

// Partitioned once at module load (not per call, and never per record) from
// the static table above. A record's byte base is always 4-aligned (both
// HEADER_BYTES and BYTES_PER_GALAXY are multiples of 4), so every f32 field
// is reachable through the shared Float32Array overlay — v9 has no field
// left at a non-4-aligned offset, so UNALIGNED_FLOATS is always empty; kept
// so a future unaligned field doesn't need this partitioning rebuilt.
const ALIGNED_FLOAT_SLOTS: AlignedFloatSlot[] = [];
const UNALIGNED_FLOATS: OffsetField[] = [];
const BYTE_FIELDS: OffsetField[] = [];
const U64_FIELDS: OffsetField[] = [];
const FLAG_FIELDS: FlagBitField[] = [];

for (const column of Object.keys(GALAXY_CATALOG_FIELD_SPECS) as GalaxyCatalogColumn[]) {
  const spec = GALAXY_CATALOG_FIELD_SPECS[column];
  if (spec.disk.kind === 'flagBit') {
    if (spec.disk.offset !== FLAGS_BYTE_OFFSET) {
      throw new Error(`${column}: flagBit offset must be FLAGS_BYTE_OFFSET (${FLAGS_BYTE_OFFSET})`);
    }
    FLAG_FIELDS.push({ column, bit: spec.disk.bit });
    continue;
  }
  const { offset } = spec.disk;
  if (spec.column === 'u64') {
    U64_FIELDS.push({ column, offset });
  } else if (spec.column === 'u8') {
    BYTE_FIELDS.push({ column, offset });
  } else if (offset % 4 === 0) {
    for (let c = 0; c < spec.components; c++) {
      ALIGNED_FLOAT_SLOTS.push({
        column,
        floatSlot: offset / 4 + c,
        stride: spec.components,
        componentOffset: c,
      });
    }
  } else {
    UNALIGNED_FLOATS.push({ column, offset });
  }
}

export function encodeGalaxyCatalog(catalog: GalaxyCatalog): ArrayBuffer {
  const { count } = catalog;

  for (const column of Object.keys(GALAXY_CATALOG_FIELD_SPECS) as GalaxyCatalogColumn[]) {
    const spec = GALAXY_CATALOG_FIELD_SPECS[column];
    const values = catalog[column] as { length: number };
    if (values.length !== count * spec.components) {
      throw new Error(`${column} length mismatch`);
    }
  }

  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_GALAXY);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  // Bound once per call (one entry per column, not per record) — the hot
  // loop below only ever indexes these prepared lists, never the spec table.
  const u64Fields = U64_FIELDS.map((f) => ({
    offset: f.offset,
    array: catalog[f.column] as BigUint64Array,
  }));
  const alignedFloats = ALIGNED_FLOAT_SLOTS.map((f) => ({
    ...f,
    array: catalog[f.column] as Float32Array,
  }));
  const unalignedFloats = UNALIGNED_FLOATS.map((f) => ({
    offset: f.offset,
    array: catalog[f.column] as Float32Array,
  }));
  const byteFields = BYTE_FIELDS.map((f) => ({
    offset: f.offset,
    array: catalog[f.column] as Uint8Array,
  }));
  const flagFields = FLAG_FIELDS.map((f) => ({
    bit: f.bit,
    array: catalog[f.column] as Uint8Array,
  }));
  const massValues = catalog.log10StellarMass;

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;
    const floatBase = byteBase / 4;

    for (let k = 0; k < u64Fields.length; k++) {
      const f = u64Fields[k]!;
      dv.setBigUint64(byteBase + f.offset, f.array[i]!, true);
    }
    for (let k = 0; k < alignedFloats.length; k++) {
      const f = alignedFloats[k]!;
      floatView[floatBase + f.floatSlot] = f.array[i * f.stride + f.componentOffset]!;
    }
    for (let k = 0; k < unalignedFloats.length; k++) {
      const f = unalignedFloats[k]!;
      dv.setFloat32(byteBase + f.offset, f.array[i]!, true);
    }
    for (let k = 0; k < byteFields.length; k++) {
      const f = byteFields[k]!;
      byteView[byteBase + f.offset] = f.array[i]!;
    }
    // One byte write per record: OR every provenance bit together, plus the
    // derived (not column-backed) mass-is-estimated bit.
    let flagsByte = Number.isFinite(massValues[i]) ? MASS_ESTIMATED_BIT : 0;
    for (let k = 0; k < flagFields.length; k++) {
      const f = flagFields[k]!;
      if (f.array[i]) flagsByte |= 1 << f.bit;
    }
    byteView[byteBase + FLAGS_BYTE_OFFSET] = flagsByte;
    // Byte 55 (reserved) and the tail beyond BYTES_PER_GALAXY stay zero —
    // ArrayBuffer zero-inits and no spec claims those bytes.
  }
  return buf;
}

function allocateColumn(
  spec: GalaxyCatalogFieldSpec,
  count: number,
): BigUint64Array | Float32Array | Uint8Array {
  const length = count * spec.components;
  if (spec.column === 'u64') return new BigUint64Array(length);
  if (spec.column === 'u8') return new Uint8Array(length);
  return new Float32Array(length);
}

export function decodeGalaxyCatalog(buf: ArrayBuffer): GalaxyCatalog {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');

  // Mismatch surfaces as the documented "regenerate" error. Stale .bin files
  // (last built before this format version landed) trigger this on every
  // reload until `npm run build-tiers` is re-run.
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new FormatVersionError(
      'galaxy catalog',
      version,
      VERSION,
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-tiers"`,
    );
  }

  const count = dv.getUint32(8, true);

  const columns: Partial<Record<GalaxyCatalogColumn, BigUint64Array | Float32Array | Uint8Array>> =
    {};
  for (const column of Object.keys(GALAXY_CATALOG_FIELD_SPECS) as GalaxyCatalogColumn[]) {
    columns[column] = allocateColumn(GALAXY_CATALOG_FIELD_SPECS[column], count);
  }

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  const u64Fields = U64_FIELDS.map((f) => ({
    offset: f.offset,
    array: columns[f.column] as BigUint64Array,
  }));
  const alignedFloats = ALIGNED_FLOAT_SLOTS.map((f) => ({
    ...f,
    array: columns[f.column] as Float32Array,
  }));
  const unalignedFloats = UNALIGNED_FLOATS.map((f) => ({
    offset: f.offset,
    array: columns[f.column] as Float32Array,
  }));
  const byteFields = BYTE_FIELDS.map((f) => ({
    offset: f.offset,
    array: columns[f.column] as Uint8Array,
  }));
  const flagFields = FLAG_FIELDS.map((f) => ({
    bit: f.bit,
    array: columns[f.column] as Uint8Array,
  }));

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;
    const floatBase = byteBase / 4;

    for (let k = 0; k < u64Fields.length; k++) {
      const f = u64Fields[k]!;
      f.array[i] = dv.getBigUint64(byteBase + f.offset, true);
    }
    for (let k = 0; k < alignedFloats.length; k++) {
      const f = alignedFloats[k]!;
      f.array[i * f.stride + f.componentOffset] = floatView[floatBase + f.floatSlot]!;
    }
    for (let k = 0; k < unalignedFloats.length; k++) {
      const f = unalignedFloats[k]!;
      f.array[i] = dv.getFloat32(byteBase + f.offset, true);
    }
    for (let k = 0; k < byteFields.length; k++) {
      const f = byteFields[k]!;
      f.array[i] = byteView[byteBase + f.offset]!;
    }
    // Bit 2 (mass-is-estimated) is intentionally not read back here — mass
    // presence already round-trips via the NaN sentinel on log10StellarMass.
    const flagsByte = byteView[byteBase + FLAGS_BYTE_OFFSET]!;
    for (let k = 0; k < flagFields.length; k++) {
      const f = flagFields[k]!;
      f.array[i] = (flagsByte >> f.bit) & 1;
    }
  }

  // Every key of `columns` was populated above from the same column list
  // GALAXY_CATALOG_FIELD_SPECS is `satisfies`-checked against, so the shape
  // matches GalaxyCatalog exactly; TS can't see that through the loop above.
  const catalog = { count, ...columns } as unknown as GalaxyCatalog;
  // Derived, not stored on disk — recomputed here (rather than encoded) so
  // adding this field never bumps the binary format version. Computed AFTER
  // the object above so the helper sees the finished typed arrays.
  catalog.medianAbsMag = galaxyMedianAbsMag(catalog);
  return catalog;
}

export function emptyGalaxyCatalog(): GalaxyCatalog {
  const columns: Partial<Record<GalaxyCatalogColumn, BigUint64Array | Float32Array | Uint8Array>> =
    {};
  for (const column of Object.keys(GALAXY_CATALOG_FIELD_SPECS) as GalaxyCatalogColumn[]) {
    columns[column] = allocateColumn(GALAXY_CATALOG_FIELD_SPECS[column], 0);
  }
  return {
    count: 0,
    ...columns,
    medianAbsMag: -20.5, // count-0 fallback — same sentinel galaxyMedianAbsMag returns for count===0.
  } as unknown as GalaxyCatalog;
}
