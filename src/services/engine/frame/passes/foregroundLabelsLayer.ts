/**
 * foregroundLabelsLayer — name captions for the true-scale foreground bodies.
 *
 * A near-field sibling of `labelsLayer` that draws a SECOND MSDF label
 * renderer (`state.gpu.foregroundLabelRenderer`) holding the scene-body
 * captions (`sceneBodyLabels` — Earth, the local star map, the planets). It
 * exists as its own row because the two label sets can't share one draw
 * call: one renderer draws with one view-projection, and these two project
 * through different slabs.
 *
 *   - The main labels (galaxies, structures, Milky Way) project through the
 *     COSMO slab, whose near plane sits at 10 kpc — so the Sun and Earth, which
 *     sit ~1 AU from the camera at solar-system zoom, fall inside it and get
 *     clipped away entirely.
 *   - These captions project through the NEAR0 slab, whose near/far track the
 *     camera's orbit distance, so the bodies are always comfortably in range.
 *
 * Both target the swap chain with premultiplied-OVER blending (UI overlay,
 * drawn post-tone-map) — the ONLY axis on which this row differs from
 * `labelsLayer` is its slab, which is exactly why it's a separate row rather
 * than a branch inside one.
 *
 * ### The constellation figure names ride here too
 *
 * The true-3D constellation NAMES (`constellationCaptions`) join this row for
 * the SAME slab reason. Their anchors sit at parsec distances, inside the COSMO
 * near plane, so the main director could never draw them — but on NEAR0 they
 * project fine. They fold into the one entry pipeline below beside the scene
 * bodies: their fade TARGET is `constellationLayerOpacity` (the distance band ×
 * the fade-registry toggle — the same one home the stick-figure pass reads, so
 * names dissolve in lock-step with the lines), and they contend in the shared
 * declutter at the lowest tier. Unlike a body caption they anchor in EMPTY
 * SPACE at a figure centroid, so they take no leader-line lift — pass 2 emits
 * them forward-projected directly (the overlay shader's clip-z clamp keeps
 * them drawing past the adaptive far plane).
 *
 * ### Why a SECOND marker-line renderer for the leader lines
 *
 * Each caption hangs off its body on a short leader line — the famous-galaxy
 * treatment (`liftedLabelPlacement`), brought to the foreground so a scene-body
 * name reads like a nearby galaxy label instead of a tiny tag painted over the
 * body. Those connectors draw through `state.gpu.foregroundMarkerLineRenderer`,
 * a SEPARATE `createMarkerLineRenderer` instance from the director's
 * `markerLineRenderer` — for the identical reason the captions use a second
 * label renderer. The director's lines project through the galaxy-scale COSMO
 * `vp`, whose 10-kpc near plane clips the AU-scale bodies away; these connectors
 * must project through the NEAR0 slab so they track the bodies, and one renderer
 * draws with one view-projection. So the split is the same slab tension, not a
 * duplicated concern. Both foreground renderers are driven from THIS layer's
 * one draw (connectors first so the glyphs composite over them), sharing a
 * single placement pass so the caption anchor and its connector can never drift.
 *
 * ### Why the f64 seam — the caption anchors need double precision too
 *
 * The label shader projects each anchor as `clip = viewProj · vec4(pos, 1)` in
 * f32. At solar-system zoom the anchors (Earth at 1 AU ≈ 4.85×10⁻¹² Mpc) AND
 * the NEAR0 vp's view translation (≈ −4.85×10⁻¹²) are BOTH ~1 AU from the
 * render origin. Their f32 subtraction cancels to ~4 digits, quantising the
 * camera-relative anchor onto a ~13 km grid — so the caption visibly hops
 * (~1 px at cam.distance 1e-15, ~24 px at the 1e-17 Mpc distance floor) as the
 * camera moves. The precision killer is each term's distance FROM THE ORIGIN,
 * not the (tiny) camera-to-anchor distance: two points metres apart but 1 AU
 * from the origin still cancel. Consuming the f32-narrowed `view.vp` — whose
 * translation bits are already gone — cannot fix this.
 *
 * The fix mirrors the sphere-body layers' `composeBodyMvp` seam, adapted for a
 * shared-vp label pass: each frame we rebase both operands into a camera-
 * relative frame in f64 before narrowing. `rebaseViewProj(view.slab.vp,
 * camPos)` folds the eye offset into the vp — zeroing the large view
 * translation — and the anchors are re-expressed as `pos − camPos` (small
 * camera-relative vectors). Neither operand the f32 shader multiplies carries a
 * large-number-cancellation hazard, and the shader itself is untouched. Only
 * this FOREGROUND renderer instance is rebased; the galaxy-label renderer
 * (`labelsLayer`, Mpc-scale anchors) keeps its set-once path.
 *
 * The leader-line connectors ride the SAME rebase. Their geometry is derived
 * (`liftedLabelPlacement`) from the already-rebased anchor and `rebasedVp`, so
 * both endpoints come back camera-relative in that same frame — they are handed
 * to `foregroundMarkerLineRenderer.draw` with `rebasedVp`, never re-projected
 * from a raw ~1-AU world point. Feeding the renderer the un-rebased anchors
 * would reintroduce exactly the origin-distance cancellation the captions dodge.
 *
 * ### Why gated on camera distance
 *
 * The captions are navigation aids for the final descent into the solar
 * system — one per seeded scene body (Earth, the Moon, Jupiter, the local
 * star map). Above galaxy scale those bodies are an irrelevant speck at the
 * galactic centre, and a permanent field of floating captions there would
 * just clutter the normal view — so the row stays dark until the camera has
 * zoomed well past galaxy scale.
 *
 * ### `enabled()` reads DEMAND, never the last draw's ARTIFACT
 *
 * The gate is the distance bands above ORed with the settings that could put
 * a caption on screen this frame (`enabled`'s own doc comment spells out the
 * exact terms). It never inspects anything `draw` produced — no glyph count,
 * no cached label array — because an artifact of the last draw and "should
 * this layer draw now" are two different questions that happen to agree right
 * up until they don't: every caption's fade TARGET can drop to 0 in the same
 * frame (the labels master toggle switching off), at which point `draw`
 * uploads an empty set, and a gate built on that upload's size would then read
 * "off" forever — re-enabling the toggle can't wake a layer whose own draw
 * is what's gated off by the leftover emptiness. Reading settings/state
 * directly has no such leftover to get stuck on: the moment demand returns,
 * the gate reads it and `draw` runs again.
 *
 * ### How caption visibility is decided (fade target → declutter → envelope)
 *
 * The two-dozen-name local map is dense: viewed from outside the neighbourhood
 * every star name projects onto the same sub-pixel spot, so an always-on set
 * would pile into an unreadable clump. Each frame every caption's drawn alpha
 * comes out of three stages:
 *   1. FADE TARGET — routed by the caption's `kind` through `CAPTION_FADE_RULES`,
 *      one row per kind carrying the three facts that always move together: the
 *      LABEL GATE of the caption's own source (the same registry-derived home
 *      the settings panel writes, so the mute switches are per-row rather than
 *      a cross-cutting bag), that source's separate VISIBILITY gate (only the
 *      star map and the Sun carry one — a caption must never outlive the dot it
 *      names), and the DISTANCE BAND it rides once both gates are open. Stars
 *      ride a neighbourhood band, so the set reads as a LOCAL STAR MAP rather
 *      than per-body approach labels; the Sun — the descent's aim point — rides
 *      its own band and so FADES IN as the camera descends, exactly 0 at the
 *      layer's enable gate (no pop) up to full alpha by half that distance;
 *      Earth and the planets carry no band and are simply on inside the caption
 *      gate. The per-row reasoning lives with the rows in `captionFadeRules.ts`.
 *      Every target flows through the envelope below, so flipping any gate
 *      fades rather than pops.
 *   2. DECLUTTER — EVERY visible caption contends in one screen-space cull
 *      (`declutterByScreenSeparation`), Earth and the planets included. The
 *      collision winner is the higher `CAPTION_PRIORITY` kind tier (sun >
 *      earth > planet > star — the order lives as data, user-tweakable), with
 *      apparent size only breaking ties within a tier; the layer composes the
 *      two into the cull's single `priorityPx` score so the helper stays pure.
 *   3. TEMPORAL ENVELOPE — the drawn alpha EASES toward target × survival
 *      over the frame clock instead of jumping, so a declutter flip or toggle
 *      change fades over ~0.3 s rather than popping — the same treatment the
 *      label director gives the galaxy labels, expressed as an exponential
 *      (`CAPTION_ENVELOPE_TAU_MS`) because this target moves continuously
 *      with the distance band. Mid-ramp frames wake the render loop
 *      (`scheduler.requestRender`, the director's own hook); a settled
 *      caption snaps exactly onto its target and goes quiet.
 *
 * ### Why the overlay shaders clamp clip-z (Defect 2, decision A)
 *
 * The NEAR0 far plane is adaptive (`foregroundFrustum`: far = camDist·100,
 * floored at `FAR_MIN_MPC`), so on a deep descent it collapses to just past
 * the orbited body — while this layer deliberately keeps captions visible at
 * anchors parsecs beyond it (the star map viewed from inside the
 * neighbourhood) and AU beyond it (the solar-system set while orbiting
 * another star). Rather than couple the fade band to the frustum, the
 * depthless overlay vertex stages clamp their clip-space depth to just inside
 * the far plane (`labels/vertex.wesl`, `markerLines/vertex.wesl`, mirroring
 * the star-point backdrop's `starPoints/vertex.wesl`), so a caption or
 * connector can never frustum-clip. Caption visibility is therefore a PURE
 * presentation decision — the fade band, the declutter, the toggle —
 * independent of where the far plane happens to sit this frame. The clamp is
 * inert for depth: both passes are depthless OVER composites on every path
 * (the COSMO director labels included), so no depth comparison is perturbed.
 *
 * ### Why the LIFT anchor is clamped inside the far plane (far-star flicker)
 *
 * The clip-z clamp above keeps a beyond-far caption VISIBLE; a separate hazard
 * threatens its POSITION. A far star (VY Canis Majoris at ~1170 pc ≈ 1.2e-3
 * Mpc) rides this pipeline at Earth zoom, where the far plane has floored at
 * `FAR_MIN_MPC = 3e-11` Mpc — so the anchor sits tens of MILLIONS of times
 * beyond it. The lift chain (`liftedLabelPlacement` → `labelLeaderLine`)
 * un-projects the lifted screen point by INVERTING `rebasedVp`; for an anchor
 * that far past the far plane `ndc_z` rounds to 1.0 within f64 round-off, and
 * the inverse's huge depth-row elements amplify the residual, so the
 * un-projected caption world position AND both leader-line endpoints hop every
 * frame as the camera — hence the matrix — moves. That is the user-reported
 * flicker (both `rebaseViewProj` and `labelLeaderLine` document a ~1e-6 Mpc
 * anchor validity window; far stars are ~1000× past it).
 *
 * Pass 2 therefore clamps the anchor handed to the lift with
 * `clampVec3Length(anchor, farMpc·0.99)`, the SAME move
 * `near0SelectionRingLayer` makes for its ring quad. In the camera-relative
 * frame (`rebasedVp` has the eye translation folded out) a uniform length
 * scale moves camera-space x/y/z together, so the projected NDC x/y — ratios
 * against w ∝ z — are IDENTICAL and only depth slides inward, into the
 * well-conditioned interior where the inverse is stable. The on-screen caption
 * lands in exactly the same place; it just stops trembling. Only the drawn
 * GEOMETRY reads the clamped frame — everything sized off the anchor's true
 * length (apparent size, the distance fade band, the declutter screen point)
 * keeps the raw `anchor`, because those must stay physical.
 *
 * The clamp has one obligatory companion: the caption's `worldEmMpc` is scaled
 * by the SAME ratio before emit. The label shader sizes glyphs from the drawn
 * anchor's depth (`pxPerEm = worldEmMpc / clip.w`, then the [min,max]px clamp),
 * so a caption drawn ~4e7× closer with its PHYSICAL em inflates by exactly the
 * clamp ratio — a sub-pixel supergiant that belongs on the 30px floor pins the
 * 150px ceiling. Scaling the em restores em/clip.w to the true-depth value, so
 * the drawn size is bit-for-bit what an in-frustum anchor would produce. The
 * (worldEmMpc, worldPos) pair must always describe ONE frame — clamp both or
 * neither.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Label } from '../../../../@types/rendering/Label';
import type { MarkerLine } from '../../../../@types/rendering/MarkerLine';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { BodyState } from '../../../../@types/scene/BodyState';
import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import type { ConstellationsArtifact } from '../../../../@types/loading/ConstellationsArtifact';
import { NEAR0 } from '../slabs';
import type { ForegroundCaption } from '../../presentation/foregroundCaption';
import { sceneBodyLabels } from '../../presentation/sceneBodyLabels';
import { constellationCaptions } from '../../presentation/constellationCaptions';
import { constellationLayerOpacity } from '../../presentation/constellationLayerOpacity';
import { resolveLayerOpacity } from '../../presentation/focusRecession';
import { sceneBodyStates } from '../sceneBodyStates';
import { CAPTION_PRIORITY, CAPTION_TIER_SCALE } from '../../presentation/captionPriority';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { clampVec3Length } from '../../../../utils/math/clampVec3Length';
import { liftedLabelPlacement } from '../../presentation/liftedLabelPlacement';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { FAMOUS_LABEL_STYLE } from '../../presentation/famousLabelStyle';
import { LEADER_LINE_BOTTOM_GAP_PX } from '../../presentation/leaderLineStyle';
import { CAPTION_FADE_RULES } from '../../presentation/captionFadeRules';
import { sgrAStarCaptionTarget } from '../../presentation/sgrAStarCaptionTarget';
import { projectToScreenPx } from '../../../../utils/camera/projectToScreenPx';
import { declutterByScreenSeparation } from '../../../../utils/scene/declutterByScreenSeparation';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../solarSystemLabelMaxDistance';
import { NEAR0_FAR_CLAMP_FRACTION } from '../../../../utils/camera/foregroundFrustum';

/**
 * Minimum on-screen gap (px) between two foreground captions before the lower-
 * priority one is culled. Sized a little above the clamped caption pixel height
 * (`FAMOUS_LABEL_STYLE.maxPixelSize`) so overlapping names de-collide instead
 * of stacking into an unreadable pile from far out.
 */
const STAR_CAPTION_MIN_SEPARATION_PX = 48;

/**
 * Time constant (ms) of the caption alpha envelope: each caption's drawn
 * alpha approaches its target exponentially, covering ~63% of the remaining
 * gap per tau and ~95% within 3·tau (300 ms) — the same perceptual duration
 * as the label director's `ENVELOPE_MS` ramp. Exponential rather than the
 * director's closed-form smoothstep because this target MOVES continuously
 * (the distance band shifts every frame the camera flies); an exponential
 * tracks a moving target with no per-change re-basing.
 */
const CAPTION_ENVELOPE_TAU_MS = 100;

/**
 * Settle snap for the envelope: within this distance of the target the alpha
 * lands EXACTLY on it. Sub-visible (half a percent), and the exact landing is
 * load-bearing — a settled caption compares equal frame-to-frame, so it stops
 * waking the render loop.
 */
const CAPTION_ENVELOPE_SETTLE_EPS = 0.005;

/**
 * The envelope's cross-frame state: caption id → drawn alpha, plus the frame
 * clock of the last draw (for the dt). Module-level for the same reason
 * `BASE_LABELS` is — this layer is a module singleton. The map is bounded by
 * the static seed set; the prune in `draw` keeps it honest should the seed
 * list ever become dynamic.
 */
const captionAlpha = new Map<string, number>();
let captionClockMs: number | null = null;

/**
 * Whether any caption is still mid-fade. `enabled`'s ENVELOPE TAIL reads this
 * to keep the row drawing for the last few frames after settings-demand drops
 * to 0, so a caption already on screen eases out instead of popping the
 * instant the toggle flips — the temporal envelope (stage 3 below) has
 * nothing to animate if `draw` never runs again. The settle snap in `draw`
 * always lands a finished ramp on exactly 0, so a caption that has faded out
 * leaves no trace here and this tail cannot hold the row on indefinitely.
 */
function anyCaptionAlive(): boolean {
  for (const alpha of captionAlpha.values()) {
    if (alpha > 0) return true;
  }
  return false;
}

/**
 * The render-origin-relative caption set, MEMOIZED on the body-state snapshot.
 * `sceneBodyLabels` reads the frame's body positions, so Earth + the planets
 * move as the sim clock advances — but only when it actually does:
 * `deriveBodyStates` returns the SAME snapshot Map by reference while `simDays`
 * is unchanged (a paused clock, or the repeated reads within one frame), so an
 * identity check on that map is a free change-detector. A real clock tick
 * rebuilds the handful of captions; a paused clock never rebuilds. The star
 * anchors in the set are static (stars carry no orbital element), so only the
 * Earth/planet anchors actually shift. `draw` then rebases whichever set is
 * current into the camera-relative frame.
 *
 * The narrowed `ForegroundCaption` element type carries the producer's
 * guarantee that colour / em / clamps are always authored, so the loop below
 * hands them to `liftedLabelPlacement` (which requires plain numbers) without
 * defensive fallbacks.
 */
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedLabels: readonly ForegroundCaption[] = [];

function baseLabelsFor(bodyStates: ReadonlyMap<string, BodyState>): readonly ForegroundCaption[] {
  if (bodyStates !== cachedStates) {
    cachedLabels = sceneBodyLabels(bodyStates);
    cachedStates = bodyStates;
  }
  return cachedLabels;
}

/**
 * The constellation caption set, MEMOIZED on the artifact's identity. The
 * artifact is static once its slot lands (positions and names never change), so
 * an identity check on the slot's ready value is a free change-detector — the
 * same posture `baseLabelsFor` takes on the body-state snapshot. The names are
 * built once when the artifact arrives and reused every frame after; a released
 * slot (`state` back to non-ready) drops the set to empty so the captions
 * dissolve with the layer. The producer is pure — this layer applies the
 * per-frame fade target and the toggle below.
 */
let cachedArtifact: ConstellationsArtifact | undefined;
let cachedConstellationCaptions: readonly ForegroundCaption[] = [];

function constellationCaptionsFor(
  slot: AssetSlot<ConstellationsArtifact, void> | null,
): readonly ForegroundCaption[] {
  const slotState = slot?.state();
  const artifact =
    slotState !== undefined && slotState.kind === 'ready' ? slotState.value : undefined;
  if (artifact === undefined) {
    cachedArtifact = undefined;
    cachedConstellationCaptions = [];
    return cachedConstellationCaptions;
  }
  if (artifact !== cachedArtifact) {
    cachedConstellationCaptions = constellationCaptions(artifact);
    cachedArtifact = artifact;
  }
  return cachedConstellationCaptions;
}

export const foregroundLabelsLayer: ContentLayer = {
  name: 'foreground-labels',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state, ctx) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return false;
    // The gate reads DEMAND — could `draw` want to show a caption this frame —
    // never the ARTIFACT of the last draw. An earlier version short-circuited
    // on `renderer.glyphCount() === 0`, i.e. "did the last `setLabels` upload
    // anything": that reads fine right up until every caption's fade target
    // hits 0 in the same frame (e.g. the labels master toggle switching off).
    // `draw` then calls `setLabels([])`, glyphCount drops to 0, and the gate
    // latches false FOREVER — re-enabling the toggle can't wake it, because the
    // draw that would repopulate the buffer is exactly the thing the glyph-
    // count check is gating off. Reading settings/state directly, as below,
    // has no such artifact to latch on.
    //
    // The BODY captions' demand: the shared foreground gate (so this row
    // empties with its NEAR0 siblings at galaxy zoom) AND the tighter caption
    // gate (see SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC's docblock) AND at least
    // one of the label gates that can make a body-caption target nonzero (the
    // `labelEnabled` column of `CAPTION_FADE_RULES`). The body half is a fold over the whole
    // `bodies.items` record rather than a list of named rows, so a new
    // near-field body joins the demand summary by existing — a hand-listed OR
    // would silently leave its captions behind a dark gate. The famous-star
    // row's `enabled` is deliberately NOT part of this OR: it is the star row's
    // `subjectVisible` gate, which only narrows that kind's target and can never
    // turn a caption on when the row's `labelEnabled` is off, so it carries no
    // demand of its own.
    const bodyDemand =
      ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC &&
      ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC &&
      (state.settings.starCatalogs.items.famousStar.labelEnabled ||
        Object.values(state.settings.bodies.items).some((body) => body.labelEnabled));
    // The Galactic Centre's demand, ORed in for the reason the constellation
    // term below is: its reach is NOT the solar system's. Its band runs out to a
    // disc diameter, well past `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, so
    // `bodyDemand` would cut the name exactly where the galaxy frames up. Read
    // through `sgrAStarCaptionTarget` — the same rules row `draw` indexes — so
    // the demand summary cannot claim a caption the draw then zeroes, or the
    // reverse. Still ANDed under the shared foreground gate, so the NEAR0 group
    // empties wholesale at galaxy zoom exactly as before.
    const galacticCentreDemand =
      ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC &&
      sgrAStarCaptionTarget(state.settings, ctx.drawCamPos, ctx.cam.distance) > 0;
    // The CONSTELLATION captions' demand rides the SAME product `draw` uses
    // for their fade target — `constellationLayerOpacity`, the distance band
    // times the fade-registry toggle opacity (not the band-only `1` an
    // earlier version passed here, which left this term "on" even after a
    // constellations-layer switch-off, relying entirely on the glyph-count
    // latch to eventually zero the row). Reading the toggle here keeps the
    // gate a true demand summary on its own. The band reaches out PAST the
    // body caption gate (the band fades to 0 at 0.01 Mpc, beyond the ~9.2e-3
    // Mpc caption gate), so the row must also run while a figure name could
    // still be visible — otherwise the names would be cut mid-band. Composed
    // with OR so each caption group keeps its own onset.
    const slot = state.assetSlots.constellations;
    const constellationDemand =
      slot !== null &&
      slot.state().kind === 'ready' &&
      constellationLayerOpacity(
        Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]),
        state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs),
      ) > 0;
    // The ENVELOPE TAIL: once demand drops to 0 (a toggle switched off, the
    // camera crossed a band edge), every caption still has to ease its drawn
    // alpha down to exactly 0 over the temporal envelope (see `draw`'s stage
    // 3) rather than vanishing on the SAME frame demand disappears — so the
    // row must keep drawing for those few remaining frames. `anyCaptionAlive`
    // reads the module's own envelope state, which is exactly what's left to
    // fade; the settle snap in `draw` always lands it on precisely 0, so this
    // tail is guaranteed to terminate.
    return bodyDemand || galacticCentreDemand || constellationDemand || anyCaptionAlive();
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return;
    const lineRenderer = state.gpu.foregroundMarkerLineRenderer;

    // The caption set for this frame's sim instant. `sceneBodyStates` binds the
    // epoch to `ctx.simDays` (the ONE per-frame body snapshot every scene layer
    // shares), and `baseLabelsFor` rebuilds the captions only when that snapshot
    // changes — free while paused, a handful of rebuilds on a clock tick.
    const BASE_LABELS = baseLabelsFor(sceneBodyStates(state, ctx));

    // Rebase into the camera-relative frame in f64 so the f32 upload carries no
    // catastrophic cancellation — see the module header's "f64 seam" note.
    // `view.camPos` is the origin-relative eye (the same frame `view.slab.vp`
    // and the base anchors are built in), so subtracting it here zeroes the
    // view translation `rebaseViewProj` folds into the vp.
    const camPos = view.camPos;
    const viewportPx = view.viewportPx;

    // Fold the eye offset into the vp ONCE. Uses the slab's f64 `vp`, NOT the
    // f32-narrowed `view.vp`. Reused as the projection for the leader-line
    // placement AND for both renderers' draw, so the captions and their
    // connectors share one frame. It stays f64 for the placement math — the
    // lifted-label chain INVERTS it, and at deep zoom an f32 inverse of the
    // ill-conditioned NEAR0 frustum distorts the leader lines by tens of px
    // (see `labelLeaderLine`); only the renderer uploads get the f32 narrow.
    const rebasedVp = rebaseViewProj(view.slab.vp, camPos);
    const rebasedVpF32 = narrowMat4(rebasedVp);
    const settings = state.settings;
    // The camera's ORBIT distance — the second argument every
    // `CAPTION_FADE_RULES` row takes, read by the kinds whose reach is the solar
    // system's rather than their own anchor's. `ctx.cam.distance`, NOT
    // `|camPos|`: it measures to the orbit TARGET, and it is the exact quantity
    // the layer gate used to apply for these kinds, so moving that bound into
    // the rows leaves their behaviour untouched. The two numbers diverge the
    // moment the camera frames something off the origin.
    const camOrbitDistanceMpc = ctx.cam.distance;

    // ── Pass 1: rebase + size every body, and derive each caption's fade TARGET ──
    // (Stage 1 of the module header's three-stage pipeline.)
    type Entry = {
      label: ForegroundCaption;
      anchor: Vec3;
      subjectSizePx: number;
      baseTarget: number;
      screenPx: Vec2 | null;
    };
    const entries: Entry[] = [];

    for (const label of BASE_LABELS) {
      // Re-express the anchor as a small camera-relative vector. The
      // subtraction is done on the f64 JS numbers before the renderer narrows
      // to f32; storing the raw ~1-AU anchor would already have lost the
      // low-order bits.
      const anchor: Vec3 = [
        label.worldPos[0] - camPos[0],
        label.worldPos[1] - camPos[1],
        label.worldPos[2] - camPos[2],
      ];

      // The body's apparent on-screen size drives the proportional lift (and
      // the within-tier declutter tiebreak below), same as a famous galaxy's
      // apparent diameter. The em height is the body's radius in Mpc
      // (`sceneBodyLabels`), so its diameter is `2 · worldEmMpc`. The FADE does
      // not read it — that is the distance band's whole point.
      const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
      const subjectSizePx = apparentSizePx({
        diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
        distanceMpc,
        viewportHeightPx: viewportPx[1],
        fovYRad: ctx.fovYRad,
      });

      // The fade TARGET before declutter, routed by the caption's kind through
      // `CAPTION_FADE_RULES` — one row per kind carrying its label gate, its
      // subject-visibility gate, and the distance band it rides (see that
      // module for why each gate exists). Both gates must be open before the
      // band is consulted; a closed one zeroes the target, and every target
      // flows through the envelope below, so flipping any gate fades rather
      // than pops.
      const rule = CAPTION_FADE_RULES[label.kind];
      const baseTarget =
        rule.labelEnabled(settings) && rule.subjectVisible(settings)
          ? rule.fadeTarget(distanceMpc, camOrbitDistanceMpc)
          : 0;

      // Screen position for the declutter. Behind the camera there is none —
      // those captions bypass the cull (the shader clips them anyway; pass 2
      // keeps them for glyph-count stability).
      entries.push({
        label,
        anchor,
        subjectSizePx,
        baseTarget,
        screenPx: projectToScreenPx(anchor, rebasedVp, viewportPx),
      });
    }

    // ── The constellation figure names, folded into the same entry set ──
    // Static once the artifact lands (memoized on its identity); every figure
    // shares ONE fade target this frame — the layer's distance band × the
    // fade-registry toggle, `constellationLayerOpacity` (the same one home the
    // stick-figure pass reads, so names dissolve in lock-step with the lines).
    // This is the producer-supplied target the `constellation` row of
    // `CAPTION_FADE_RULES` defers to: it keys on the CAMERA's origin distance
    // and the fade registry, neither of which a per-anchor band could express.
    // The whole block is skipped while the slot is unloaded, so a state
    // without a constellation slot never reads the fade registry.
    const constellationCaps = constellationCaptionsFor(state.assetSlots.constellations);
    if (constellationCaps.length > 0) {
      const constellationLayerFade = resolveLayerOpacity(state, ctx, { kind: 'constellations' });
      // The ORIGIN distance, not the orbit distance the caption rules read —
      // `constellationsLayer.enabled` keys its band on the eye's heliocentric
      // distance, and the figure names must dissolve in lock-step with the lines.
      const constellationCamDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
      const constellationTarget = constellationLayerOpacity(
        constellationCamDistMpc,
        constellationLayerFade,
      );
      for (const label of constellationCaps) {
        // The anchor is empty space at the figure centroid — no body, so no
        // apparent size (subjectSizePx 0, which composes cleanly into the
        // declutter score below as the annotation tier's within-tier tiebreak)
        // and no leader-line lift in pass 2. Re-express it camera-relative
        // before the f32 upload, same as the body anchors.
        const anchor: Vec3 = [
          label.worldPos[0] - camPos[0],
          label.worldPos[1] - camPos[1],
          label.worldPos[2] - camPos[2],
        ];
        entries.push({
          label,
          anchor,
          subjectSizePx: 0,
          baseTarget: constellationTarget,
          screenPx: projectToScreenPx(anchor, rebasedVp, viewportPx),
        });
      }
    }

    // ── Stage 2: de-collide EVERY visible caption in one cull ──
    // Priority = kind tier · scale + clamped apparent size: the tier always
    // dominates (see `captionPriority.ts`), apparent size only breaks ties
    // within a tier. Composing the score here keeps the cull's one-number
    // contract pure. Fully-faded or behind-camera captions don't contend.
    const candidateEntryIdx: number[] = [];
    const candidates: { screenPx: Vec2; priorityPx: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      if (e.baseTarget === 0 || e.screenPx === null) continue;
      candidateEntryIdx.push(i);
      candidates.push({
        screenPx: e.screenPx,
        priorityPx:
          CAPTION_PRIORITY[e.label.kind] * CAPTION_TIER_SCALE +
          Math.min(e.subjectSizePx, CAPTION_TIER_SCALE - 1),
      });
    }
    const survived = new Set(
      declutterByScreenSeparation({
        candidates,
        minSeparationPx: STAR_CAPTION_MIN_SEPARATION_PX,
      }).map((k) => candidateEntryIdx[k]!),
    );

    // ── Stage 3: temporal envelope — ease each drawn alpha toward its target ──
    // target = fade target × declutter survival (behind-camera captions bypass
    // the cull). The ease is exponential over the frame clock; exp(-Infinity)
    // is 0, so the first-ever frame lands every caption exactly on its target
    // — the layer's gate turning on paints the steady state rather than
    // ramping two dozen captions up from black. A caption never seen before
    // seeds AT its target for the same reason: only CHANGES animate.
    const nowMs = ctx.nowMs;
    const dtMs =
      captionClockMs === null ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - captionClockMs);
    captionClockMs = nowMs;
    const approach = 1 - Math.exp(-dtMs / CAPTION_ENVELOPE_TAU_MS);
    let anyRamping = false;

    type Emit = {
      label: ForegroundCaption;
      anchor: Vec3;
      subjectSizePx: number;
      fadeAlpha: number;
    };
    const toEmit: Emit[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const target = e.screenPx === null ? e.baseTarget : survived.has(i) ? e.baseTarget : 0;
      const prev = captionAlpha.get(e.label.id);
      let alpha = prev === undefined ? target : prev + (target - prev) * approach;
      if (Math.abs(alpha - target) < CAPTION_ENVELOPE_SETTLE_EPS) alpha = target;
      else anyRamping = true;
      captionAlpha.set(e.label.id, alpha);
      if (alpha > 0) {
        toEmit.push({
          label: e.label,
          anchor: e.anchor,
          subjectSizePx: e.subjectSizePx,
          fadeAlpha: alpha,
        });
      }
    }

    // Prune envelope state for ids that left the caption universe — the union
    // of both producers' ids, which IS the entry set this frame (every caption
    // becomes an entry, faded or behind-camera included). For the body captions
    // this never fires (the roster is static); it DOES fire when the
    // constellation slot unloads, dropping those figures' envelope state so the
    // map can't leak across a load/unload cycle.
    const universe = new Set(entries.map((e) => e.label.id));
    for (const id of captionAlpha.keys()) {
      if (!universe.has(id)) captionAlpha.delete(id);
    }

    // ── Pass 2: lift each survivor and emit its caption + connector ──
    const liftedLabels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const { label, anchor, subjectSizePx, fadeAlpha } of toEmit) {
      // Constellation names anchor in EMPTY SPACE at a figure centroid, not on a
      // body, so they skip the leader-line lift entirely and emit forward-
      // projected at their anchor — the same direct emit the behind-camera
      // fallback below uses. Their anchors sit far beyond the NEAR0 adaptive far
      // plane at Earth zoom, but the overlay label shader clamps clip-z (module
      // header, 'Why the overlay shaders clamp clip-z'), so a direct forward
      // projection still draws — the far-plane clamp + em-scale machinery below
      // exists only for the INVERSE-projection lift path, which this never
      // takes. No connector, no size clamp: the caption just draws at its
      // centroid, dissolving on the shared envelope like every other.
      if (label.kind === 'constellation') {
        liftedLabels.push({ ...label, worldPos: anchor, fadeAlpha });
        continue;
      }

      // Pull the anchor inside the NEAR0 far plane before the lift. A far star
      // (VY CMa at ~1170 pc ≈ 1.2e-3 Mpc) sits tens of MILLIONS of times beyond
      // the far plane, which floors at `FAR_MIN_MPC = 3e-11` on a deep Earth
      // descent (see `foregroundFrustum`). The lift chain (`liftedLabelPlacement`
      // → `labelLeaderLine`) INVERTS `rebasedVp` to un-project the lifted screen
      // point back to world; for an anchor that far past the far plane its
      // `ndc_z` rounds to 1.0 within f64 error, and the inverse's huge depth-row
      // elements amplify that residual — so the un-projected caption + leader
      // endpoints shift every frame as the camera (hence the matrix) moves. That
      // is the reported flicker.
      //
      // The clamp is direction-preserving in the CAMERA-RELATIVE frame
      // (`rebasedVp` has no translation — the eye is at the origin), so clip
      // x/y/w scale together and the projected screen position is IDENTICAL;
      // only depth moves inward, into the well-conditioned interior where the
      // inverse is stable. The overlay shaders already clamp clip-z
      // (`CLIP_Z_EPS`), so the drawn depth is unaffected either way. This mirrors
      // `near0SelectionRingLayer`'s ring-clip clamp exactly — the layer owns the
      // slab and is the one feeding out-of-domain input, so it clamps at the
      // call site rather than inside the pure lift util. Everything sized off the
      // anchor's TRUE length (subjectSizePx, fade, the declutter screen point)
      // still reads the un-clamped `anchor`; ONLY the drawn geometry — the
      // lift/leader inputs and the em that projects at the drawn depth — switches.
      const liftAnchor = clampVec3Length(anchor, view.slab.farMpc * NEAR0_FAR_CLAMP_FRACTION);

      // Scale the caption's world em by the SAME ratio the clamp applied. The
      // label shader sizes glyphs from the DRAWN anchor's depth — pxPerEm =
      // worldEmMpc / clip.w · viewportH/2, clamped to [min,max]px
      // (labels/vertex.wesl) — and the clamp just moved that anchor up to
      // ~4e7× closer (VY CMa at ~1.2e-3 Mpc drawn at the ~3e-11 far plane).
      // Keeping the star's PHYSICAL em at the clamped depth inflates the
      // projected size by exactly the clamp ratio: a sub-pixel supergiant that
      // should sit on the min-px floor slams into the max-px ceiling instead.
      // Because the clamp scales camera-space x/y/z — hence clip.w — uniformly,
      // multiplying the em by the same factor makes em/clip.w, and therefore
      // the on-screen size, IDENTICAL to the true-depth projection. The scaled
      // em also feeds `liftedLabelPlacement`, whose ink-clearance math mirrors
      // the shader's sizing and must agree with what actually draws.
      //
      // The ratio is READ OFF the clamp's own output — `|liftAnchor| / |anchor|`
      // — not re-derived from a second `farMpc · NEAR0_FAR_CLAMP_FRACTION`
      // spelling. Reading the clamp result means the em multiplier can never
      // drift from what the clamp actually did (the two are ONE length ratio).
      // `clampVec3Length` returns the input reference when in range, so the
      // identity check makes the common near-body case an exact no-op (the ratio
      // is exactly 1 there, so the branch is also a numerical guard against a
      // spurious non-unit ratio from f64 round-off on the hypot).
      const anchorScale =
        liftAnchor === anchor
          ? 1
          : Math.hypot(liftAnchor[0], liftAnchor[1], liftAnchor[2]) /
            Math.hypot(anchor[0], anchor[1], anchor[2]);
      const liftEmMpc = label.worldEmMpc * anchorScale;

      // The single lifted-label chain (see `liftedLabelPlacement`) — identical
      // to the famous + Milky-Way producers: screen-space proportional lift
      // with the MIN_LABEL_CLEARANCE_PX ink-bottom guarantee (load-bearing for
      // the top-aligned sun/moon captions, whose glyph block hangs below the
      // anchor), connector top derived from the measured text bottom minus the
      // shared padding. Projecting through the clamped anchor + `rebasedVp`
      // means both endpoints come back in the SAME camera-relative frame, so
      // they pair with `rebasedVp` at draw with no second rebase.
      const placement = liftedLabelPlacement({
        anchorWorldPos: liftAnchor,
        vp: rebasedVp,
        viewportPx,
        subjectSizePx,
        textBbox: renderer.measure(label),
        worldEmMpc: liftEmMpc,
        minPixelSize: label.minPixelSize,
        maxPixelSize: label.maxPixelSize,
        // End the connector a constant gap ABOVE the body instead of at its
        // centre: apparent radius + the tuning-knob gap, so an unresolved
        // point keeps a small clear space under the line and a resolved
        // sphere keeps that same space above its top rim.
        lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
      });

      // Behind the camera the projection is undefined. Still push the caption
      // (unlifted, at its raw anchor) rather than dropping it — the overlay
      // shader clips it on `clip.w`, so nothing extra actually draws — because
      // `liftedLabels` should mirror `toEmit`'s DEMAND (fadeAlpha > 0)
      // uniformly: a caption's presence in the emitted set should depend on
      // whether it's wanted, not on which side of the camera plane its anchor
      // happens to sit this frame. There is no valid projection to derive a
      // connector from, so none is emitted for it.
      if (placement === null) {
        liftedLabels.push({ ...label, worldPos: anchor, fadeAlpha });
        continue;
      }

      // The emitted caption carries the SCALED em to pair with its clamped-depth
      // worldPos — the invariant is that (worldEmMpc, worldPos) always describe
      // the same frame, so the shader's em/clip.w reproduces the true apparent
      // size. The null-placement fallback below keeps the raw pair (unclamped
      // anchor + physical em) for the same reason.
      liftedLabels.push({
        ...label,
        worldPos: placement.labelWorldPos,
        worldEmMpc: liftEmMpc,
        fadeAlpha,
      });
      if (placement.line !== null) {
        lines.push({
          id: `${label.id}-anchor`,
          fromWorld: placement.line.fromWorld,
          toWorld: placement.line.toWorld,
          // Adopt the famous connector width for parity; tint the line with the
          // caption's own colour so each connector reads as part of its body's
          // caption (straight RGBA == premultiplied at alpha 1). The shader
          // premultiplies `fadeAlpha` on top, so the connector fades in lockstep
          // with its caption.
          pixelWidth: FAMOUS_LABEL_STYLE.pixelWidth,
          color: [...label.color],
          fadeAlpha,
        });
      }
    }

    renderer.setLabels(liftedLabels);

    // The scene-body depth view for the current frame's foreground row. Handed
    // as the 4th `sceneDepthView` arg to both draws so the captions and their
    // connectors OCCLUDE per-pixel behind nearer bodies: the discard-gated
    // fragment shaders sample this depth and drop any fragment a closer body
    // covers. Both foreground renderers are the `occludeAgainstDepth` instances
    // (see `initGpu.ts`); a non-occlusion renderer ignores this arg, so the
    // COSMO labels — which never receive it — are unaffected.
    //
    // Occlude captions only when the body pass actually ran this frame — else
    // the `foreground:0` depth is stale/uninitialised and would spuriously
    // discard EVERY caption (the executor skips an empty render step, so the
    // depth buffer is only valid when a body drew). Mirrors the composite
    // step's `touched` guard. When undefined, the renderers fall back to their
    // plain pipeline and draw the captions un-occluded.
    const depthView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.depthViewOf('foreground:0')
      : undefined;

    // Draw the connectors BEFORE the captions so the glyphs composite OVER the
    // line where they meet — the same ordering `markerLinesLayer` keeps ahead
    // of `labelsLayer`. Both renderers target the swap chain, so the two draws
    // share this one render pass. The line renderer is null-checked: it is an
    // optional bootstrap resource like the caption renderer, and a null handle
    // just skips the connectors while the captions still draw.
    if (lineRenderer !== null) {
      lineRenderer.setLines(lines);
      lineRenderer.draw(pass, rebasedVpF32, viewportPx, depthView);
    }
    renderer.draw(pass, rebasedVpF32, viewportPx, depthView);

    // Mid-ramp envelopes need another frame to keep easing under
    // render-on-demand — the same wake hook the label director uses while its
    // ramps run. Settled frames stay quiet.
    if (anyRamping) state.subsystems.scheduler.requestRender();
  },
};
