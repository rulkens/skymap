/**
 * passes/index — the contributed-pass registry: the flat list of every
 * `ContentPass` the renderer can draw. It states no order — `FRAME_ORDER`
 * (`frameOrder.ts`) is the one artifact naming what draws, in what order, into
 * what, and carries the ordering rationale beside the line it explains.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { scalarVolumePass } from './scalarVolumePass';
import { galaxyPointSpritesPass } from './galaxyPointSpritesPass';
import { proceduralDisksPass } from './proceduralDisksPass';
import { texturedDisksPass } from './texturedDisksPass';
import { filamentsPass } from './filamentsPass';
import { flowFieldPass } from './flowFieldPass';
import { volumeUpsamplePass } from './volumeUpsamplePass';
import { milkyWayPass } from './milkyWayPass';
import { milkyWayAggregatePass } from './milkyWayAggregatePass';
import { milkyWayUpsamplePass } from './milkyWayUpsamplePass';
import { horizonShellPass } from './horizonShellPass';
import { zoneOfAvoidancePass } from './zoneOfAvoidancePass';
import { zoneOfAvoidanceUpsamplePass } from './zoneOfAvoidanceUpsamplePass';
import { structureMarkersPass } from './structureMarkersPass';
import { selectionRingPass } from './selectionRingPass';
import { near0SelectionRingPass } from './near0SelectionRingPass';
import { diskRadiusRingPass } from './diskRadiusRingPass';
import { markerLinesPass } from './markerLinesPass';
import { labelsPass } from './labelsPass';
import { clipPathDebugPass } from './clipPathDebugPass';
import { earthPass } from './earthPass';
import { cloudShellPass } from './cloudShellPass';
import { starSpheresPass } from './starSpheresPass';
import { fieldStarSpherePass } from './fieldStarSpherePass';
import { planetsPass } from './planetsPass';
import { texturedBodiesPass } from './texturedBodiesPass';
import { ringsPass } from './ringsPass';
import { starPointsPass } from './starPointsPass';
import { bodyGlintsPass } from './bodyGlintsPass';
import { starCatalogPass } from './starCatalogPass';
import { starAggregatesPass } from './starAggregatesPass';
import { starAggregateUpsamplePass } from './starAggregateUpsamplePass';
import { constellationsPass } from './constellationsPass';
import { orbitTrailsPass } from './orbitTrailsPass';
import { foregroundLabelsPass } from './foregroundLabelsPass';
import { atmosphereShellPass } from './atmosphereShellPass';
import { sgrAStarLensingPass } from './sgrAStarLensingPass';

/**
 * The flat content-layer registry, in deterministic draw order.  HDR
 * layers (additive, into the HDR offscreen target) lead; the five
 * swap-target layers (premultiplied-OVER, post-tone-map onto the swap
 * chain) follow.  Grouping by target is a `.filter()` at the call site —
 * see the module header.
 */
export const CONTENT_PASSES: readonly ContentPass[] = [
  // Half-res scalar-volume raymarch into the volume offscreen — drawn first
  // (its own target), before the hdr group upsamples it in. Not an hdr-group
  // member: it targets 'volume', so the hdr render step excludes it.
  scalarVolumePass,
  galaxyPointSpritesPass,
  // The zone-of-avoidance band's PRODUCER: `FRAME_ORDER` draws it into its own
  // reduced-res 'zoa' target, so its position in this array carries nothing.
  zoneOfAvoidancePass,
  proceduralDisksPass,
  texturedDisksPass,
  filamentsPass,
  flowFieldPass,
  volumeUpsamplePass,
  // The zone-of-avoidance band's CONSUMER: composites 'zoa' into hdr, then
  // draws the full-res lettering — positioned beside volume-upsample, its
  // closest sibling in shape (a reduced-res-offscreen-into-hdr composite).
  zoneOfAvoidanceUpsamplePass,
  horizonShellPass,
  structureMarkersPass,
  // The near-field NEAR0 rows: they project through NEAR0 (COSMO's fixed near
  // plane would clip their kpc-to-AU scale anchors), drawn AFTER the eight COSMO
  // hdr layers above and before the tone-map — so the HDR-target members ride
  // the same tone curve as the galaxies. Milky Way FIRST — its dust pass is
  // multiplicative, and leading the group keeps the local starfield below out of
  // that multiply (see the header) — then the survey (Gaia bin) star streams and
  // the constellation figures: the whole additive "sky" roster the Sgr A* lens
  // pass (below) samples. `orbit-trails`/`body-glints` trail LAST in this group,
  // after the lens pass's own step, so they stay unwarped over it (spec "Draw
  // order", Q5) rather than sitting among the roster they used to interleave
  // with. All the HDR members here are additive, so their relative order among
  // THEMSELVES is a listing choice, not a compositing one — with the one
  // exception noted on the Milky Way rows below.
  //
  // The Milky Way cloud is three rows, and their order IS load-bearing. The
  // star billboards draw into the reduced-resolution `mw-aggregate` offscreen
  // by their own render step (a different target, so their position here is a
  // listing choice); `milky-way-upsample` then composites that offscreen into
  // HDR; and only then does `milky-way`'s MULTIPLICATIVE dust pass run, so the
  // dust darkens the cloud's own starlight as well as the cosmological
  // accumulation — exactly what the single-pass version did when stars and dust
  // shared one encoder. Swapping the last two would leave the cloud's stars
  // un-extincted.
  milkyWayAggregatePass,
  milkyWayUpsamplePass,
  milkyWayPass,
  starPointsPass,
  // The survey (Gaia bin) stars split into two streams sharing one per-frame
  // walk: the AGGREGATE glow field draws LINEAR into the half-res
  // `star-aggregates` offscreen by its OWN render step (so its position here is
  // a listing choice — a different target); the `star-catalog` LEAF dots draw
  // full-res into HDR; then `star-upsample` composites the offscreen back in
  // with the knee applied to the summed field. star-upsample sits adjacent to
  // the leaf draw for GPU-timing legibility (additive order is commutative).
  starAggregatesPass,
  starCatalogPass,
  starAggregateUpsamplePass,
  // Constellation stick figures — additive line segments between the real stars,
  // through NEAR0 into HDR, so they ride the same tone-map as the stars they
  // connect and join the existing (hdr, NEAR0) render step. Drawn after the star
  // streams so the figure lines read over the starfield; additive blend makes
  // that a listing choice, not a compositing one. The LAST roster row the Sgr
  // A* lens pass samples (below).
  constellationsPass,
  // The Sgr A* lens pass: a 'body'-slab row, blend 'over'
  // (Blend.d.ts) rather than additive like its neighbours, so — unlike the
  // additive rows around it — its position IS load-bearing: it must draw AFTER
  // every roster row above (so its captured/escaping rays occlude the additive
  // light already accumulated behind them) and BEFORE orbit-trails/body-glints
  // below (so those stay unwarped on top, spec "Draw order", Q5). Registry
  // order alone can't enforce this against `orbit-trails`/`body-glints` — they
  // share this SAME (hdr, NEAR0) render step with the roster above. The real
  // enforcement is `FRAME_ORDER`, which draws them on their own lines after
  // this row's `lens` line; this array position stays the documentation of
  // the intent.
  sgrAStarLensingPass,
  orbitTrailsPass,
  // The sub-pixel bodies (the glints branch of the body partition) as
  // brightness-scaled additive points — the far half of the body LOD, sibling of
  // star-points. Additive into HDR through NEAR0, so its position among the
  // additive rows is a listing choice, not a compositing one.
  bodyGlintsPass,
  // Swap-target rows: post-tone-map, premultiplied-OVER overlays. Selection
  // ring leads so marker-lines and labels composite over its stroke; the debug
  // clip-path overlay is the very last swap row (below, past the NEAR0 group) so
  // its route + gizmo draw on top of everything else.
  selectionRingPass,
  // The NEAR0 sibling of selection-ring: same shared renderer + `selectionHalo`
  // gate, but projected through the near0 slab (with the f64 rebase the other
  // NEAR0 rows do) so a picked star — whose parsec-scale anchor COSMO's fixed
  // near plane would clip — rings cleanly. Each ring lands only in the slab
  // whose frustum contains its anchor, so the two identical gates never
  // double-draw. Ordered right after its COSMO sibling for legibility.
  near0SelectionRingPass,
  diskRadiusRingPass,
  markerLinesPass,
  labelsPass,
  // Near-field foreground group: the true-scale bodies drawn into the
  // depth-bearing 'foreground:0' target through the near0 slab, all riding
  // the single (foreground:0, NEAR0) render step. Registered after the swap
  // group — position only affects timing-slot listing, since no other group
  // shares this (target, slab). Order within the group is depth-tested
  // opaque, so it's a listing choice, not a compositing one.
  earthPass,
  // Earth's translucent cloud deck: drawn immediately AFTER earth (so it
  // depth-tests against the opaque surface, far hemisphere occluded) and BEFORE
  // plan E's atmosphereShellPass (which lands after this row, drawn last),
  // writing no depth and blending straight-alpha OVER.
  cloudShellPass,
  starSpheresPass,
  // The near field star's close-range sphere: a thin proximity-driven sibling
  // reusing the same star renderer + f64 compose seam as star-spheres, but
  // scoped to the ONE nearest resolvable Gaia star at close range (its presence
  // is derived from where the camera is, not from selection). Order within this
  // opaque depth-tested group is a listing choice — placed right after
  // star-spheres for legibility.
  fieldStarSpherePass,
  planetsPass,
  texturedBodiesPass,
  // Saturn's rings: the translucent overlay half of the ring system, drawn LAST
  // in the (foreground:0, NEAR0) group so it depth-tests against the opaque
  // spheres already stamped there (far ring half occluded), writing no depth and
  // blending straight-alpha OVER — the one blend exception in the otherwise
  // opaque foreground group (spec §8).
  ringsPass,
  // Near-field captions: the scene-body name labels drawn OVER onto the swap
  // chain through the near0 slab. The frame program's (swap, NEAR0) render
  // step drives it — the (swap, COSMO) step selects nothing here by
  // construction.
  foregroundLabelsPass,
  // The clip-path inspector overlay: a debug swap row projected through NEAR0
  // (so a near-field route — Earth-to-parsec — clears COSMO's 10 kpc near plane;
  // see the layer header). Listed LAST among the (swap, NEAR0) rows so its route
  // + gizmo draw on top of every other overlay, the same "trails everything"
  // intent it had as a COSMO row. `atmosphereShellPass` below is (foreground:0,
  // NEAR0), a step the frame program runs BEFORE the swap overlays, so this stays
  // the last thing painted.
  clipPathDebugPass,
  // Earth's in-scatter atmosphere: the LAST content-layer row (spec §8.3),
  // drawn LAST within the (foreground:0, NEAR0) group so it depth-tests against
  // every opaque sphere AND the rings/cloud-shell already stamped there (limb
  // over space passes, over-disc occluded), writing no depth and blending
  // straight-alpha OVER — the outermost translucent shell of the foreground
  // group. Non-adjacent to the cloud-shell it sits outside of: the opaque
  // spheres + rings draw between them. Its sky-view LUT is baked each frame by
  // the atmosphereSkyView compute step (compute prelude), before this draw.
  atmosphereShellPass,
];

export { scalarVolumePass } from './scalarVolumePass';
export { galaxyPointSpritesPass } from './galaxyPointSpritesPass';
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedDisksPass } from './texturedDisksPass';
export { filamentsPass } from './filamentsPass';
export { flowFieldPass } from './flowFieldPass';
export { volumeUpsamplePass } from './volumeUpsamplePass';
export { milkyWayPass } from './milkyWayPass';
export { milkyWayAggregatePass } from './milkyWayAggregatePass';
export { milkyWayUpsamplePass } from './milkyWayUpsamplePass';
export { horizonShellPass } from './horizonShellPass';
export { zoneOfAvoidancePass } from './zoneOfAvoidancePass';
export { zoneOfAvoidanceUpsamplePass } from './zoneOfAvoidanceUpsamplePass';
export { structureMarkersPass } from './structureMarkersPass';
export { selectionRingPass } from './selectionRingPass';
export { near0SelectionRingPass } from './near0SelectionRingPass';
export { diskRadiusRingPass } from './diskRadiusRingPass';
export { markerLinesPass } from './markerLinesPass';
export { labelsPass } from './labelsPass';
export { clipPathDebugPass } from './clipPathDebugPass';
export { earthPass } from './earthPass';
export { cloudShellPass } from './cloudShellPass';
export { starSpheresPass } from './starSpheresPass';
export { fieldStarSpherePass } from './fieldStarSpherePass';
export { planetsPass } from './planetsPass';
export { texturedBodiesPass } from './texturedBodiesPass';
export { ringsPass } from './ringsPass';
export { starPointsPass } from './starPointsPass';
export { bodyGlintsPass } from './bodyGlintsPass';
export { sgrAStarLensingPass } from './sgrAStarLensingPass';
export { starCatalogPass } from './starCatalogPass';
export { starAggregatesPass } from './starAggregatesPass';
export { starAggregateUpsamplePass } from './starAggregateUpsamplePass';
export { constellationsPass } from './constellationsPass';
export { orbitTrailsPass } from './orbitTrailsPass';
export { foregroundLabelsPass } from './foregroundLabelsPass';
export { atmosphereShellPass } from './atmosphereShellPass';
