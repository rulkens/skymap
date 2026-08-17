/**
 * hdrActiveOf — is the swap chain currently the extended-range surface?
 *
 * Derived from `RenderTargets.specs` rather than carried as its own flag:
 * `renderTargets.setSwapFormat` is the one place the live swap format
 * changes, so reading the `swap` row here can never drift from it.
 */

import type { RenderTargets } from '../../@types/rendering/RenderTargets';

export function hdrActiveOf(renderTargets: RenderTargets): boolean {
  return renderTargets.specs.find((spec) => spec.id === 'swap')?.format === 'rgba16float';
}
