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
 *   - All FITS binary data (the actual row bytes, decoded by the
 *     caller in Task 4) is big-endian ("network byte order"), the
 *     opposite of the little-endian convention used everywhere else in
 *     this codebase's binary formats (`galaxyCatalogFormat.ts`,
 *     `scalarFieldFormat.ts`). Header *cards* are plain ASCII text, so
 *     endianness doesn't apply to anything parsed in this file.
 *
 * Reference: NOST 100-2.0, "Definition of the Flexible Image Transport
 * System (FITS)".
 */

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
      throw new Error(
        `parseFitsBinTable: unsupported TFORM "${typeCode}" for column ${columnName}`,
      );
  }
}

/**
 * Parse a FITS file down to its first BINTABLE extension's header
 * layout: where the data rows start, how long a row is, how many rows
 * there are, and each column's name/type/byte range within a row.
 *
 * Row *decoding* (turning those byte ranges into numbers, and mapping
 * columns to a `ParsedRecord`) is deliberately out of scope here — see
 * the module's Task 4 half.
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
