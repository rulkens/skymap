/**
 * createCsvColumnReader — a CSV's UTF-8 bytes, streaming in, into its first four
 * columns; the import settings apply later (catalogFromCsvColumns). Line rules
 * are the native build's (Polyphorm/cpplib/dataset.cpp:36-72): a line is data
 * when it starts with a digit, sign or dot; columns past the fourth are ignored.
 * Ours: one separator per file, from its first data line (comma or semicolon,
 * else tab, else spaces), so an empty field is refused instead of shifting the
 * rest. A plain-ASCII line is split in place; any other is decoded and split by
 * the regex rule as written. UTF-8 never puts a byte below 128 inside a
 * character, so lines split safely on the LF byte.
 */
import type { CsvColumnReader } from '../../@types/CsvColumnReader';
import type { CsvColumns } from '../../@types/CsvColumns';
import { parseAsciiNumber } from '../utils/parseAsciiNumber';
import { massWeightFromLog10 } from './massWeightFromLog10';

const DATA_LINE = /^\s*[0-9+\-.]/;
const COMMA = 0;
const TAB = 1;
const SPACE = 2;
// Space-aligned columns are often padded with tabs too.
const SEPARATORS = [/\s*[,;]\s*/, / *\t */, /[\t ]+/];
const COLUMNS = 4;
const INITIAL_ROWS = 4096;
// Below 50, 10^(w − 12) fits a float32 (FLT_MAX ≈ 3.4e38).
const LOG_OVERFLOW_FLOOR = 50;
// A BOM inside the text is whitespace to the rule, so it is kept.
const LINE_DECODER = new TextDecoder('utf-8', { ignoreBOM: true });
const LF = 10;
const CR = 13;

// Per separator, what each ASCII byte is to the in-place split. STRIP is a
// blank its regex absorbs beside a separator; SLOW sends the line to the regex.
const FIELD = 0;
const DELIMITER = 1;
const STRIP = 2;
const SLOW = 3;
const BYTE_ROLES = [
  { [DELIMITER]: ',;', [STRIP]: ' \t' },
  { [DELIMITER]: '\t', [STRIP]: ' ' },
  { [DELIMITER]: ' \t', [STRIP]: '' },
].map((roles) => {
  const table = new Uint8Array(256).fill(SLOW);
  for (const ch of '0123456789+-.eE,; \t') table[ch.charCodeAt(0)] = FIELD;
  for (const role of [DELIMITER, STRIP] as const) {
    for (const ch of roles[role]) table[ch.charCodeAt(0)] = role;
  }
  return table;
});

/** `sizeHint`: the file's length in bytes, so the columns are sized once instead of grown. */
export function createCsvColumnReader(sizeHint = 0): CsvColumnReader {
  let values = new Float64Array(INITIAL_ROWS * COLUMNS);
  let lines = new Uint32Array(INITIAL_ROWS);
  let count = 0;
  let lineNo = 0;
  let consumed = 0; // bytes before the current line, for sizing
  let carry = new Uint8Array(0); // a line not yet ended, across chunks
  let carryLength = 0;
  let separator = -1;
  let problem: string | null = null;
  let firstLogOverflow: CsvColumns['firstLogOverflow'] = null;
  const fieldStart = new Int32Array(COLUMNS);
  const fieldEnd = new Int32Array(COLUMNS);

  const refuse = (message: string): void => {
    problem = `Line ${lineNo}: ${message}`;
  };

  const grow = (): void => {
    const perRow = consumed / count;
    const projected = sizeHint > consumed ? Math.ceil((sizeHint / perRow) * 1.05) : 0;
    const capacity = Math.max(Math.ceil(lines.length * 1.5), projected);
    const nextValues = new Float64Array(capacity * COLUMNS);
    nextValues.set(values);
    values = nextValues;
    const nextLines = new Uint32Array(capacity);
    nextLines.set(lines);
    lines = nextLines;
  };

  // The checks every data line passes, in the order the messages rank.
  const take = (
    fieldCount: number,
    empty: boolean,
    a: number,
    b: number,
    c: number,
    w: number,
    // Where the weight is written, decoded only for the overflow refusal.
    source: string | Uint8Array,
    weightStart: number,
    weightEnd: number,
  ): void => {
    if (fieldCount < COLUMNS) return refuse(`expected 4 numbers, found ${fieldCount}`);
    // Number('') is 0, so an empty field would read as a zero.
    if (empty || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return refuse('every value must be a finite number');
    }
    if (count === lines.length) grow();
    const at = count * COLUMNS;
    values[at] = a;
    values[at + 1] = b;
    values[at + 2] = c;
    values[at + 3] = w;
    lines[count] = lineNo;
    if (
      firstLogOverflow === null &&
      w > LOG_OVERFLOW_FLOOR &&
      Number.isFinite(w) &&
      Math.fround(massWeightFromLog10(w)) === Infinity
    ) {
      const text =
        typeof source === 'string'
          ? source.slice(weightStart, weightEnd)
          : LINE_DECODER.decode(source.subarray(weightStart, weightEnd));
      firstLogOverflow = { row: count, text };
    }
    count++;
  };

  const readLineByRegex = (line: string): void => {
    if (!DATA_LINE.test(line)) return;
    const trimmed = line.trim();
    if (separator < 0) {
      separator = /[,;]/.test(trimmed) ? COMMA : trimmed.includes('\t') ? TAB : SPACE;
    }
    const fields = trimmed.split(SEPARATORS[separator]!);
    while (fields.at(-1) === '') fields.pop(); // trailing separators
    const empty = fields.slice(0, COLUMNS).includes('');
    const [a, b, c, w] = fields.slice(0, COLUMNS).map(Number);
    const weightText = fields[3] ?? '';
    take(fields.length, empty, a!, b!, c!, w!, weightText, 0, weightText.length);
  };

  const readBytesByRegex = (bytes: Uint8Array, start: number, end: number): void =>
    readLineByRegex(LINE_DECODER.decode(bytes.subarray(start, end)));

  const readLine = (bytes: Uint8Array, start: number, end: number): void => {
    let i = start;
    let code = 0;
    while (i < end && ((code = bytes[i]!) === 32 || code === 9)) i++;
    if (i === end) return;
    if (!((code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46)) {
      // \v, \f, \r and non-ASCII blanks count as leading space in the rule.
      if (code >= 128 || code === 11 || code === 12 || code === CR) {
        readBytesByRegex(bytes, start, end);
      }
      return;
    }
    let last = end;
    while (last > i && ((code = bytes[last - 1]!) === 32 || code === 9)) last--;

    if (separator < 0) {
      let commas = false;
      let tabs = false;
      for (let j = i; j < last; j++) {
        code = bytes[j]!;
        if (BYTE_ROLES[0]![code] === SLOW) return readBytesByRegex(bytes, start, end);
        commas ||= code === 44 || code === 59;
        tabs ||= code === 9;
      }
      separator = commas ? COMMA : tabs ? TAB : SPACE;
    }

    // Split [i, last): fields lose the blanks their separator absorbs; spaces merge.
    const roles = BYTE_ROLES[separator]!;
    let fieldCount = 0;
    let filled = 0; // fields up to the last non-empty one: trailing separators drop
    let from = i;
    for (let j = i; j <= last; j++) {
      if (j < last) {
        const role = roles[bytes[j]!]!;
        if (role === SLOW) return readBytesByRegex(bytes, start, end);
        if (role !== DELIMITER) continue;
      }
      let a = from;
      let b = j;
      from = j + 1;
      while (a < b && roles[bytes[a]!] === STRIP) a++;
      while (b > a && roles[bytes[b - 1]!] === STRIP) b--;
      if (a === b && separator === SPACE) continue;
      if (fieldCount < COLUMNS) {
        fieldStart[fieldCount] = a;
        fieldEnd[fieldCount] = b;
      }
      fieldCount++;
      if (a < b) filled = fieldCount;
    }

    let empty = false;
    for (let k = 0; k < COLUMNS && k < filled; k++) empty ||= fieldStart[k] === fieldEnd[k];
    if (filled < COLUMNS || empty) return take(filled, empty, 0, 0, 0, 0, '', 0, 0);
    take(
      filled,
      empty,
      parseAsciiNumber(bytes, fieldStart[0]!, fieldEnd[0]!),
      parseAsciiNumber(bytes, fieldStart[1]!, fieldEnd[1]!),
      parseAsciiNumber(bytes, fieldStart[2]!, fieldEnd[2]!),
      parseAsciiNumber(bytes, fieldStart[3]!, fieldEnd[3]!),
      bytes,
      fieldStart[3]!,
      fieldEnd[3]!,
    );
  };

  // Reads every line of [start, end) that ends with LF; returns where the rest begins.
  const readLines = (bytes: Uint8Array, start: number, end: number): number => {
    let nl = bytes.indexOf(LF, start);
    for (; problem === null && nl !== -1 && nl < end; nl = bytes.indexOf(LF, start)) {
      // A CR before the LF belongs to the line break, as /\r?\n/ splits.
      const lineEnd = nl > start && bytes[nl - 1] === CR ? nl - 1 : nl;
      lineNo++;
      readLine(bytes, start, lineEnd);
      consumed += nl + 1 - start;
      start = nl + 1;
    }
    return start;
  };

  const keep = (bytes: Uint8Array): void => {
    if (carryLength + bytes.length > carry.length) {
      const grown = new Uint8Array(Math.max(carry.length * 2, carryLength + bytes.length));
      grown.set(carry.subarray(0, carryLength));
      carry = grown;
    }
    carry.set(bytes, carryLength);
    carryLength += bytes.length;
  };

  return {
    push(chunk) {
      if (problem !== null) return false;
      let start = 0;
      if (carryLength > 0) {
        const nl = chunk.indexOf(LF);
        keep(nl === -1 ? chunk : chunk.subarray(0, nl + 1));
        if (nl === -1) return true;
        readLines(carry, 0, carryLength);
        carryLength = 0;
        start = nl + 1;
      }
      if (problem === null) start = readLines(chunk, start, chunk.length);
      if (problem !== null) return false;
      keep(chunk.subarray(start));
      return true;
    },
    finish() {
      // The last line has no LF after it, so a CR at its end stays (trim drops it).
      if (problem === null && carryLength > 0) {
        lineNo++;
        readLine(carry, 0, carryLength);
      }
      carry = new Uint8Array(0);
      carryLength = 0;
      return {
        values: values.subarray(0, count * COLUMNS),
        lines: lines.subarray(0, count),
        count,
        problem,
        firstLogOverflow,
      };
    },
  };
}
