/**
 * passes/index — the HDR-pass registry.
 *
 * Exports the ordered `HDR_PASSES` array that `renderFrame` iterates
 * over inside its open `beginRenderPass(...)` block.  Order matches
 * the pre-D.2 inline draw order in `renderFrame.ts`:
 *
 *   1. point-sprites      — instanced billboards (always-on)
 *   2. galaxy-thumbnails  — atlas + procedural-disk thumbnails
 *   3. filaments          — cosmic-web skeleton overlay
 *   4. milky-way          — procedural impostor at the world origin
 *
 * The order is preserved exactly because the array entry IS the
 * canonical record now — pre-D.2 the order was folkloric (lines in
 * a function); post-D.2 reordering passes is a one-line array
 * shuffle with a clear semantic.
 *
 * ### Why a single-purpose `index.ts` despite the project's
 * "no barrel exports" convention
 *
 * The convention applies to React component folders — components
 * shouldn't be re-exported via barrel files; they should be
 * imported directly from their `.tsx`.  This module isn't a barrel
 * — it owns the *registry decision* (which passes run, in what
 * order).  Splitting "the array" out of any individual pass file
 * keeps each pass file a one-thing module and makes the registry's
 * single responsibility explicit at one site.
 *
 * Tone-map is NOT in this array.  It runs OUTSIDE the HDR render
 * pass (it samples the HDR target the four entries above wrote
 * into) and so doesn't fit the `Pass` interface.  See `types.ts`'s
 * "tone-map special case" docstring for the rejected-alternative
 * analysis.
 */

import type { Pass } from './types';
import { pointSpritesPass } from './pointSpritesPass';
import { galaxyThumbnailsPass } from './galaxyThumbnailsPass';
import { filamentsPass } from './filamentsPass';
import { milkyWayPass } from './milkyWayPass';

/** The four HDR passes, in deterministic draw order. */
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  galaxyThumbnailsPass,
  filamentsPass,
  milkyWayPass,
];

export type { Pass, PassDeps } from './types';
export { pointSpritesPass } from './pointSpritesPass';
export { galaxyThumbnailsPass } from './galaxyThumbnailsPass';
export { filamentsPass } from './filamentsPass';
export { milkyWayPass } from './milkyWayPass';
