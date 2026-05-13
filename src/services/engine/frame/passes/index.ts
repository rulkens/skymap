/**
 * passes/index — the HDR-pass registry.
 *
 * Exports the ordered `HDR_PASSES` array that `renderFrame` iterates
 * over inside its open `beginRenderPass(...)` block.  Order matches
 * the pre-D.2 inline draw order in `renderFrame.ts`, extended with the
 * two new UI-overlay passes from Task R4:
 *
 *   1. point-sprites       — instanced billboards (always-on)
 *   2. procedural-disks    — LOD-1 procedural-disk impostors
 *   3. textured-impostors  — LOD-2 textured-disk + textured-quad impostors
 *   4. milky-way           — procedural impostor at the world origin
 *   5. filaments           — cosmic-web skeleton overlay
 *   6. scalar-volume       — 3D raymarched scalar-field cubes (optional)
 *   7. marker-lines        — thick-line UI overlay (you-are-here indicator)
 *   8. labels              — MSDF text UI overlay (you-are-here label)
 *
 * The order is preserved exactly because the array entry IS the
 * canonical record now — pre-D.2 the order was folkloric (lines in
 * a function); post-D.2 reordering passes is a one-line array
 * shuffle with a clear semantic.  The DebugPanel `GpuTimingsSection`
 * derives its row order from this same array (plus the two trailing
 * out-of-HDR passes, tone-map and pick), so a reorder here
 * automatically propagates to the timing UI.
 *
 * ### Why milky-way BEFORE filaments / scalar-volume?
 *
 * The Milky Way impostor is the densest, brightest near-field
 * additive contributor.  Drawing it early lets the broader
 * large-scale-structure overlays (filaments, scalar volumes)
 * composite over its bulge rather than the other way round — the
 * cosmic-web skeleton and density fields read clearly against a
 * bright MW backdrop, and the bulge doesn't visually swallow the
 * thin filament lines or wispy volume haloes.  All three are
 * additively blended so this is a visual-hierarchy choice rather
 * than a correctness constraint.
 *
 * ### Why marker-lines BEFORE labels?
 *
 * Both pass types use premultiplied-OVER blend, so the later draw
 * composites ABOVE the earlier one at overlapping pixels.  The line
 * should never appear on top of its own label text — drawing the
 * line first and the label second means the label composites over
 * the line where they overlap, preserving readability.
 *
 * ### Why both UI overlays AFTER the additive content?
 *
 * Labels and marker lines are UI overlay: they should read above the
 * procedural Milky Way impostor and the filament / volume overlays.
 * Placing them later in the HDR sequence means they composite over
 * the fully-resolved 3D content before tone-mapping.  The tone-map
 * curve then operates on the composited target, so white labels
 * remain white under any exposure setting (no over-brightening from
 * the exposure curve).
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
 * pass (it samples the HDR target the seven entries above wrote
 * into) and so doesn't fit the `Pass` interface.  See `types.ts`'s
 * "tone-map special case" docstring for the rejected-alternative
 * analysis.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { pointSpritesPass } from './pointSpritesPass';
import { proceduralDisksPass } from './proceduralDisksPass';
import { texturedImpostorsPass } from './texturedImpostorsPass';
import { filamentsPass } from './filamentsPass';
import { scalarVolumePass } from './scalarVolumePass';
import { milkyWayPass } from './milkyWayPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';

/** The eight HDR passes, in deterministic draw order. */
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  milkyWayPass,
  filamentsPass,
  scalarVolumePass,
  markerLinesPass,
  labelsPass,
];

export { pointSpritesPass } from './pointSpritesPass';
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedImpostorsPass } from './texturedImpostorsPass';
export { filamentsPass } from './filamentsPass';
export { scalarVolumePass } from './scalarVolumePass';
export { milkyWayPass } from './milkyWayPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
