import type { ByteRange } from '../@types/ByteRange';

/**
 * The one span a `Range: bytes=…` header asks of a `size`-byte file: null when there is no header,
 * or one this server answers whole (several spans, another unit), and 'unsatisfiable' past the end.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (match === null || (match[1] === '' && match[2] === '')) return null;
  const [, from, to] = match;
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  return end < start ? null : { start, end };
}
