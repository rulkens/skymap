import type { ByteRange } from '../../@types/serve/ByteRange';

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * The byte range a `Range` header asks of a `size`-byte file. `null` means
 * serve the whole file: no header, a multi-range or a malformed one, which RFC
 * 9110 lets a server ignore.
 */
export function byteRangeOf(header: string | undefined, size: number): ByteRange | null {
  const match = header === undefined ? null : SINGLE_RANGE.exec(header);
  if (match === null) return null;
  const [first, last] = [match[1] as string, match[2] as string];
  if (first === '' && last === '') return null;
  if (first === '') {
    // `bytes=-N`: the last N bytes.
    const length = Number(last);
    return length === 0 || size === 0
      ? 'unsatisfiable'
      : { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return 'unsatisfiable';
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return end < start ? null : { start, end };
}
