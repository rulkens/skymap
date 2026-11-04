import { realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import type { AppRoots } from '../@types/AppRoots';

/** resolveAppPath contains the path lexically; a symlink inside a root could still lead outside. */
export async function isUnderARoot(file: string, roots: AppRoots): Promise<boolean> {
  const real = await realpath(file);
  const realRoots = await Promise.all(
    [roots.dist, roots.data].map((root) => realpath(root).catch(() => null)),
  );
  return realRoots.some((root) => root !== null && real.startsWith(root + sep));
}
