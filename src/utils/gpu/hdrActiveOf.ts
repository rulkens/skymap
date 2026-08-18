/**
 * hdrActiveOf — is the swap chain currently the extended-range surface?
 *
 * Derived from the `swap` row (via `specOf`) rather than carried as its own
 * flag: `renderTargets.setSwapFormat` is the one place the live swap format
 * changes, so reading the row here can never drift from it.
 */

import type { RenderTargets } from '../../@types/rendering/RenderTargets';

export function hdrActiveOf(renderTargets: RenderTargets): boolean {
  return renderTargets.specOf('swap').format === 'rgba16float';
}
