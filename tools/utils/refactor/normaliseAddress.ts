import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { rootRelative } from './rootRelative';

/**
 * The address with its file in the disk's real case, root-relative: the engine reports
 * real-case paths, so a wrong-case address would count its own declaration as a reference.
 */
export function normaliseAddress<Address extends { readonly file: string }>(
  root: string,
  address: Address,
): { ok: true; address: Address } | { ok: false; refusal: string } {
  try {
    const real = realpathSync.native(resolve(root, address.file));
    return { ok: true, address: { ...address, file: rootRelative(root, real) } };
  } catch {
    return {
      ok: false,
      refusal: `Cannot resolve address: the file '${address.file}' does not exist.`,
    };
  }
}
