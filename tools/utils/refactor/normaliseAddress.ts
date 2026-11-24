import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { rootRelative } from './rootRelative';

/**
 * The address with its file in the disk's real case, root-relative: the engine reports
 * real-case paths, so a wrong-case address would count its own declaration as a reference.
 */
export function normaliseAddress(
  root: string,
  address: SymbolAddress,
): { ok: true; address: SymbolAddress } | { ok: false; refusal: string } {
  try {
    const real = realpathSync.native(resolve(root, address.file));
    return { ok: true, address: { ...address, file: rootRelative(root, real) } };
  } catch {
    return {
      ok: false,
      refusal: `Cannot resolve '${address.file}#${address.symbol}': the file '${address.file}' does not exist.`,
    };
  }
}
