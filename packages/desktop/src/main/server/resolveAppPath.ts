import { resolve, sep } from 'node:path';
import type { AppRoots } from './@types/AppRoots';
import { DATA_PREFIX } from './data/dataPrefix';

/**
 * URL path → file path, or 'ca' for /ca.crt, or null (→ 404). The path is decoded but never
 * normalised first: `/data/../index.html` must stay a data-root path, which then escapes and fails.
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
  const [root, rest] = path.startsWith(DATA_PREFIX)
    ? [roots.data, path.slice(DATA_PREFIX.length)]
    : [roots.dist, path.slice(1) || 'index.html'];
  const base = resolve(root);
  const file = resolve(base, rest);
  return file.startsWith(base + sep) ? file : null;
}
