/**
 * produceConstellationCaptions — `Label2DProducer` for the true-3D
 * constellation stick-figure names.
 *
 * Candidate math only, mirroring `produceSceneBodyCaptions`: the NEAR0
 * `foregroundLabelDirector` owns declutter, the temporal envelope, and the
 * lift. Every figure shares ONE fade target this frame —
 * `constellationLayerOpacity`, the same home the stick-figure pass reads —
 * so the names dissolve in lock-step with the lines; the entries differ only
 * by anchor and text. Emitted even at target 0 (the zero-target landmine,
 * spec §4.6): only a genuinely unloaded artifact returns no candidates at
 * all.
 *
 * No `lift` field: the anchor is empty space at a figure centroid, not a
 * body, so there is nothing to float a caption above.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { constellationCaptions } from './constellationCaptions';
import { constellationLayerOpacity } from './constellationLayerOpacity';
import { resolveLayerOpacity } from './focusRecession';
import { CAPTION_PRIORITY, CAPTION_TIER_SCALE } from './captionPriority';

// Memoized on the artifact's identity (static once its slot lands); a
// released slot drops the set to empty so the captions dissolve with the
// producer. Moved verbatim from `foregroundLabelsLayer.ts`.
let cachedArtifact: ConstellationsArtifact | undefined;
let cachedCaptions: ReturnType<typeof constellationCaptions> = [];

function captionsFor(
  artifact: ConstellationsArtifact | undefined,
): ReturnType<typeof constellationCaptions> {
  if (artifact === undefined) {
    cachedArtifact = undefined;
    cachedCaptions = [];
    return cachedCaptions;
  }
  if (artifact !== cachedArtifact) {
    cachedCaptions = constellationCaptions(artifact);
    cachedArtifact = artifact;
  }
  return cachedCaptions;
}

// Below every scene-body caption (spec §4.5's tier table): a figure name
// always yields to a body caption in a screen-space collision. One constant
// for every figure — their anchors carry no apparent size, so the composed
// score has no within-tier tiebreak term (`Math.min(0, CAPTION_TIER_SCALE − 1)`).
const CONSTELLATION_PROMINENCE_PX = CAPTION_PRIORITY.constellation * CAPTION_TIER_SCALE;

export function produceConstellationCaptions(
  state: EngineState,
  ctx: ReadyFrameContext,
): Label2DProducerOutput {
  const slotState = state.assetSlots.constellations?.state();
  const artifact =
    slotState !== undefined && slotState.kind === 'ready' ? slotState.value : undefined;
  const captions = captionsFor(artifact);
  if (captions.length === 0) return { labels: [], awake: false };

  const camPos = ctx.drawCamPos;
  const constellationLayerFade = resolveLayerOpacity(state, ctx, { kind: 'constellations' });
  // ORIGIN distance, not the per-anchor distance the body captions read:
  // `constellationsLayer.enabled` keys its band on the eye's heliocentric
  // one, so every figure shares this one target.
  const constellationCamDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
  const fadeAlpha = constellationLayerOpacity(constellationCamDistMpc, constellationLayerFade);

  const labels: Label2D[] = captions.map((label) => {
    const anchor: Vec3 = [
      label.worldPos[0] - camPos[0],
      label.worldPos[1] - camPos[1],
      label.worldPos[2] - camPos[2],
    ];
    return { ...label, worldPos: anchor, fadeAlpha, prominencePx: CONSTELLATION_PROMINENCE_PX };
  });

  return { labels, awake: false };
}
