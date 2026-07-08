/**
 * Minimal FITS binary-table (BINTABLE) header parser.
 *
 * FITS ("Flexible Image Transport System") is the file format the whole
 * astronomy world standardised on decades ago, and DESI's Large Scale
 * Structure catalogs — the deep-cone QSO/LRG/ELG clustering files this
 * parser exists to read — ship as FITS binary tables. The format is
 * simple enough on the wire that hand-rolling the ~100 lines needed to
 * read our subset beats pulling in a general-purpose FITS dependency
 * (the popular ones drag in WCS, image compression, and variable-length
 * array support we will never touch, just to read a flat table of
 * doubles and int64s):
 *
 *   - The file is a sequence of "Header/Data Units" (HDUs). Every HDU
 *     starts with a header made of 80-character ASCII "cards", packed
 *     36-to-a-block into fixed 2880-byte blocks (2880 = 36 × 80 — chosen
 *     in the 1970s to divide evenly into contemporary tape block sizes,
 *     and never revisited since). A header ends at a card whose keyword
 *     is `END`; the rest of that final block is blank-padded so headers
 *     always occupy a whole number of 2880-byte blocks.
 *   - Each card is `KEYWORD = value / comment` in fixed columns: bytes
 *     1-8 are the keyword, byte 9 is `=`, byte 10 is a space, and bytes
 *     11-80 hold the value (quoted for strings) optionally followed by
 *     `/ comment`. `COMMENT`/`HISTORY`/blank-keyword cards carry no `=`
 *     and are skipped.
 *   - The primary HDU (the first one, starting at byte 0) describes the
 *     primary array — for the LSS clustering files it's always an empty
 *     `NAXIS = 0` placeholder, with the actual table living in the next
 *     HDU. We still compute its data size generically (rather than
 *     assuming zero) so a future FITS input with a non-empty primary
 *     array doesn't silently misalign the extension header scan.
 *   - The extension HDU we care about has `XTENSION = 'BINTABLE'` and
 *     describes a row-major table: `NAXIS1` is the row length in bytes,
 *     `NAXIS2` is the row count, `TFIELDS` is the column count, and each
 *     column `n` (1-based) has a `TTYPEn` (name) and `TFORMn` (type
 *     code, e.g. `D` for f64, `K` for i64, `1A` for a 1-byte ASCII
 *     char, optionally prefixed with a repeat count). Column data is
 *     laid out contiguously within each row in `TTYPEn` order — this
 *     module computes each column's `byteOffset`/`byteLength` from that
 *     layout so a caller can slice rows without re-deriving it.
 *   - All FITS binary data (the actual row bytes, decoded by
 *     `parseDesiClustering` below) is big-endian ("network byte
 *     order"), the opposite of the little-endian convention used
 *     everywhere else in this codebase's binary formats
 *     (`galaxyCatalogFormat.ts`, `scalarFieldFormat.ts`). Header
 *     *cards* are plain ASCII text, so endianness doesn't apply to
 *     anything parsed by the header half of this file.
 *
 * Reference: NOST 100-2.0, "Definition of the Flexible Image Transport
 * System (FITS)".
 */

import type { ParsedRecord } from './common';
import { Source } from '../../src/data/sources';
import { DESI_TRACER_CLASS } from '../../src/data/galaxyCatalog/sourceClass';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc';
import { DESI_TRACER_DISPLAY } from './desiTracerDisplay';

const BLOCK_SIZE = 2880;
const CARD_SIZE = 80;
const CARDS_PER_BLOCK = BLOCK_SIZE / CARD_SIZE; // 36

const asciiDecoder = new TextDecoder('ascii');

export type FitsColumn = {
  /** TTYPEn, verbatim (e.g. 'TARGETID', 'RA'). */
  name: string;
  /** TFORMn, verbatim (e.g. 'D', 'E', 'K', '8A', '2K'). */
  form: string;
  /** Byte offset of this column within a row. */
  byteOffset: number;
  /** Byte length of this column within a row. */
  byteLength: number;
};

export type FitsBinTable = {
  /** Absolute byte offset of the first data row within the buffer. */
  dataOffset: number;
  /** NAXIS1 of the BINTABLE extension — bytes per row. */
  rowLengthBytes: number;
  /** NAXIS2 of the BINTABLE extension — number of rows. */
  rowCount: number;
  /** TFIELDS entries, in TTYPEn/TFORMn order. */
  columns: readonly FitsColumn[];
};

/** Header cards for one HDU: keyword → raw value text (unquoted, trimmed). */
type HeaderCards = Map<string, string>;

/**
 * Read one HDU's header, starting at `startOffset` (which must be a
 * 2880-byte block boundary). Consumes whole 2880-byte blocks until a
 * card with keyword `END` is found, and returns both the parsed cards
 * and the absolute offset immediately after the header's final block —
 * i.e. where this HDU's data section (or the next HDU) begins.
 */
function readHeader(
  u8: Uint8Array,
  startOffset: number,
  hduLabel: string,
): { cards: HeaderCards; headerEndOffset: number } {
  const cards: HeaderCards = new Map();
  let offset = startOffset;
  for (;;) {
    if (offset + BLOCK_SIZE > u8.length) {
      throw new Error(
        `parseFitsBinTable: ${hduLabel} header runs past the end of the buffer at byte ${offset} (missing END card?)`,
      );
    }
    const blockText = asciiDecoder.decode(u8.subarray(offset, offset + BLOCK_SIZE));
    let foundEnd = false;
    for (let c = 0; c < CARDS_PER_BLOCK; c++) {
      const cardText = blockText.slice(c * CARD_SIZE, (c + 1) * CARD_SIZE);
      const keyword = cardText.slice(0, 8).trim();
      if (keyword === 'END') {
        foundEnd = true;
        break;
      }
      // COMMENT / HISTORY / blank-keyword cards carry no '=' and no
      // parseable value — the fixed-format value indicator lives at
      // column 9 (0-based index 8).
      if (keyword === '' || cardText[8] !== '=') continue;
      cards.set(keyword, parseCardValue(cardText.slice(10)));
    }
    offset += BLOCK_SIZE;
    if (foundEnd) return { cards, headerEndOffset: offset };
  }
}

/**
 * Parse a card's value field (bytes 11-80, i.e. everything after
 * `KEYWORD = `): either a single-quoted string (FITS doubles embedded
 * `''` to escape a literal quote — handled below) or a bare
 * number/logical, terminated by an optional `/ comment`.
 */
function parseCardValue(field: string): string {
  let i = 0;
  while (i < field.length && field[i] === ' ') i++;
  if (field[i] === "'") {
    let j = i + 1;
    let out = '';
    while (j < field.length) {
      if (field[j] === "'") {
        if (field[j + 1] === "'") {
          out += "'";
          j += 2;
          continue;
        }
        break;
      }
      out += field[j];
      j++;
    }
    return out.trimEnd();
  }
  const slashIdx = field.indexOf('/', i);
  const raw = slashIdx === -1 ? field.slice(i) : field.slice(i, slashIdx);
  return raw.trim();
}

/** Look up a required header card, throwing a clear error if it's absent. */
function requireCard(cards: HeaderCards, keyword: string, hduLabel: string): string {
  const value = cards.get(keyword);
  if (value === undefined) {
    throw new Error(`parseFitsBinTable: ${hduLabel} header missing required card "${keyword}"`);
  }
  return value;
}

/**
 * Byte size of the primary HDU's data section, per the FITS standard:
 * `|BITPIX| / 8 × GCOUNT × (PCOUNT + NAXIS1 × NAXIS2 × … × NAXISn)`,
 * or 0 when `NAXIS = 0` (no data at all — the case for every DESI LSS
 * clustering file, where the primary HDU is an empty placeholder and
 * the real table lives in the following BINTABLE extension).
 */
function primaryDataBytes(cards: HeaderCards): number {
  const naxis = Number(requireCard(cards, 'NAXIS', 'primary'));
  if (naxis === 0) return 0;
  const bitpix = Number(requireCard(cards, 'BITPIX', 'primary'));
  let elementCount = 1;
  for (let n = 1; n <= naxis; n++) {
    elementCount *= Number(requireCard(cards, `NAXIS${n}`, 'primary'));
  }
  const gcount = Number(cards.get('GCOUNT') ?? '1');
  const pcount = Number(cards.get('PCOUNT') ?? '0');
  return (Math.abs(bitpix) / 8) * gcount * (pcount + elementCount);
}

/**
 * Byte length of one TFORMn value, given its (optional) leading repeat
 * count and single-letter type code. Only the codes the DESI LSS
 * clustering files actually carry are supported — `D` (f64, 8 bytes),
 * `E` (f32, 4 bytes), `K` (i64, 8 bytes), and `A` (ASCII char, 1 byte
 * each) — any other letter throws, naming both the offending TFORM and
 * the column it belongs to so a future tracer file with an unexpected
 * column type fails loudly instead of silently mis-laying-out every
 * column after it.
 */
function tformByteLength(form: string, columnName: string): number {
  const match = /^(\d*)([A-Z])$/.exec(form);
  if (!match) {
    throw new Error(`parseFitsBinTable: unparseable TFORM "${form}" for column ${columnName}`);
  }
  const repeat = match[1] === '' ? 1 : Number(match[1]);
  // noUncheckedIndexedAccess: both capture groups are defined whenever
  // `match` is non-null, since the regex has no optional groups — the
  // `!` just tells the compiler what the pattern already guarantees.
  const typeCode = match[2]!;
  switch (typeCode) {
    case 'D':
    case 'K':
      return 8 * repeat;
    case 'E':
      return 4 * repeat;
    case 'A':
      return repeat;
    default:
      // Echo the full raw TFORM (repeat prefix included, e.g. '3C'), not
      // just the type letter — matching the unparseable branch above, so
      // the error always quotes the header card verbatim.
      throw new Error(`parseFitsBinTable: unsupported TFORM "${form}" for column ${columnName}`);
  }
}

/**
 * Parse a FITS file down to its first BINTABLE extension's header
 * layout: where the data rows start, how long a row is, how many rows
 * there are, and each column's name/type/byte range within a row.
 *
 * Row *decoding* (turning those byte ranges into numbers, and mapping
 * columns to a `ParsedRecord`) is deliberately out of scope here — see
 * `parseDesiClustering` below.
 */
export function parseFitsBinTable(buf: ArrayBuffer): FitsBinTable {
  const u8 = new Uint8Array(buf);

  const primary = readHeader(u8, 0, 'primary');
  if (!primary.cards.has('SIMPLE')) {
    throw new Error('parseFitsBinTable: not a FITS file (missing SIMPLE card in primary header)');
  }

  const dataBytes = primaryDataBytes(primary.cards);
  const extensionStart = primary.headerEndOffset + Math.ceil(dataBytes / BLOCK_SIZE) * BLOCK_SIZE;
  if (extensionStart >= u8.length) {
    throw new Error(
      'parseFitsBinTable: no BINTABLE extension found (buffer ends after the primary header)',
    );
  }

  const extension = readHeader(u8, extensionStart, 'extension');
  const xtension = extension.cards.get('XTENSION');
  if (xtension !== 'BINTABLE') {
    throw new Error(
      `parseFitsBinTable: no BINTABLE extension found (first extension is XTENSION="${xtension ?? ''}")`,
    );
  }

  const rowLengthBytes = Number(requireCard(extension.cards, 'NAXIS1', 'extension'));
  const rowCount = Number(requireCard(extension.cards, 'NAXIS2', 'extension'));
  const tfields = Number(requireCard(extension.cards, 'TFIELDS', 'extension'));

  const columns: FitsColumn[] = [];
  let byteOffset = 0;
  for (let n = 1; n <= tfields; n++) {
    const name = requireCard(extension.cards, `TTYPE${n}`, 'extension');
    const form = requireCard(extension.cards, `TFORM${n}`, 'extension');
    const byteLength = tformByteLength(form, name);
    columns.push({ name, form, byteOffset, byteLength });
    byteOffset += byteLength;
  }

  return {
    dataOffset: extension.headerEndOffset,
    rowLengthBytes,
    rowCount,
    columns,
  };
}

// ─── Row decoding → ParsedRecord ────────────────────────────────────────────

/**
 * The four DESI DR1 LSS clustering tracers skymap ingests. The short
 * names abbreviate the upstream filenames (BGS = BGS_BRIGHT,
 * ELG = ELG_LOPnotqso); each corresponds to one
 * `<TRACER>_NGC_clustering.dat.fits` file in `data/raw/desi/`.
 */
export type DesiTracer = 'BGS' | 'LRG' | 'ELG' | 'QSO';

/**
 * Decode one scalar floating-point cell, big-endian per the FITS
 * standard. Only bare/`1`-prefixed `D` (f64) and `E` (f32) forms are
 * scalar floats; anything else (an array cell like `2D`, or an
 * integer/char column) throws rather than silently reading garbage —
 * a tracer file that changes a consumed column's type should fail
 * loudly at parse time, not paint wrong magnitudes.
 */
function readFloatCell(view: DataView, byteOffset: number, col: FitsColumn): number {
  if (col.form === 'D' || col.form === '1D') return view.getFloat64(byteOffset, false);
  if (col.form === 'E' || col.form === '1E') return view.getFloat32(byteOffset, false);
  throw new Error(
    `parseDesiClustering: column ${col.name} has TFORM "${col.form}", expected a scalar D or E`,
  );
}

/** Decode one scalar big-endian i64 cell (TFORM `K`) as a bigint. */
function readInt64Cell(view: DataView, byteOffset: number, col: FitsColumn): bigint {
  if (col.form === 'K' || col.form === '1K') return view.getBigInt64(byteOffset, false);
  throw new Error(
    `parseDesiClustering: column ${col.name} has TFORM "${col.form}", expected a scalar K`,
  );
}

/**
 * The optical zero-point of the nanomaggy flux unit: an object with flux
 * 1 nanomaggy has magnitude 22.5 (SDSS/Legacy-Survey convention), so
 * `mag = 22.5 − 2.5·log10(flux_nmgy)`.
 */
const NANOMAGGY_ZEROPOINT_MAG = 22.5;

/**
 * Parse one DESI LSS clustering catalog (a FITS BINTABLE buffer) into
 * canonical `ParsedRecord`s.
 *
 * Column reality differs per tracer (verified 2026-07-07 against the
 * live NGC headers): only BGS carries fluxes — lowercase
 * `flux_g/r/z_dered` (TFORM `E`, nanomaggies) — while LRG/ELG/QSO ship
 * positions + clustering weights only. So BGS magnitudes are computed
 * from real fluxes, and the other three tracers synthesize display
 * magnitudes from the per-population constants in
 * `DESI_TRACER_DISPLAY`: the tracer's characteristic absolute r
 * magnitude pushed to apparent via the ΛCDM distance modulus at the
 * row's redshift, plus a fixed g−r colour. Same magnitude for every
 * row of a tracer at a given z — honest about what the source data
 * contains, rather than fabricating per-object scatter.
 *
 * Decoding discipline: every consumed cell is read strictly via its
 * column's own `byteOffset`/`byteLength` from the header layout —
 * never by assuming the consumed columns are adjacent — so unread
 * columns (clustering weights, `nA` char columns) are offset-skipped
 * for free. Column lookup is case-insensitive because BGS's flux
 * columns are lowercase on disk while everything else is uppercase.
 *
 * The optional `keep(raDeg, decDeg)` predicate is the deep-cone filter:
 * it runs immediately after decoding RA/DEC and before any other cell
 * is decoded or any record allocated, because the CrB cone keeps only
 * ~1% of the NGC rows — the common case per row is "decode 16 bytes,
 * reject". Rejected rows are NOT counted in `skipped`: out-of-cone is
 * scoping, not data quality. `skipped` counts data-quality drops only:
 * rows of any tracer with a non-finite or non-positive redshift (the
 * glade/sdssCsv convention — a safety net, DESI vets its z's
 * upstream), and BGS rows with non-positive g or r flux (unplottable
 * photometry). A non-positive z-band flux keeps the row with
 * `magI = NaN` (the standard missing-band sentinel, see `common.ts`).
 *
 * Field mapping mirrors the other survey parsers: `objID` carries
 * TARGETID (a bigint, like SDSS objIDs); `spectroscopicZ = z`
 * verbatim; orientation and diameter are `null` so the build pipeline
 * applies its deterministic `fallbackOrientation` + default-diameter
 * paths (the GLADE no-measurement shape); `classByte` carries the
 * tracer via `DESI_TRACER_CLASS` so the InfoCard can name the
 * population.
 */
export function parseDesiClustering(
  buf: ArrayBuffer,
  tracer: DesiTracer,
  keep?: (raDeg: number, decDeg: number) => boolean,
): { records: ParsedRecord[]; skipped: number } {
  const table = parseFitsBinTable(buf);
  const view = new DataView(buf);

  // Case-insensitive TTYPE lookup, throwing on absence (the sdssCsv
  // `requireColumn` idiom): a missing required column is a structural
  // problem no amount of row-skipping can recover from.
  const requireColumn = (name: string): FitsColumn => {
    const lower = name.toLowerCase();
    const col = table.columns.find((c) => c.name.toLowerCase() === lower);
    if (!col) {
      throw new Error(
        `parseDesiClustering: ${tracer} table missing required column "${name}". ` +
          `Found: ${table.columns.map((c) => c.name).join(', ')}`,
      );
    }
    return col;
  };

  const colTargetId = requireColumn('TARGETID');
  const colRa = requireColumn('RA');
  const colDec = requireColumn('DEC');
  const colZ = requireColumn('Z');

  // Photometry strategy as a tagged union, decided once before the row
  // loop: BGS decodes its real (lowercase-on-disk) dered flux columns,
  // required so a future BGS release that drops them fails loudly; the
  // fluxless tracers carry their synthetic-display constants instead.
  const photometry =
    tracer === 'BGS'
      ? ({
          kind: 'flux',
          g: requireColumn('flux_g_dered'),
          r: requireColumn('flux_r_dered'),
          z: requireColumn('flux_z_dered'),
        } as const)
      : ({ kind: 'synthetic', ...DESI_TRACER_DISPLAY[tracer] } as const);

  const classByte = DESI_TRACER_CLASS[tracer];

  const records: ParsedRecord[] = [];
  let skipped = 0;

  for (let r = 0; r < table.rowCount; r++) {
    const rowStart = table.dataOffset + r * table.rowLengthBytes;

    // Cone predicate first: cheap RA/DEC decode, then bail before
    // touching any other cell or allocating anything.
    const ra = readFloatCell(view, rowStart + colRa.byteOffset, colRa);
    const dec = readFloatCell(view, rowStart + colDec.byteOffset, colDec);
    if (keep && !keep(ra, dec)) continue;

    const z = readFloatCell(view, rowStart + colZ.byteOffset, colZ);

    // Non-positive / non-finite redshift → drop, same convention as the
    // sibling parsers (glade.ts, sdssCsv.ts). DESI's LSS clustering
    // catalogs are redshift-vetted upstream so this should never fire —
    // it's a safety net: z <= 0 would otherwise flow silently into a
    // -Infinity (z = 0) or NaN (z < 0) synthetic magnitude here, and
    // into a degenerate at-origin/mirrored position downstream where
    // redshiftToDistanceMpc(z) places the record. Applies to ALL
    // tracers: BGS mags come from fluxes, but its z still drives the
    // record's 3D position.
    if (!Number.isFinite(z) || z <= 0) {
      skipped++;
      continue;
    }

    let magG: number;
    let magR: number;
    let magI: number;
    if (photometry.kind === 'flux') {
      // BGS: real photometry, nanomaggy → magnitude. g and r feed the
      // colour ramp and brightness, so a row without both is
      // unplottable and gets dropped; the z band only fills the magI
      // display slot, so its absence degrades to NaN instead.
      const fluxG = readFloatCell(view, rowStart + photometry.g.byteOffset, photometry.g);
      const fluxR = readFloatCell(view, rowStart + photometry.r.byteOffset, photometry.r);
      if (fluxG <= 0 || fluxR <= 0) {
        skipped++;
        continue;
      }
      const fluxZ = readFloatCell(view, rowStart + photometry.z.byteOffset, photometry.z);
      magG = NANOMAGGY_ZEROPOINT_MAG - 2.5 * Math.log10(fluxG);
      magR = NANOMAGGY_ZEROPOINT_MAG - 2.5 * Math.log10(fluxR);
      magI = fluxZ > 0 ? NANOMAGGY_ZEROPOINT_MAG - 2.5 * Math.log10(fluxZ) : NaN;
    } else {
      // LRG/ELG/QSO: no fluxes on disk. Apparent magnitude from the
      // population's characteristic absolute magnitude via the
      // distance modulus m − M = 5·log10(d_L / 10 pc), with
      // d_L = (1 + z)·d_C the luminosity distance and 1e5 the
      // Mpc → 10 pc unit factor.
      const dL = (1 + z) * redshiftToDistanceMpc(z);
      magR = photometry.absMagR + 5 * Math.log10(dL * 1e5);
      magG = magR + photometry.gMinusR;
      magI = NaN;
    }

    records.push({
      source: Source.DesiDeep,
      // TARGETID is DESI's stable 64-bit object identifier — same slot
      // repurposing as GLADE's PGC-in-objID: consumers branch on
      // `source` to interpret the value.
      objID: readInt64Cell(view, rowStart + colTargetId.byteOffset, colTargetId),
      ra,
      dec,
      z,
      spectroscopicZ: z,
      // DESI's g/r/z optical bands map onto the SDSS-shaped slots as
      // g → magG, r → magR, z(band) → magI (see DESI_DEEP_ENTRY's
      // bandLabels); no u or true i coverage exists.
      magU: NaN,
      magG,
      magR,
      magI,
      magZ: NaN,
      // No shape/orientation/size columns in any LSS clustering file —
      // the GLADE no-measurement shape: nulls route the row through the
      // pipeline's deterministic fallbackOrientation + default diameter.
      axisRatio: null,
      positionAngleDeg: null,
      diameterKpc: null,
      classByte,
      parentSurveyByte: 0,
    });
  }

  return { records, skipped };
}
