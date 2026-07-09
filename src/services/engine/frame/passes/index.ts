/**
 * passes/index — the content-layer registry.
 *
 * `CONTENT_LAYERS` is the flat, ordered list of every `ContentLayer` the
 * renderer draws — both the nine additive-into-HDR layers and the five
 * premultiplied-OVER-onto-swap-chain overlays.  It replaces the two `Pass[]`
 * arrays this module once exported — those were two arrays because a `Pass`
 * baked its target and blend into "which array it lives in"; a `ContentLayer`
 * states `target` and `blend` as data fields on the row itself, so one array is
 * enough and grouping by `(target, slab)` becomes a `.filter()`.
 *
 * There is no longer any hand-maintained hdr-vs-swap split here: the frame
 * executor walks a `FrameStep[]` program that groups layers by `(target, slab)`
 * directly, and the timing-slot list is derived from that program (`TIMED_SLOTS`
 * in `frameProgram.ts`).  Consumers that need one group take a `.filter()` over
 * `CONTENT_LAYERS` at the call site (e.g. the DebugPanel's toggle-name list).
 *
 * ### CONTENT_LAYERS — draw order
 *
 * The first nine entries are additively blended into the HDR `rgba16float`
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
 * The remaining five are premultiplied-OVER overlays, projected through the
 * same cosmological slab but drawn post-tone-map onto the swap chain:
 *
 *  10. selection-ring      — per-galaxy / Milky-Way / structure selection halo
 *  11. disk-radius-ring    — debug: catalog-disk-radius calibration ring
 *  12. marker-lines        — screen-space thick-line overlay (e.g. label stems)
 *  13. labels              — MSDF text labels
 *  14. clip-path-debug     — debug: clip-path inspector route + gizmo
 *
 * The final two rows are the first to leave the cosmological slab entirely —
 * the near-field foreground group, projected through the near0 slab (whose
 * near/far track the camera's orbit distance) so the true-scale bodies are
 * never clipped by the cosmological near plane:
 *
 *  15. debug-spheres       — true-scale Sun / Earth bodies (f64 compose seam),
 *                            opaque (depth-tested) into the `foreground:0` target
 *  16. foreground-labels   — Sun / Earth name captions, premultiplied-OVER onto
 *                            the swap chain post-tone-map (like the COSMO labels,
 *                            but anchored through the near0 vp)
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
 * semantic.  The GPU-timing slot order is derived from the FRAME program +
 * this registry (`TIMED_SLOTS` in `frameProgram.ts`), which the DebugPanel
 * `GpuTimingsSection` iterates, so a reorder here automatically propagates to
 * the timing UI.
 *
 * ### Why no marker-lines / labels in the HDR group
 *
 * Those two are premultiplied-OVER UI overlays mixed in among the
 * additive content pre-unification.  Two problems with that placement:
 *
 *   1. Colour mismatch — LDR-sane label colours (`[1, 1, 1, 1]`) would be
 *      compressed by the tone-map curve to mid-grey, so the UI overlay is
 *      composited after the tone-map instead, as the program's swap
 *      render step (see `executeFrame.ts`).
 *   2. OVER-blend coherency — when timing was enabled (per-pass
 *      split for `timestampWrites`), every `pass.end` stored the HDR
 *      target to DRAM and the next `pass.begin` reloaded it.  On M1
 *      the OVER blends saw partially-coherent `dst.color` and
 *      rendered the marker / label at wrong alpha.  The additive
 *      layers tolerated the same coherency error invisibly because
 *      their blend (`one, one`) doesn't read `dst.color`.
 *
 * Both issues vanish once the OVER overlays live POST-tone-map on
 * the swap chain.  See the swap render step in
 * `services/engine/frame/executeFrame.ts`.
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
import { scalarVolumeLayer } from './scalarVolumeLayer';
import { pointSpritesLayer } from './pointSpritesLayer';
import { proceduralDisksLayer } from './proceduralDisksLayer';
import { texturedDisksLayer } from './texturedDisksLayer';
import { filamentsLayer } from './filamentsLayer';
import { flowFieldLayer } from './flowFieldLayer';
import { volumeUpsampleLayer } from './volumeUpsampleLayer';
import { milkyWayLayer } from './milkyWayLayer';
import { horizonShellLayer } from './horizonShellLayer';
import { structureMarkersLayer } from './structureMarkersLayer';
import { selectionRingLayer } from './selectionRingLayer';
import { diskRadiusRingLayer } from './diskRadiusRingLayer';
import { markerLinesLayer } from './markerLinesLayer';
import { labelsLayer } from './labelsLayer';
import { clipPathDebugLayer } from './clipPathDebugLayer';
import { debugSpheresLayer } from './debugSpheresLayer';
import { foregroundLabelsLayer } from './foregroundLabelsLayer';

/**
 * The flat content-layer registry, in deterministic draw order.  HDR
 * layers (additive, into the HDR offscreen target) lead; the five
 * swap-target layers (premultiplied-OVER, post-tone-map onto the swap
 * chain) follow.  Grouping by target is a `.filter()` at the call site —
 * see the module header.
 */
export const CONTENT_LAYERS: readonly ContentLayer[] = [
  // Half-res scalar-volume raymarch into the volume offscreen — drawn first
  // (its own target), before the hdr group upsamples it in. Not an hdr-group
  // member: it targets 'volume', so the hdr render step excludes it.
  scalarVolumeLayer,
  pointSpritesLayer,
  proceduralDisksLayer,
  texturedDisksLayer,
  milkyWayLayer,
  filamentsLayer,
  flowFieldLayer,
  volumeUpsampleLayer,
  horizonShellLayer,
  structureMarkersLayer,
  // Swap-target rows: post-tone-map, premultiplied-OVER overlays. Selection
  // ring leads so marker-lines and labels composite over its stroke; the
  // debug clip-path overlay trails so its route + gizmo draw on top of
  // everything else.
  selectionRingLayer,
  diskRadiusRingLayer,
  markerLinesLayer,
  labelsLayer,
  clipPathDebugLayer,
  // Near-field foreground group: the true-scale bodies (Sun, Earth) drawn
  // into the depth-bearing 'foreground:0' target through the near0 slab.
  // Registered after the swap group — position only affects timing-slot
  // listing, since no other layer shares its (target, slab). Inert until the
  // frame program appends the foreground render step (task 7).
  debugSpheresLayer,
  // Near-field captions: the Sun/Earth name labels drawn OVER onto the swap
  // chain through the near0 slab. Registered after debug-spheres; like it,
  // inert until the frame program appends the (swap, NEAR0) render step (task
  // 7) — the existing (swap, COSMO) step selects nothing here by construction.
  foregroundLabelsLayer,
];

export { scalarVolumeLayer } from './scalarVolumeLayer';
export { pointSpritesLayer } from './pointSpritesLayer';
export { proceduralDisksLayer } from './proceduralDisksLayer';
export { texturedDisksLayer } from './texturedDisksLayer';
export { filamentsLayer } from './filamentsLayer';
export { flowFieldLayer } from './flowFieldLayer';
export { volumeUpsampleLayer } from './volumeUpsampleLayer';
export { milkyWayLayer } from './milkyWayLayer';
export { horizonShellLayer } from './horizonShellLayer';
export { structureMarkersLayer } from './structureMarkersLayer';
export { selectionRingLayer } from './selectionRingLayer';
export { diskRadiusRingLayer } from './diskRadiusRingLayer';
export { markerLinesLayer } from './markerLinesLayer';
export { labelsLayer } from './labelsLayer';
export { clipPathDebugLayer } from './clipPathDebugLayer';
export { debugSpheresLayer } from './debugSpheresLayer';
export { foregroundLabelsLayer } from './foregroundLabelsLayer';
