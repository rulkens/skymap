import type { ResolvedTileResidency } from '../../stream/@types/ResolvedTileResidency';

/**
 * StandaloneRect — what a standalone product resolved to for one leaf: its
 * flattened atlas sub-rect, `'empty'` when the walk met a stored-empty tile
 * (the product's own sentinel, even over a resident ancestor), or null when
 * nothing is resident or the product has no bands.
 */
export type StandaloneRect =
  | Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'>
  | 'empty'
  | null;
