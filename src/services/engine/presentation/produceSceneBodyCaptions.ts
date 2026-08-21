/**
 * produceSceneBodyCaptions — `Label2DProducer` for the true-scale foreground
 * bodies (Earth, the local star map, the planets, Sgr A*).
 *
 * Candidate math only: this computes each caption's camera-relative anchor,
 * apparent size, and fade TARGET, then hands the raw candidate to the NEAR0
 * `foregroundLabelDirector` — declutter, the temporal envelope, and the
 * screen-space lift all run in the director now (`label2DDirector.ts`), not
 * here. Every candidate is emitted, including a target of 0: the director's
 * `exponentialApproach` envelope drops a truly ABSENT id immediately but eases
 * an emitted-target-0 id smoothly toward invisible, so omitting a gated-off
 * caption here would make it pop instead of fade (spec §4.6).
 *
 * `worldPos` is emitted CAMERA-RELATIVE (`bodyWorldPos − ctx.drawCamPos`): the
 * NEAR0 director's `project` config rebases its vp about `ctx.drawCamPos` in
 * f64 before projecting (`near0LabelProjection.ts`), so every label it
 * receives must already sit in that frame — the same precision fix
 * `foregroundLabelsLayer` applied inline before this producer existed.
 *
 * `prominencePx` composes the declutter score every body caption has always
 * used: kind tier (`CAPTION_PRIORITY`) dominates, apparent size only breaks a
 * within-tier tie (`captionPriority.ts`). Sgr A*'s target falls out of the
 * ordinary per-kind loop below through `CAPTION_FADE_RULES.sgrAStar` — the
 * same number `sgrAStarCaptionTarget` computes for its OTHER call sites — so
 * there is no separate demand gate here, only the emitted candidate.
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

// Memoized on the body-state snapshot: `deriveBodyStates` returns the SAME Map
// by reference while `simDays` is unchanged, so this identity check is a free
// change-detector — a paused clock never rebuilds the captions. Moved
// verbatim from `foregroundLabelsLayer.ts`.
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
  // Orbit distance, NOT `|camPos|`: it measures to the orbit TARGET, which is
  // the bound the solar-system-reach kinds ride. The two diverge the moment
  // the camera frames something off the origin.
  const camOrbitDistanceMpc = ctx.cam.distance;
  const viewportHeightPx = ctx.canvasSize.height;
  const fovYRad = ctx.fovYRad;

  const labels: Label2D[] = [];
  for (const label of baseLabelsFor(sceneBodyStates(state, ctx))) {
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
      viewportHeightPx,
      fovYRad,
    });

    // Both gates must be open before the band is consulted; a closed one
    // zeroes the target, which then eases out through the director's
    // envelope rather than popping.
    const rule = CAPTION_FADE_RULES[label.kind];
    const fadeAlpha =
      rule.labelEnabled(settings) && rule.subjectVisible(settings)
        ? rule.fadeTarget(distanceMpc, camOrbitDistanceMpc)
        : 0;

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
        // Apparent radius + gap, so the connector ends clear of the body's
        // rim rather than at its centre.
        lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
      },
    });
  }

  return { labels, awake: false };
}
