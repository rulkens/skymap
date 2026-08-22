/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for Earth, the
 * local star map, the planets, and Sgr A*. Declutter, envelope, and lift run
 * in `label2DDirector`; every candidate emits even at target 0 (the
 * director's exponential envelope drops only genuinely absent ids, easing an
 * emitted-0 id instead of popping it). `prominencePx` (composed declutter
 * rank) and `lift.subjectSizePx` (raw apparent size) stay distinct facts.
 * Sgr A*'s target falls out of the generic per-kind loop below, not a
 * separate `sgrAStarCaptionTarget` call: both read the same `SCENE_ANCHORS`
 * position by reference and the zero `RENDER_ORIGIN_MPC`, ending in the same
 * `CAPTION_FADE_RULES.sgrAStar.fadeTarget` — identical by construction.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { sceneBodyLabels } from './sceneBodyLabels';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { CAPTION_FADE_RULES } from './captionFadeRules';
import { CAPTION_PRIORITY, CAPTION_TIER_SCALE } from './captionPriority';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { LEADER_LINE_BOTTOM_GAP_PX } from './leaderLineStyle';

// `deriveBodyStates` returns the SAME Map by reference while `simDays` is
// unchanged, so this identity check is a free change-detector.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedLabels: ReturnType<typeof sceneBodyLabels> = [];

function baseLabelsFor(
  bodyStates: ReadonlyMap<string, BodyState>,
): ReturnType<typeof sceneBodyLabels> {
  if (bodyStates !== cachedStates) {
    cachedLabels = sceneBodyLabels(bodyStates);
    cachedStates = bodyStates;
  }
  return cachedLabels;
}

export function produceSceneBodyCaptions(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label2DProducerOutput {
  const settings = state.settings;
  const camPos = ctx.drawCamPos;
  // Orbit distance, NOT `|camPos|`: the bound the solar-system-reach kinds
  // ride, which diverges from origin distance once focus leaves the origin.
  const camOrbitDistanceMpc = ctx.cam.distance;
  const viewportHeightPx = ctx.canvasSize.height;
  const fovYRad = ctx.fovYRad;

  const fades = state.subsystems.fades;
  const now = ctx.nowMs;
  // Hoisted, not resolved per-caption: every 'star' kind shares the
  // starCatalogLabel clip key and every other kind shares bodyLabel, so each
  // is a single frame-constant literal (the `produceStructureMarkers.ts:65` /
  // `produceFamousGalaxyLabels.ts:218` idiom).
  const clipFactorBody = state.subsystems.clipPlayer.clipOpacityOf('bodyLabel', now);
  const clipFactorStarCatalog = state.subsystems.clipPlayer.clipOpacityOf('starCatalogLabel', now);

  const labels: Label2D[] = [];
  for (const label of baseLabelsFor(sceneBodyStates(state, ctx))) {
    const anchor: Vec3 = [
      label.worldPos[0] - camPos[0],
      label.worldPos[1] - camPos[1],
      label.worldPos[2] - camPos[2],
    ];

    // `worldEmMpc` is the body's RADIUS in Mpc, hence the `2 ×` diameter.
    const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
    const subjectSizePx = apparentSizePx({
      diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx,
      fovYRad,
    });

    const rule = CAPTION_FADE_RULES[label.kind];
    const handle = rule.fadeHandle;
    // `null` only for the constellation row, which `sceneBodyLabels` never
    // emits (see `CAPTION_FADE_RULES.constellation`'s docblock) — the ternary
    // exists for the type, not because this branch runs.
    const registryOpacity = handle === null ? 1 : fades.opacityOf(handle, now);
    const clipFactor = label.kind === 'star' ? clipFactorStarCatalog : clipFactorBody;
    // Keep-emitting gate: a toggled-off caption stays gated OPEN while its
    // registry ramp still has opacity to give, so the ramp's multiply carries
    // the fade-out to completion instead of the boolean truncating it (the
    // `produceMilkyWayLabel.ts:48` / `produceFamousGalaxyLabels.ts:174-179`
    // idiom). `subjectVisible` stays a hard gate — unrelated to this toggle.
    const ruleGate =
      rule.subjectVisible(settings) && (rule.labelEnabled(settings) || registryOpacity > 0) ? 1 : 0;
    const fadeAlpha =
      ruleGate * rule.fadeTarget(distanceMpc, camOrbitDistanceMpc) * registryOpacity * clipFactor;

    const prominencePx =
      CAPTION_PRIORITY[label.kind] * CAPTION_TIER_SCALE +
      Math.min(subjectSizePx, CAPTION_TIER_SCALE - 1);

    labels.push({
      ...label,
      worldPos: anchor,
      fadeAlpha,
      prominencePx,
      lift: {
        subjectSizePx,
        // Apparent radius + gap: the connector ends clear of the body's rim.
        lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
      },
    });
  }

  return { labels, awake: false };
}
