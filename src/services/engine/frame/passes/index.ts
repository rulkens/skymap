/**
 * passes/index — the content-layer registry.
 *
 * `CONTENT_LAYERS` is the flat, ordered list of every `ContentLayer` the
 * renderer draws.  It replaces the two `Pass[]` arrays this module used to
 * export (`HDR_PASSES` additive-into-HDR, `UI_PASSES` premultiplied-OVER
 * onto the swap chain) — those were two arrays because a `Pass` baked its
 * target and blend into "which array it lives in"; a `ContentLayer` states
 * `target` and `blend` as data fields on the row itself, so one array is
 * enough and grouping by `(target, blend)` becomes a `.filter()`.
 *
 * `HDR_PASSES` below is `CONTENT_LAYERS.filter((l) => l.target === 'hdr')`
 * — a TRANSITIONAL derived export.  It exists only so the two HDR encoders
 * (`encodeHdrSingle`, `encodeHdrSplit`) and `TIMED_SLOT_NAMES` keep working
 * unchanged while `UI_PASSES` (still the pre-unification `Pass[]` shape,
 * converted in a follow-up task) continues to drive the swap-chain overlay
 * pass.  Once every layer — HDR and UI alike — lives in `CONTENT_LAYERS`
 * and the executor walks a `FrameStep[]` program instead of two hand-wired
 * arrays, `HDR_PASSES` (and this file's `Pass`-typed exports) go away.
 *
 * ### CONTENT_LAYERS — additive HDR content, in deterministic draw order
 *
 * All nine entries are additively blended into the HDR `rgba16float`
 * target, projected through the cosmological slab:
 *
 *   1. point-sprites       — instanced billboards (always-on)
 *   2. procedural-disks    — LOD-1 procedural-disk impostors
 *   3. textured-disks      — LOD-2 3D-oriented textured-disk impostors
 *   4. milky-way           — star/dust point cloud at the galactic centre
 *   5. filaments           — cosmic-web skeleton overlay
 *   6. flow                — CF4++ peculiar-velocity ribbon overlay
 *   7. volume-upsample     — upsamples the half-res volume offscreen target
 *                            into the HDR target (when active fields exist)
 *   8. horizon-shell       — translucent sphere at the observable-universe edge
 *   9. structure-markers   — at-rest halo + ring for cluster / SC / void structures
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
 * Reordering layers is a one-line array shuffle with a clear
 * semantic.  The DebugPanel `GpuTimingsSection` derives its row order
 * from `HDR_PASSES` (plus tone-map, ui-overlay, and pick
 * appended), so a reorder here automatically propagates to the
 * timing UI.
 *
 * ### Why no marker-lines / labels in the HDR group
 *
 * Those two are premultiplied-OVER UI overlays mixed in among the
 * additive content pre-unification.  Two problems with that placement:
 *
 *   1. Colour mismatch — LDR-sane label colours (`[1, 1, 1, 1]`) would be
 *      compressed by the tone-map curve to mid-grey, so the UI overlay is
 *      composited after the tone-map (see encodeUiOverlay) instead.
 *   2. OVER-blend coherency — when timing was enabled (per-pass
 *      split for `timestampWrites`), every `pass.end` stored the HDR
 *      target to DRAM and the next `pass.begin` reloaded it.  On M1
 *      the OVER blends saw partially-coherent `dst.color` and
 *      rendered the marker / label at wrong alpha.  The additive
 *      layers tolerated the same coherency error invisibly because
 *      their blend (`one, one`) doesn't read `dst.color`.
 *
 * Both issues vanish once the OVER overlays live POST-tone-map on
 * the swap chain.  See `services/engine/frame/uiOverlay.ts`.
 *
 * ### Why milky-way BEFORE filaments / scalar-volume?
 *
 * The Milky Way point cloud is the densest, brightest near-field
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
 * — it owns the *registry decision* (which layers run, in what
 * order).  Splitting "the array" out of any individual layer file
 * keeps each layer file a one-thing module and makes the registry's
 * single responsibility explicit at one site.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Pass } from '../../../../@types/engine/frame/Pass';
import { pointSpritesLayer } from './pointSpritesLayer';
import { proceduralDisksLayer } from './proceduralDisksLayer';
import { texturedDisksLayer } from './texturedDisksLayer';
import { filamentsLayer } from './filamentsLayer';
import { flowFieldLayer } from './flowFieldLayer';
import { volumeUpsampleLayer } from './volumeUpsampleLayer';
import { milkyWayLayer } from './milkyWayLayer';
import { horizonShellLayer } from './horizonShellLayer';
import { structureMarkersLayer } from './structureMarkersLayer';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { selectionRingPass } from './selectionRingPass';
import { diskRadiusRingPass } from './diskRadiusRingPass';

/**
 * The flat content-layer registry, in deterministic draw order.  HDR
 * layers lead; UI-overlay layers (still `Pass`-typed — see `UI_PASSES`
 * below) join this array once they're converted to `ContentLayer` in a
 * follow-up task.
 */
export const CONTENT_LAYERS: readonly ContentLayer[] = [
  pointSpritesLayer,
  proceduralDisksLayer,
  texturedDisksLayer,
  milkyWayLayer,
  filamentsLayer,
  flowFieldLayer,
  volumeUpsampleLayer,
  horizonShellLayer,
  structureMarkersLayer,
  // UI-overlay rows (selectionRingPass, diskRadiusRingPass,
  // markerLinesPass, labelsPass, clipPathDebugPass) land here once
  // converted to ContentLayer.
];

/**
 * Transitional derived view: every `CONTENT_LAYERS` row that targets the
 * HDR offscreen target.  Consumed by the two HDR encoders and
 * `TIMED_SLOT_NAMES` so neither needs to change shape while `UI_PASSES`
 * is still a hand-maintained `Pass[]`.  Once every layer lives in
 * `CONTENT_LAYERS` and the frame executor walks a `FrameStep[]` program,
 * this filter (and the encoders that consume it) are deleted in favour of
 * the executor grouping layers by `(target, slab)` directly.
 */
export const HDR_PASSES: readonly ContentLayer[] = CONTENT_LAYERS.filter(
  (layer) => layer.target === 'hdr',
);

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
  // Debug overlay last so the clip-path route + gizmo draw on top of
  // everything; default-quiet (no snapshot held) until the curator clicks
  // "Calculate" in the DebugPanel.
  clipPathDebugPass,
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
 * bottom as the frame executes.  Adding a layer to `CONTENT_LAYERS` (with
 * `target: 'hdr'`) is the ONLY edit needed: it auto-acquires a query-set
 * slot here and a DebugPanel row, with no timing-layer change.
 */
export const TIMED_SLOT_NAMES: readonly string[] = [
  'scalar-volume',
  ...HDR_PASSES.map((p) => p.name),
  'tone-map',
  'ui-overlay',
  'pick',
];

export { pointSpritesLayer } from './pointSpritesLayer';
export { proceduralDisksLayer } from './proceduralDisksLayer';
export { texturedDisksLayer } from './texturedDisksLayer';
export { filamentsLayer } from './filamentsLayer';
export { flowFieldLayer } from './flowFieldLayer';
export { volumeUpsampleLayer } from './volumeUpsampleLayer';
export { milkyWayLayer } from './milkyWayLayer';
export { horizonShellLayer } from './horizonShellLayer';
export { structureMarkersLayer } from './structureMarkersLayer';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
export { clipPathDebugPass } from './clipPathDebugPass';
export { selectionRingPass } from './selectionRingPass';
export { diskRadiusRingPass } from './diskRadiusRingPass';
