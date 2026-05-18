/**
 * passes/index — the pass registries.
 *
 * Two ordered arrays of `Pass` consts:
 *
 *   - `HDR_PASSES` — additively blended into the HDR `rgba16float`
 *     target.  Iterated by `hdrSinglePass` / `hdrSplitPasses` inside
 *     a render pass against the HDR view.
 *   - `UI_PASSES` — premultiplied-OVER UI overlays, drawn after
 *     tone-map directly onto the swap chain.  Iterated by
 *     `uiOverlay` inside one render pass against the swap-chain view.
 *
 * The two registries share the `Pass` interface so a future overlay
 * (e.g. POI labels, debug HUD elements) just adds itself to whichever
 * registry matches its blend semantics.  The DebugPanel's
 * `DISPLAY_SLOT_ORDER` derives from HDR_PASSES (timing-instrumented
 * per-pass) plus three trailing slots: `tone-map`, `ui-overlay` (the
 * combined UI_PASSES timing slot — all entries bill against one slot
 * because they share one render pass), and `pick`.
 *
 * Reordering passes in either array is a one-line shuffle with a
 * clear semantic.
 *
 * ### HDR_PASSES — additive content, in deterministic draw order
 *
 * All seven entries are additively blended into the HDR `rgba16float`
 * target:
 *
 *   1. point-sprites       — instanced billboards (always-on)
 *   2. procedural-disks    — LOD-1 procedural-disk impostors
 *   3. textured-impostors  — LOD-2 textured-disk + textured-quad impostors
 *   4. milky-way           — procedural impostor at the world origin
 *   5. filaments           — cosmic-web skeleton overlay
 *   6. volume-upsample     — upsamples the half-res volume offscreen target
 *                            into the HDR target (when active fields exist)
 *   7. cluster-markers     — at-rest halo + ring for cluster / SC / void POIs
 *
 * Reordering passes is a one-line array shuffle with a clear
 * semantic.  The DebugPanel `GpuTimingsSection` derives its row order
 * from this same array (plus tone-map, ui-overlay, and pick
 * appended), so a reorder here automatically propagates to the
 * timing UI.
 *
 * ### Why no marker-lines / labels in HDR_PASSES anymore
 *
 * Those two were premultiplied-OVER UI overlays mixed in among the
 * additive content.  Two problems with that placement:
 *
 *   1. Colour mismatch — LDR-sane label colours (`[1, 1, 1, 1]`) got
 *      compressed by the tone-map curve to mid-grey; the
 *      `youAreHereSubsystem` worked around it with an `[8, 8, 8, 1]`
 *      overshoot hack.
 *   2. OVER-blend coherency — when timing was enabled (per-pass
 *      split for `timestampWrites`), every `pass.end` stored the HDR
 *      target to DRAM and the next `pass.begin` reloaded it.  On M1
 *      the OVER blends saw partially-coherent `dst.color` and
 *      rendered the marker / label at wrong alpha.  The additive
 *      passes tolerated the same coherency error invisibly because
 *      their blend (`one, one`) doesn't read `dst.color`.
 *
 * Both issues vanish once the OVER overlays live POST-tone-map on
 * the swap chain.  See `services/engine/frame/uiOverlay.ts`.
 *
 * ### Why milky-way BEFORE filaments / scalar-volume?
 *
 * The Milky Way impostor is the densest, brightest near-field
 * additive contributor.  Drawing it early lets the broader large-
 * scale-structure overlays (filaments, scalar volumes) composite
 * over its bulge rather than the other way round — the cosmic-web
 * skeleton and density fields read clearly against a bright MW
 * backdrop, and the bulge doesn't visually swallow the thin
 * filament lines or wispy volume haloes.  All three are additively
 * blended so this is a visual-hierarchy choice rather than a
 * correctness constraint.
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
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { pointSpritesPass } from './pointSpritesPass';
import { proceduralDisksPass } from './proceduralDisksPass';
import { texturedImpostorsPass } from './texturedImpostorsPass';
import { filamentsPass } from './filamentsPass';
import { volumeUpsamplePass } from './volumeUpsamplePass';
import { milkyWayPass } from './milkyWayPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { clusterMarkersPass } from './clusterMarkersPass';

/** The seven HDR passes, in deterministic draw order. */
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  milkyWayPass,
  filamentsPass,
  volumeUpsamplePass,
  clusterMarkersPass,
];

/**
 * The UI overlay passes, in deterministic draw order.  Marker-lines
 * before labels so the label text composites over the line where
 * they overlap.  All entries share one swap-chain `beginRenderPass`
 * (see `uiOverlay.ts`) and one timing slot (`ui-overlay`).
 */
export const UI_PASSES: readonly Pass[] = [markerLinesPass, labelsPass];

export { pointSpritesPass } from './pointSpritesPass';
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedImpostorsPass } from './texturedImpostorsPass';
export { filamentsPass } from './filamentsPass';
export { volumeUpsamplePass } from './volumeUpsamplePass';
export { milkyWayPass } from './milkyWayPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
export { clusterMarkersPass } from './clusterMarkersPass';
