import { relative } from 'node:path';

/** `file` relative to `root`; a path outside the root stays absolute rather than printing '../../'. */
export function rootRelative(root: string, file: string): string {
  const rel = relative(root, file);
  return rel.startsWith('..') ? file : rel;
}
