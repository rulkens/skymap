import { resolve, sep } from 'node:path';

/** `rest` under `root`, or null when it would land outside it (`../`, an absolute path). */
export function resolveInside(root: string, rest: string): string | null {
  const base = resolve(root);
  const file = resolve(base, rest);
  return file.startsWith(base + sep) ? file : null;
}
