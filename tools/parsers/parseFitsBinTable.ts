/**
 * parseFitsBinTable — a FITS file's first BINTABLE extension, down to each
 * column's byte range within a row.
 *
 * Row DECODING is deliberately out of scope: callers read their own columns, so
 * one header parser serves the DESI clustering tracers and the Local Bubble
 * shell table alike without learning either one's schema.
 */
import type { FitsBinTable } from './@types/FitsBinTable';
import type { FitsColumn } from './@types/FitsColumn';

const BLOCK_SIZE = 2880;

const CARD_SIZE = 80;

const CARDS_PER_BLOCK = BLOCK_SIZE / CARD_SIZE;

const asciiDecoder = new TextDecoder('ascii');

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
