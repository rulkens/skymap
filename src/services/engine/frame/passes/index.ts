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
 *   3. textured-disks      — LOD-2 3D-oriented textured-disk impostors
 *   4. milky-way           — procedural impostor at the world origin
 *   5. filaments           — cosmic-web skeleton overlay
 *   6. volume-upsample     — upsamples the half-res volume offscreen target
 *                            into the HDR target (when active fields exist)
 *   7. structure-markers     — at-rest halo + ring for cluster / SC / void POIs
 *
 * `textured-disks` is what remains of the briefly-split (and never-shipped)
 * `textured-quads` + `textured-disks` pair from 2026-05-18.  The quad
 * half was deleted along with its renderer because the build-pipeline's
 * deterministic orientation fallback (`buildAllBins.ts`) means every
 * encoded galaxy has finite (axisRatio, PA) — the quad branch in the
 * impostor subsystem only ever fired for famous galaxies at <4 px,
 * where the point sprite handled them.  See
 * `texturedDiskSubsystem.ts` for the full rationale.
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
import { texturedDisksPass } from './texturedDisksPass';
import { filamentsPass } from './filamentsPass';
import { flowFieldPass } from './flowFieldPass';
import { volumeUpsamplePass } from './volumeUpsamplePass';
import { milkyWayPass } from './milkyWayPass';
import { horizonShellPass } from './horizonShellPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { structureMarkersPass } from './structureMarkersPass';
import { selectionRingPass } from './selectionRingPass';
import { diskRadiusRingPass } from './diskRadiusRingPass';

/** The HDR passes, in deterministic draw order. */
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedDisksPass,
  milkyWayPass,
  filamentsPass,
  flowFieldPass,
  volumeUpsamplePass,
  horizonShellPass,
  structureMarkersPass,
];

/**
 * The UI overlay passes, in deterministic draw order.  The selection
 * ring leads so marker-lines and labels composite over its stroke —
 * labels carry information that must stay legible.  The disk-radius
 * debug ring follows the selection ring (both are world-space strokes
 * around the selected galaxy); it is default-off, so it contributes
 * nothing unless the curator enables it.  All entries share one
 * swap-chain `beginRenderPass` (see `uiOverlay.ts`) and one timing slot
 * (`ui-overlay`).
 */
export const UI_PASSES: readonly Pass[] = [
  selectionRingPass,
  diskRadiusRingPass,
  markerLinesPass,
  labelsPass,
];

/**
 * The ordered list of GPU-timing slots — the single source of truth for
 * both slot allocation (`gpuTimingService` builds its query-set index
 * map from this) and display order (the DebugPanel iterates it).
 *
 * It is every `HDR_PASSES` entry's name, bracketed by the four framework
 * slots that aren't members of either registry:
 *
 *   - `scalar-volume` — the half-resolution volume pre-pass, encoded in
 *     `encodeVolumes` before the HDR loop.
 *   - `tone-map`      — the post-process tonemap (`renderFrame`).
 *   - `ui-overlay`    — the combined `UI_PASSES` slot; all UI overlays
 *     share one swap-chain render pass, so they bill one slot.
 *   - `pick`          — the r32uint pick pass (`runFrame` / `wireInput`).
 *
 * The order is encoder draw order, so the timing panel reads top-to-
 * bottom as the frame executes.  Adding a renderer to `HDR_PASSES` is
 * the ONLY edit needed: it auto-acquires a query-set slot here and a
 * DebugPanel row, with no timing-layer change.
 */
export const TIMED_SLOT_NAMES: readonly string[] = [
  'scalar-volume',
  ...HDR_PASSES.map((p) => p.name),
  'tone-map',
  'ui-overlay',
  'pick',
];

export { pointSpritesPass } from './pointSpritesPass';
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedDisksPass } from './texturedDisksPass';
export { filamentsPass } from './filamentsPass';
export { flowFieldPass } from './flowFieldPass';
export { volumeUpsamplePass } from './volumeUpsamplePass';
export { milkyWayPass } from './milkyWayPass';
export { horizonShellPass } from './horizonShellPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
export { structureMarkersPass } from './structureMarkersPass';
export { selectionRingPass } from './selectionRingPass';
export { diskRadiusRingPass } from './diskRadiusRingPass';
