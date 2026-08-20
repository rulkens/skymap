/**
 * foregroundLabelsLayer — captions + leader lines for the true-scale foreground
 * bodies, the local star map, and the constellation figure names.
 *
 * It owns a SECOND label and marker-line renderer because one renderer draws with
 * one view-projection: these anchors sit AU-to-parsec away, inside COSMO's 10-kpc
 * near plane, so they must project through NEAR0. Both run off this one draw and
 * one placement pass, so caption and connector can never drift. Anchors routinely
 * sit beyond NEAR0's adaptive far plane; the overlay stages clamp clip-z for them.
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

// Screen px: sized a little above the clamped caption height
// (`FAMOUS_LABEL_STYLE.maxPixelSize`) so names de-collide rather than stack.
const STAR_CAPTION_MIN_SEPARATION_PX = 48;

// Envelope time constant (ms): ~95% of the gap closed within 3·tau (300 ms), the
// label director's perceptual duration. Exponential rather than the director's
// smoothstep because this target moves continuously with the distance band.
const CAPTION_ENVELOPE_TAU_MS = 100;

// Settle snap: landing EXACTLY on the target is load-bearing — a settled caption
// compares equal frame-to-frame, so it stops waking the render loop.
const CAPTION_ENVELOPE_SETTLE_EPS = 0.005;

const captionAlpha = new Map<string, number>();
let captionClockMs: number | null = null;

/**
 * `enabled`'s envelope tail reads this so an on-screen caption can ease out over
 * the frames after demand drops — stage 3 has nothing to animate if `draw` never
 * runs again. The settle snap lands a finished ramp on exactly 0, so the tail
 * always terminates.
 */
function anyCaptionAlive(): boolean {
  for (const alpha of captionAlpha.values()) {
    if (alpha > 0) return true;
  }
  return false;
}

// Memoized on the body-state snapshot: `deriveBodyStates` returns the SAME Map by
// reference while `simDays` is unchanged, so this identity check is a free
// change-detector — a paused clock never rebuilds the captions.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedLabels: readonly ForegroundCaption[] = [];

function baseLabelsFor(bodyStates: ReadonlyMap<string, BodyState>): readonly ForegroundCaption[] {
  if (bodyStates !== cachedStates) {
    cachedLabels = sceneBodyLabels(bodyStates);
    cachedStates = bodyStates;
  }
  return cachedLabels;
}

// Memoized on the artifact's identity (static once its slot lands); a released
// slot drops the set to empty so the captions dissolve with the layer.
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
    // The gate reads DEMAND, never the ARTIFACT of the last draw. Gating on
    // `renderer.glyphCount() === 0` latches false FOREVER once every target hits 0
    // in one frame (the labels master switching off): `draw` uploads an empty set,
    // and the draw that would repopulate it is the very thing the gate blocks.
    //
    // The body half folds over the whole `bodies.items` record rather than naming
    // rows, so a new near-field body joins the demand summary by existing.
    // The famous-star row's `enabled` is deliberately NOT ORed in: it is that
    // kind's `subjectVisible` gate, which only narrows an already-open target.
    const bodyDemand =
      ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC &&
      ctx.cam.distance < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC &&
      (state.settings.starCatalogs.items.famousStar.labelEnabled ||
        Object.values(state.settings.bodies.items).some((body) => body.labelEnabled));
    // The Galactic Centre's reach is NOT the solar system's — its band runs to a
    // disc diameter, so `bodyDemand` would cut the name exactly where the galaxy
    // frames up. Read through the same rules row `draw` indexes, so the demand
    // summary cannot claim a caption the draw then zeroes.
    const galacticCentreDemand =
      ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC &&
      sgrAStarCaptionTarget(state.settings, ctx.drawCamPos, ctx.cam.distance) > 0;
    // The constellation band reaches PAST the body caption gate (0 at 0.01 Mpc vs
    // the ~9.2e-3 Mpc gate), so this term is ORed in or the figure names get cut
    // mid-band. Reads the raw intent opacity by ruling (#18 D8): a clip fade
    // dims the captions through the envelope without stopping the row — that's the point.
    const slot = state.assetSlots.constellations;
    const constellationDemand =
      slot !== null &&
      slot.state().kind === 'ready' &&
      constellationLayerOpacity(
        Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]),
        state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs),
      ) > 0;
    // The envelope tail keeps the row drawing for the few frames a caption needs
    // to ease to 0 after demand disappears; the settle snap terminates it.
    return bodyDemand || galacticCentreDemand || constellationDemand || anyCaptionAlive();
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.foregroundLabelRenderer;
    if (renderer === null) return;
    const lineRenderer = state.gpu.foregroundMarkerLineRenderer;

    const BASE_LABELS = baseLabelsFor(sceneBodyStates(state, ctx));

    const camPos = view.camPos;
    const viewportPx = view.viewportPx;

    // At solar-system zoom the anchors (Earth at 1 AU ≈ 4.85e-12 Mpc) and the vp's
    // view translation are both ~1 AU from the render origin; their f32 difference
    // cancels to ~4 digits and the caption hops on a ~13 km grid. So rebase both
    // into the camera-relative frame in f64 — from the slab's f64 `vp`, NOT the
    // narrowed `view.vp` — and narrow only at the renderer upload. It stays f64 for
    // the placement math, which INVERTS it: an f32 inverse of the ill-conditioned
    // NEAR0 frustum distorts the leader lines by tens of px (see `labelLeaderLine`).
    const rebasedVp = rebaseViewProj(view.slab.vp, camPos);
    const rebasedVpF32 = narrowMat4(rebasedVp);
    const settings = state.settings;
    // Orbit distance, NOT `|camPos|`: it measures to the orbit TARGET, which is
    // the bound the kinds whose reach is the solar system's ride. The two diverge
    // the moment the camera frames something off the origin.
    const camOrbitDistanceMpc = ctx.cam.distance;

    // ── Pass 1: rebase + size every body, and derive each caption's fade TARGET ──
    type Entry = {
      label: ForegroundCaption;
      anchor: Vec3;
      subjectSizePx: number;
      baseTarget: number;
      screenPx: Vec2 | null;
    };
    const entries: Entry[] = [];

    for (const label of BASE_LABELS) {
      const anchor: Vec3 = [
        label.worldPos[0] - camPos[0],
        label.worldPos[1] - camPos[1],
        label.worldPos[2] - camPos[2],
      ];

      // `worldEmMpc` is the body's RADIUS in Mpc (`sceneBodyLabels`), so the
      // apparent-size call takes `2 · worldEmMpc` as the diameter.
      const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
      const subjectSizePx = apparentSizePx({
        diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
        distanceMpc,
        viewportHeightPx: viewportPx[1],
        fovYRad: ctx.fovYRad,
      });

      // Both gates must be open before the band is consulted; a closed one zeroes
      // the target, which then eases out through the envelope rather than popping.
      const rule = CAPTION_FADE_RULES[label.kind];
      const baseTarget =
        rule.labelEnabled(settings) && rule.subjectVisible(settings)
          ? rule.fadeTarget(distanceMpc, camOrbitDistanceMpc)
          : 0;

      // A null screenPx means behind the camera: those bypass the cull entirely.
      entries.push({
        label,
        anchor,
        subjectSizePx,
        baseTarget,
        screenPx: projectToScreenPx(anchor, rebasedVp, viewportPx),
      });
    }

    // ── The constellation figure names, folded into the same entry set ──
    // Every figure shares ONE fade target this frame: `constellationLayerOpacity`,
    // the same one home the stick-figure pass reads, so names dissolve in lock-step
    // with the lines. The `constellation` row of `CAPTION_FADE_RULES` defers to
    // this producer-supplied target — it keys on the camera's origin distance and
    // the fade registry, neither of which a per-anchor band could express.
    const constellationCaps = constellationCaptionsFor(state.assetSlots.constellations);
    if (constellationCaps.length > 0) {
      const constellationLayerFade = resolveLayerOpacity(state, ctx, { kind: 'constellations' });
      // ORIGIN distance, not the orbit distance the other caption rules read:
      // `constellationsLayer.enabled` keys its band on the eye's heliocentric one.
      const constellationCamDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
      const constellationTarget = constellationLayerOpacity(
        constellationCamDistMpc,
        constellationLayerFade,
      );
      for (const label of constellationCaps) {
        // The anchor is empty space at the figure centroid — no body, hence no
        // apparent size and no leader-line lift in pass 2.
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
    // Priority = kind tier · scale + clamped apparent size, so the tier always
    // dominates and apparent size only breaks ties within it; composing the score
    // here keeps the cull's one-number contract pure.
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
    // `exp(-Infinity)` is 0, so the first-ever frame lands every caption exactly on
    // its target: the gate turning on paints the steady state instead of ramping
    // two dozen captions up from black. Unseen ids seed AT target for the same
    // reason — only CHANGES animate.
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

    // Every caption becomes an entry (faded and behind-camera included), so the
    // entry set IS the id universe. Prunes the constellation figures' envelope
    // state when their slot unloads, so the map can't leak across load cycles.
    const universe = new Set(entries.map((e) => e.label.id));
    for (const id of captionAlpha.keys()) {
      if (!universe.has(id)) captionAlpha.delete(id);
    }

    // ── Pass 2: lift each survivor and emit its caption + connector ──
    const liftedLabels: Label[] = [];
    const lines: MarkerLine[] = [];
    for (const { label, anchor, subjectSizePx, fadeAlpha } of toEmit) {
      // Constellation names anchor in empty space, so they skip the lift and emit
      // forward-projected. Their anchors sit far beyond the NEAR0 far plane, but
      // the overlay shader's clip-z clamp keeps them drawing; the far-plane clamp
      // and em-scaling below exist only for the INVERSE-projection lift path.
      if (label.kind === 'constellation') {
        liftedLabels.push({ ...label, worldPos: anchor, fadeAlpha });
        continue;
      }

      // Pull the anchor inside the NEAR0 far plane before the lift. A far star (VY
      // CMa at ~1.2e-3 Mpc) sits tens of MILLIONS of times beyond a far plane
      // floored at `FAR_MIN_MPC = 3e-11` on a deep Earth descent; the lift chain
      // INVERTS `rebasedVp`, and out there `ndc_z` rounds to 1.0 within f64 error
      // while the inverse's huge depth-row elements amplify the residual — the
      // caption and both leader endpoints then hop every frame the camera moves.
      //
      // In the camera-relative frame (eye at the origin) a uniform length scale
      // moves clip x/y/w together, so the screen position is IDENTICAL and only
      // depth slides into the well-conditioned interior. Everything sized off the
      // anchor's TRUE length (subjectSizePx, fade, declutter point) keeps the
      // un-clamped `anchor`; only the drawn geometry switches.
      const liftAnchor = clampVec3Length(anchor, view.slab.farMpc * NEAR0_FAR_CLAMP_FRACTION);

      // Obligatory companion to the clamp: the label shader sizes glyphs as
      // `pxPerEm = worldEmMpc / clip.w` (labels/vertex.wesl), so a PHYSICAL em at
      // the clamped depth inflates by exactly the clamp ratio — a sub-pixel
      // supergiant pins the max-px ceiling. Scaling the em by the same factor
      // restores em/clip.w to the true-depth value. (worldEmMpc, worldPos) must
      // always describe ONE frame: clamp both or neither.
      //
      // The ratio is READ OFF the clamp's output rather than re-derived from a
      // second `farMpc · NEAR0_FAR_CLAMP_FRACTION` spelling, so it can't drift.
      // `clampVec3Length` returns its input by reference when in range, making the
      // near-body case an exact no-op instead of a hypot round-off away from 1.
      const anchorScale =
        liftAnchor === anchor
          ? 1
          : Math.hypot(liftAnchor[0], liftAnchor[1], liftAnchor[2]) /
            Math.hypot(anchor[0], anchor[1], anchor[2]);
      const liftEmMpc = label.worldEmMpc * anchorScale;

      // Projecting through the clamped anchor + `rebasedVp` brings both endpoints
      // back in the SAME camera-relative frame, so the draw needs no second rebase.
      const placement = liftedLabelPlacement({
        anchorWorldPos: liftAnchor,
        vp: rebasedVp,
        viewportPx,
        subjectSizePx,
        textBbox: renderer.measure(label),
        worldEmMpc: liftEmMpc,
        minPixelSize: label.minPixelSize,
        maxPixelSize: label.maxPixelSize,
        // Apparent radius + gap, so the connector ends clear of the body's rim
        // rather than at its centre.
        lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
      });

      // Behind the camera there is no projection to lift from. The caption is
      // still emitted unlifted (the shader clips it on `clip.w`) so the emitted
      // set mirrors DEMAND rather than which side of the camera plane an anchor
      // happens to sit on this frame; no connector, since there is no geometry.
      if (placement === null) {
        liftedLabels.push({ ...label, worldPos: anchor, fadeAlpha });
        continue;
      }

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
          // Straight RGBA == premultiplied at alpha 1; the shader premultiplies
          // `fadeAlpha` on top, so the connector fades with its caption.
          pixelWidth: FAMOUS_LABEL_STYLE.pixelWidth,
          color: [...label.color],
          fadeAlpha,
        });
      }
    }

    renderer.setLabels(liftedLabels);

    // Both foreground renderers are the `occludeAgainstDepth` instances, so this
    // depth view is what makes captions and connectors hide behind nearer bodies.
    // Only valid when the body pass actually ran: the executor skips an empty
    // render step, and a stale `foreground:0` depth would discard EVERY caption.
    const depthView = ctx.renderedTargets.has('foreground:0')
      ? ctx.renderTargets.depthViewOf('foreground:0')
      : undefined;

    // Connectors BEFORE the captions, so the glyphs composite OVER the line where
    // they meet. A null line renderer just skips them; the captions still draw.
    if (lineRenderer !== null) {
      lineRenderer.setLines(lines);
      lineRenderer.draw(pass, rebasedVpF32, viewportPx, depthView);
    }
    renderer.draw(pass, rebasedVpF32, viewportPx, depthView);

    // Under render-on-demand a mid-ramp envelope has to ask for its next frame.
    if (anyRamping) state.subsystems.scheduler.requestRender();
  },
};
