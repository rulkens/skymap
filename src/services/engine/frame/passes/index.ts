/**
 * passes/index — the HDR-pass registry.
 *
 * Exports the ordered `HDR_PASSES` array that `renderFrame` iterates
 * over inside its open `beginRenderPass(...)` block.  Order matches
 * the pre-D.2 inline draw order in `renderFrame.ts`, extended with the
 * two new UI-overlay passes from Task R4:
 *
 *   1. point-sprites      — instanced billboards (always-on)
 *   2. galaxy-thumbnails  — atlas + procedural-disk thumbnails
 *   3. filaments          — cosmic-web skeleton overlay
 *   4. milky-way          — procedural impostor at the world origin
 *   5. marker-lines       — thick-line UI overlay (you-are-here indicator)
 *   6. labels             — MSDF text UI overlay (you-are-here label)
 *
 * The order is preserved exactly because the array entry IS the
 * canonical record now — pre-D.2 the order was folkloric (lines in
 * a function); post-D.2 reordering passes is a one-line array
 * shuffle with a clear semantic.
 *
 * ### Why marker-lines BEFORE labels?
 *
 * Both pass types use premultiplied-OVER blend, so the later draw
 * composites ABOVE the earlier one at overlapping pixels.  The line
 * should never appear on top of its own label text — drawing the
 * line first (pass 5) and the label second (pass 6) means the label
 * composites over the line where they overlap, preserving readability.
 *
 * ### Why these two pass AFTER milky-way?
 *
 * Labels and marker lines are UI overlay: they should read above the
 * procedural Milky Way impostor.  Placing them later in the HDR
 * sequence means they composite over the fully-resolved 3D content
 * before tone-mapping.  The tone-map curve then operates on the
 * composited target, so white labels remain white under any exposure
 * setting (no over-brightening from the exposure curve).
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
 * pass (it samples the HDR target the six entries above wrote
 * into) and so doesn't fit the `Pass` interface.  See `types.ts`'s
 * "tone-map special case" docstring for the rejected-alternative
 * analysis.
 */

import type { Pass } from './types';
import { pointSpritesPass } from './pointSpritesPass';
import { galaxyThumbnailsPass } from './galaxyThumbnailsPass';
import { filamentsPass } from './filamentsPass';
import { milkyWayPass } from './milkyWayPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';

/** The six HDR passes, in deterministic draw order. */
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  galaxyThumbnailsPass,
  filamentsPass,
  milkyWayPass,
  markerLinesPass,
  labelsPass,
];

export type { Pass, PassDeps } from './types';
export { pointSpritesPass } from './pointSpritesPass';
export { galaxyThumbnailsPass } from './galaxyThumbnailsPass';
export { filamentsPass } from './filamentsPass';
export { milkyWayPass } from './milkyWayPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
