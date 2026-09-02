/**
 * passes/index — the content-layer registry.
 *
 * `CONTENT_LAYERS` is the flat, ordered list of every `ContentLayer` the
 * renderer draws — the additive-into-HDR layers, the premultiplied-OVER
 * swap-chain overlays, and the near-field groups.  It replaces the two `Pass[]`
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
 *   4. filaments           — cosmic-web skeleton overlay
 *   5. flow                — CF4++ peculiar-velocity ribbon overlay
 *   6. volume-upsample     — upsamples the half-res volume offscreen target
 *                            into the HDR target (when active fields exist)
 *   7. zone-of-avoidance-upsample — upsamples the 1/5-res zone-of-avoidance
 *                            band offscreen into HDR, then draws the band's
 *                            full-res curved lettering (its producer,
 *                            zone-of-avoidance, targets its own 'zoa' row —
 *                            see below, same reason scalar-volume isn't here)
 *   8. horizon-shell       — translucent sphere at the observable-universe edge
 *   9. structure-markers   — at-rest halo + ring for cluster / SC / void structures
 *
 * Nine more near-field rows follow, projected through the near0 slab (COSMO's
 * fixed near plane would clip their kpc-to-AU-scale anchors). Seven accumulate
 * into the HDR target via the shared `(hdr, NEAR0)` render step (milky-way,
 * star-points, star-catalog, star-upsample, constellations, orbit-trails,
 * body-glints); `star-aggregates` has its OWN `(star-aggregates, NEAR0)` render
 * step into the half-res offscreen `star-upsample` composites back, and
 * `sgr-a-star-lensing` has its OWN `(hdr, BODY[k])` render step. Its
 * position below is registry-order documentation for items 10-15 — but for
 * orbit-trails/body-glints (17/17b) the ordering IS enforced, by
 * `ContentLayer.hdrPostLensing` splitting the shared `(hdr, NEAR0)` step
 * around the lens step whenever the band is active; see
 * `frameProgram.ts`:
 *
 *  10. milky-way           — star/dust point cloud at the galactic centre
 *                            (the fixed 10 kpc COSMO near plane clipped the
 *                            disc mid-descent; drawn FIRST in the group so
 *                            its multiplicative dust never darkens the local
 *                            starfield below)
 *  11. star-points         — the unresolved partition of the neighbourhood
 *                            stars (partitionStarsByResolution) as additive
 *                            point sprites, riding the same tone-map as the
 *                            galaxies
 *  12. star-aggregates     — the survey (Gaia bin) AGGREGATE stream (interior
 *                            flux-mip glows), drawn LINEAR into the half-res
 *                            `star-aggregates` offscreen by its own render step
 *                            (the fill-bound half of the star pass)
 *  13. star-catalog        — the survey LEAF stream (real point-source stars),
 *                            drawn full-res into HDR as a per-frame flux-mip
 *                            cut of additive point sprites (f64 rebase seam),
 *                            crossfading to the procedural Milky-Way cloud
 *  14. star-upsample       — composites the half-res `star-aggregates` offscreen
 *                            back into HDR, applying the hue-preserving knee to
 *                            the summed aggregate field (the LOD-symmetry fix)
 *  15. constellations      — additive stick-figure lines between the real stars,
 *                            drawn after the star streams so the figures read
 *                            over the starfield; the LAST roster row the lens
 *                            pass below samples
 *  16. sgr-a-star-lensing  — the black-hole lens pass (Tasks 13-14): a `body`-slab
 *                            row drawing ONLY on Sgr A*'s own row, PREMULTIPLIED
 *                            OVER (not additive) into hdr — captured rays occlude
 *                            the additive roster light already accumulated behind
 *                            them; escaping rays sample the sky-cubemap
 *                            bent by the deflection LUT. Its OWN `(hdr, BODY[k])`
 *                            step (`frameProgram.ts`) runs after the `(hdr,
 *                            NEAR0)` roster step above so it draws over items
 *                            10-15
 *  17. orbit-trails        — accurate Keplerian orbit trails (Earth / Jupiter /
 *                            Moon, and the 39 bound S-stars orbiting Sgr A*
 *                            itself) as screen-space conics with a brightness
 *                            lobe at the body's position (f64 compose seam);
 *                            opts into the lens's `'post'` split half
 *                            (`hdrPostLensing`) so it draws unwarped over the
 *                            lens pass whenever the band is active, per spec
 *                            "Draw order"
 *  17b. body-glints        — the sub-pixel bodies (the glints branch of the body
 *                            partition) as brightness-scaled additive points
 *                            (size x albedo x phase, cross-fading with the mesh
 *                            over 1-3 px), sibling of star-points (f64 rebase
 *                            seam); opts into the lens's `'post'` split half
 *                            for the same reason
 *  17c. s-star-lensed-images — the S-stars' analytically lensed images, drawn
 *                            through the same point renderer on the lens's
 *                            `'post'` half; the sky cubemap the lens samples is
 *                            an at-infinity approximation these sources are far
 *                            too close for (see the layer header)
 *
 * The next six are premultiplied-OVER overlays, projected through the
 * cosmological slab (except near0-selection-ring, which rides near0) and drawn
 * post-tone-map onto the swap chain:
 *
 *  18. selection-ring      — per-galaxy / Milky-Way / structure selection halo
 *                            (COSMO slab)
 *  19. near0-selection-ring — the same halo for a NEAR0-slab pick (a survey
 *                            star): shared renderer + selectionHalo gate,
 *                            projected through near0 with the f64 rebase seam
 *  20. disk-radius-ring    — debug: catalog-disk-radius calibration ring
 *  21. marker-lines        — screen-space thick-line overlay (e.g. label stems)
 *  22. labels              — MSDF text labels
 *  23. clip-path-debug     — debug: clip-path inspector route + gizmo
 *
 * The final rows leave the cosmological slab entirely — the near-field
 * foreground group, projected through the near0 slab (whose near/far track
 * the camera's orbit distance) so the true-scale bodies are never clipped by
 * the cosmological near plane:
 *
 *  24. earth               — true-scale Blue-Marble-textured Earth (f64 compose
 *                            seam), opaque (depth-tested) into the `foreground:0`
 *                            target
 *  25. cloud-shell         — Earth's translucent cloud deck, drawn right after
 *                            the opaque surface so it depth-tests against it (far
 *                            hemisphere occluded), writing no depth and blending
 *                            straight-alpha OVER (like the ring — a blend
 *                            exception in the otherwise opaque foreground group)
 *  26. star-spheres        — the resolved partition of the stars (the Sun +
 *                            any star crossing STAR_RESOLVE_PX) as true-scale
 *                            flat-emissive spheres (f64 compose seam), opaque
 *                            into the same `foreground:0` target
 *  27. field-star-sphere  — the close-range sphere for the ONE nearest
 *                            resolvable Gaia field star (presence derived from
 *                            proximity, not selection), reusing the same star
 *                            renderer + f64 compose seam, opaque into the same
 *                            target
 *  28. planets             — the flat branch of the body partition: resolved
 *                            bodies without a resident surface texture, as
 *                            true-scale flat-lit albedo spheres (f64 compose
 *                            seam), opaque into the same target
 *  29. textured-bodies     — the textured branch of the body partition: resolved
 *                            bodies whose surface texture is resident, as lit
 *                            surface-mapped spheres (Saturn's ring casts an
 *                            analytic on-planet shadow); opaque into the same
 *                            target (f64 compose seam)
 *  30. rings               — Saturn's translucent ring overlay, drawn LAST in the
 *                            (foreground:0, NEAR0) group so it depth-tests against
 *                            the opaque spheres already stamped there (far ring
 *                            half occluded), writing no depth and blending
 *                            straight-alpha OVER — like cloud-shell, a blend
 *                            exception in the otherwise opaque foreground group
 *  31. foreground-labels   — scene-body name captions, premultiplied-OVER onto
 *                            the swap chain post-tone-map (like the COSMO labels,
 *                            but anchored through the near0 vp)
 *  32. atmosphere-shell    — Earth's physically-based in-scatter atmosphere,
 *                            the LAST content-layer row (spec §8.3): a
 *                            translucent proxy sphere at the atmosphere-top
 *                            radius, drawn last in the (foreground:0, NEAR0)
 *                            group so it depth-tests against every opaque
 *                            sphere AND the rings/cloud-shell already stamped
 *                            there — limb over space passes, over-disc is
 *                            occluded — writing no depth and blending
 *                            straight-alpha OVER (non-pickable). Its sky-view
 *                            LUT is baked each frame by the atmosphereSkyView
 *                            compute step in the compute prelude, so the shell
 *                            samples this frame's table
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
 * ### Why milky-way LEADS the (hdr, NEAR0) group
 *
 * The Milky Way rode the COSMO group until its fixed 10 kpc near plane
 * clipped the disc mid-descent (the disc's near edge is ~9.5 kpc from
 * the origin) — see milkyWayLayer's module header.  Living in the NEAR0
 * step means the whole cloud now draws AFTER the cosmological group, so
 * its multiplicative dust pass darkens the full COSMO accumulation behind
 * it (physically reasonable extinction of background light).  Within the
 * NEAR0 group it draws FIRST so the local starfield (star-points /
 * star-catalog) is never darkened by the dust — during the descent those
 * stars sit between the camera and the disc.
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
import { galaxyPointSpritesLayer } from './galaxyPointSpritesLayer';
import { proceduralDisksLayer } from './proceduralDisksLayer';
import { texturedDisksLayer } from './texturedDisksLayer';
import { filamentsLayer } from './filamentsLayer';
import { flowFieldLayer } from './flowFieldLayer';
import { volumeUpsampleLayer } from './volumeUpsampleLayer';
import { milkyWayLayer } from './milkyWayLayer';
import { milkyWayAggregateLayer } from './milkyWayAggregateLayer';
import { milkyWayUpsampleLayer } from './milkyWayUpsampleLayer';
import { horizonShellLayer } from './horizonShellLayer';
import { zoneOfAvoidanceLayer } from './zoneOfAvoidanceLayer';
import { zoneOfAvoidanceUpsampleLayer } from './zoneOfAvoidanceUpsampleLayer';
import { structureMarkersLayer } from './structureMarkersLayer';
import { selectionRingLayer } from './selectionRingLayer';
import { near0SelectionRingLayer } from './near0SelectionRingLayer';
import { diskRadiusRingLayer } from './diskRadiusRingLayer';
import { markerLinesLayer } from './markerLinesLayer';
import { labelsLayer } from './labelsLayer';
import { clipPathDebugLayer } from './clipPathDebugLayer';
import { earthLayer } from './earthLayer';
import { cloudShellLayer } from './cloudShellLayer';
import { starSpheresLayer } from './starSpheresLayer';
import { fieldStarSphereLayer } from './fieldStarSphereLayer';
import { planetsLayer } from './planetsLayer';
import { texturedBodiesLayer } from './texturedBodiesLayer';
import { ringsLayer } from './ringsLayer';
import { starPointsLayer } from './starPointsLayer';
import { bodyGlintsLayer } from './bodyGlintsLayer';
import { sStarLensedImagesLayer } from './sStarLensedImagesLayer';
import { starCatalogLayer } from './starCatalogLayer';
import { starAggregatesLayer } from './starAggregatesLayer';
import { starAggregateUpsampleLayer } from './starAggregateUpsampleLayer';
import { constellationsLayer } from './constellationsLayer';
import { orbitTrailsLayer } from './orbitTrailsLayer';
import { foregroundLabelsLayer } from './foregroundLabelsLayer';
import { atmosphereShellLayer } from './atmosphereShellLayer';
import { sgrAStarLensingLayer } from './sgrAStarLensingLayer';

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
  galaxyPointSpritesLayer,
  // The zone-of-avoidance band's PRODUCER: its own reduced-res 'zoa'
  // target keeps it out of every VISUAL group's filter regardless of array
  // position (frameProgram.ts hand-orders render steps independently of
  // this registry) — but the PICK program groups by slab alone and walks
  // this array's order within a slab, so this row's `drawPick` DOES care:
  // it must sit after `galaxyPointSpritesLayer`, which establishes the COSMO pick
  // pass's shared @group(0) camera every other COSMO drawPick relies on.
  zoneOfAvoidanceLayer,
  proceduralDisksLayer,
  texturedDisksLayer,
  filamentsLayer,
  flowFieldLayer,
  volumeUpsampleLayer,
  // The zone-of-avoidance band's CONSUMER: composites 'zoa' into hdr, then
  // draws the full-res lettering — positioned beside volume-upsample, its
  // closest sibling in shape (a reduced-res-offscreen-into-hdr composite).
  zoneOfAvoidanceUpsampleLayer,
  horizonShellLayer,
  structureMarkersLayer,
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
  milkyWayAggregateLayer,
  milkyWayUpsampleLayer,
  milkyWayLayer,
  starPointsLayer,
  // The survey (Gaia bin) stars split into two streams sharing one per-frame
  // walk: the AGGREGATE glow field draws LINEAR into the half-res
  // `star-aggregates` offscreen by its OWN render step (so its position here is
  // a listing choice — a different target); the `star-catalog` LEAF dots draw
  // full-res into HDR; then `star-upsample` composites the offscreen back in
  // with the knee applied to the summed field. star-upsample sits adjacent to
  // the leaf draw for GPU-timing legibility (additive order is commutative).
  starAggregatesLayer,
  starCatalogLayer,
  starAggregateUpsampleLayer,
  // Constellation stick figures — additive line segments between the real stars,
  // through NEAR0 into HDR, so they ride the same tone-map as the stars they
  // connect and join the existing (hdr, NEAR0) render step. Drawn after the star
  // streams so the figure lines read over the starfield; additive blend makes
  // that a listing choice, not a compositing one. The LAST roster row the Sgr
  // A* lens pass samples (below).
  constellationsLayer,
  // The Sgr A* lens pass: a 'body'-slab row, blend 'over'
  // (Blend.d.ts) rather than additive like its neighbours, so — unlike the
  // additive rows around it — its position IS load-bearing: it must draw AFTER
  // every roster row above (so its captured/escaping rays occlude the additive
  // light already accumulated behind them) and BEFORE orbit-trails/body-glints
  // below (so those stay unwarped on top, spec "Draw order", Q5). Registry
  // order alone can't enforce this against `orbit-trails`/`body-glints` — they
  // share this SAME (hdr, NEAR0) render step with the roster above. The real
  // enforcement is `ContentLayer.hdrPostLensing`: those
  // two opt in, so `frameProgram` splits the shared step into `'pre'`/`'post'`
  // halves around this row's own `(hdr, BODY[k])` step whenever the band is
  // active (see its module header); this array position stays the
  // documentation of the intent, registry order deciding each half's internal
  // ordering.
  sgrAStarLensingLayer,
  orbitTrailsLayer,
  // The sub-pixel bodies (the glints branch of the body partition) as
  // brightness-scaled additive points — the far half of the body LOD, sibling of
  // star-points. Additive into HDR through NEAR0, so its position among the
  // additive rows is a listing choice, not a compositing one.
  bodyGlintsLayer,
  // The S-stars' lensed images, on the lens's `'post'` half like the two rows
  // above and for the same reason — an OVER blend would wipe them. Listed after
  // body-glints so the images read over the far-field glint marking the hole.
  sStarLensedImagesLayer,
  // Swap-target rows: post-tone-map, premultiplied-OVER overlays. Selection
  // ring leads so marker-lines and labels composite over its stroke; the debug
  // clip-path overlay is the very last swap row (below, past the NEAR0 group) so
  // its route + gizmo draw on top of everything else.
  selectionRingLayer,
  // The NEAR0 sibling of selection-ring: same shared renderer + `selectionHalo`
  // gate, but projected through the near0 slab (with the f64 rebase the other
  // NEAR0 rows do) so a picked star — whose parsec-scale anchor COSMO's fixed
  // near plane would clip — rings cleanly. Each ring lands only in the slab
  // whose frustum contains its anchor, so the two identical gates never
  // double-draw. Ordered right after its COSMO sibling for legibility.
  near0SelectionRingLayer,
  diskRadiusRingLayer,
  markerLinesLayer,
  labelsLayer,
  // Near-field foreground group: the true-scale bodies drawn into the
  // depth-bearing 'foreground:0' target through the near0 slab, all riding
  // the single (foreground:0, NEAR0) render step. Registered after the swap
  // group — position only affects timing-slot listing, since no other group
  // shares this (target, slab). Order within the group is depth-tested
  // opaque, so it's a listing choice, not a compositing one.
  earthLayer,
  // Earth's translucent cloud deck: drawn immediately AFTER earth (so it
  // depth-tests against the opaque surface, far hemisphere occluded) and BEFORE
  // plan E's atmosphereShellLayer (which lands after this row, drawn last),
  // writing no depth and blending straight-alpha OVER.
  cloudShellLayer,
  starSpheresLayer,
  // The near field star's close-range sphere: a thin proximity-driven sibling
  // reusing the same star renderer + f64 compose seam as star-spheres, but
  // scoped to the ONE nearest resolvable Gaia star at close range (its presence
  // is derived from where the camera is, not from selection). Order within this
  // opaque depth-tested group is a listing choice — placed right after
  // star-spheres for legibility.
  fieldStarSphereLayer,
  planetsLayer,
  texturedBodiesLayer,
  // Saturn's rings: the translucent overlay half of the ring system, drawn LAST
  // in the (foreground:0, NEAR0) group so it depth-tests against the opaque
  // spheres already stamped there (far ring half occluded), writing no depth and
  // blending straight-alpha OVER — the one blend exception in the otherwise
  // opaque foreground group (spec §8).
  ringsLayer,
  // Near-field captions: the scene-body name labels drawn OVER onto the swap
  // chain through the near0 slab. The frame program's (swap, NEAR0) render
  // step drives it — the (swap, COSMO) step selects nothing here by
  // construction.
  foregroundLabelsLayer,
  // The clip-path inspector overlay: a debug swap row projected through NEAR0
  // (so a near-field route — Earth-to-parsec — clears COSMO's 10 kpc near plane;
  // see the layer header). Listed LAST among the (swap, NEAR0) rows so its route
  // + gizmo draw on top of every other overlay, the same "trails everything"
  // intent it had as a COSMO row. `atmosphereShellLayer` below is (foreground:0,
  // NEAR0), a step the frame program runs BEFORE the swap overlays, so this stays
  // the last thing painted.
  clipPathDebugLayer,
  // Earth's in-scatter atmosphere: the LAST content-layer row (spec §8.3),
  // drawn LAST within the (foreground:0, NEAR0) group so it depth-tests against
  // every opaque sphere AND the rings/cloud-shell already stamped there (limb
  // over space passes, over-disc occluded), writing no depth and blending
  // straight-alpha OVER — the outermost translucent shell of the foreground
  // group. Non-adjacent to the cloud-shell it sits outside of: the opaque
  // spheres + rings draw between them. Its sky-view LUT is baked each frame by
  // the atmosphereSkyView compute step (compute prelude), before this draw.
  atmosphereShellLayer,
];

export { scalarVolumeLayer } from './scalarVolumeLayer';
export { galaxyPointSpritesLayer } from './galaxyPointSpritesLayer';
export { proceduralDisksLayer } from './proceduralDisksLayer';
export { texturedDisksLayer } from './texturedDisksLayer';
export { filamentsLayer } from './filamentsLayer';
export { flowFieldLayer } from './flowFieldLayer';
export { volumeUpsampleLayer } from './volumeUpsampleLayer';
export { milkyWayLayer } from './milkyWayLayer';
export { milkyWayAggregateLayer } from './milkyWayAggregateLayer';
export { milkyWayUpsampleLayer } from './milkyWayUpsampleLayer';
export { horizonShellLayer } from './horizonShellLayer';
export { zoneOfAvoidanceLayer } from './zoneOfAvoidanceLayer';
export { zoneOfAvoidanceUpsampleLayer } from './zoneOfAvoidanceUpsampleLayer';
export { structureMarkersLayer } from './structureMarkersLayer';
export { selectionRingLayer } from './selectionRingLayer';
export { near0SelectionRingLayer } from './near0SelectionRingLayer';
export { diskRadiusRingLayer } from './diskRadiusRingLayer';
export { markerLinesLayer } from './markerLinesLayer';
export { labelsLayer } from './labelsLayer';
export { clipPathDebugLayer } from './clipPathDebugLayer';
export { earthLayer } from './earthLayer';
export { cloudShellLayer } from './cloudShellLayer';
export { starSpheresLayer } from './starSpheresLayer';
export { fieldStarSphereLayer } from './fieldStarSphereLayer';
export { planetsLayer } from './planetsLayer';
export { texturedBodiesLayer } from './texturedBodiesLayer';
export { ringsLayer } from './ringsLayer';
export { starPointsLayer } from './starPointsLayer';
export { bodyGlintsLayer } from './bodyGlintsLayer';
export { sStarLensedImagesLayer } from './sStarLensedImagesLayer';
export { sgrAStarLensingLayer } from './sgrAStarLensingLayer';
export { starCatalogLayer } from './starCatalogLayer';
export { starAggregatesLayer } from './starAggregatesLayer';
export { starAggregateUpsampleLayer } from './starAggregateUpsampleLayer';
export { constellationsLayer } from './constellationsLayer';
export { orbitTrailsLayer } from './orbitTrailsLayer';
export { foregroundLabelsLayer } from './foregroundLabelsLayer';
export { atmosphereShellLayer } from './atmosphereShellLayer';
