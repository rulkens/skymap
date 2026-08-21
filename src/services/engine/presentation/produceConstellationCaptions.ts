/**
 * produceConstellationCaptions — `Label2DProducer` candidate math for the
 * true-3D constellation stick-figure names, mirroring
 * `produceSceneBodyCaptions`: declutter, envelope, and lift run in
 * `label2DDirector`. Every figure shares ONE fade target this frame
 * (`constellationLayerOpacity`, the same home the stick-figure pass reads)
 * and is emitted even at target 0 — only a genuinely unloaded artifact
 * returns no candidates at all. No `lift` field: the anchor is empty space
 * at a figure centroid, not a body, so there is nothing to float a caption
 * above.
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
// released slot drops the set to empty so the captions dissolve with it.
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

// Below every scene-body caption: a figure name always yields to a body
// caption in a screen-space collision. One constant for every figure — their
// anchors carry no apparent size, so there is no within-tier tiebreak term.
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
  // every figure shares this one heliocentric-band target.
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
