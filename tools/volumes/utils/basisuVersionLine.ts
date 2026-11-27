import { execFileSync } from 'node:child_process';

/** basisu's version line; a missing basisu throws with the install hint. The builders call it first,
 *  so a machine without it fails before the long passes, not after. */
export function basisuVersionLine(): string {
  try {
    return execFileSync('basisu', ['-version'], { encoding: 'utf8' }).split('\n')[0]!;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Error('basisu not found: install with `brew install basis_universal` (v2.50.0)');
  }
}
