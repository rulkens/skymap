import { relative } from 'node:path';
import type { AppRoots } from './@types/AppRoots';
import { DATA_PREFIX } from './data/dataPrefix';
import { MIRROR_BOOKKEEPING_FILES } from '../sync/data/mirrorBookkeepingFiles';
import { resolveInside } from '../files/utils/resolveInside';

/**
 * URL path → file path, or 'ca' for /ca.crt, or null (→ 404). The path is decoded but never
 * normalised first: `/data/../index.html` must stay a data-root path, which then escapes and fails.
 * The mirror's bookkeeping and half-downloaded `.part` files are not the LAN's to read; they are
 * matched after resolving, without case, as the disk will find them.
 */
export function resolveAppPath(urlPath: string, roots: AppRoots): string | 'ca' | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split(/[?#]/, 1)[0] ?? '');
  } catch {
    return null;
  }
  // Windows reads a backslash as a separator; a NUL makes fs throw.
  if (path.includes('\\') || path.includes('\0')) return null;
  if (path === '/ca.crt') return 'ca';
  if (!path.startsWith(DATA_PREFIX))
    return resolveInside(roots.dist, path.slice(1) || 'index.html');
  const file = resolveInside(roots.data, path.slice(DATA_PREFIX.length));
  if (file === null) return null;
  const key = relative(roots.data, file).toLowerCase();
  const bookkeeping = (MIRROR_BOOKKEEPING_FILES as readonly string[]).includes(key);
  return bookkeeping || key.endsWith('.part') ? null : file;
}
