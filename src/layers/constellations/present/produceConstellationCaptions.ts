/**
 * produceConstellationCaptions — `Label2DProducer` candidate math for the
 * true-3D constellation stick-figure names, mirroring
 * `produceSceneBodyCaptions`: declutter, envelope, and lift run in
 * `label2DDirector`. Every figure shares ONE fade target this frame
 * (the names' label value, which carries the same band as the stick-figure pass) and is
 * emitted even at target 0 — only an unloaded artifact returns no candidates at all. No `lift` field: the anchor is empty space
 * at a figure centroid, not a body, so there is nothing to float a caption
 * above.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { ConstellationsRuntime } from '../@types/ConstellationsRuntime';
import { constellationCaptions } from './constellationCaptions';
import {
  CAPTION_PRIORITY,
  CAPTION_TIER_SCALE,
} from '../../../services/engine/presentation/captionPriority';

// Below every scene-body caption: a figure name always yields to a body
// caption in a screen-space collision. One constant for every figure — their
// anchors carry no apparent size, so there is no within-tier tiebreak term.
const CONSTELLATION_PROMINENCE_PX = CAPTION_PRIORITY.constellation * CAPTION_TIER_SCALE;

export function produceConstellationCaptions(
  runtime: ConstellationsRuntime,
): LayerScreenLabel<'constellations'>['produceLabels'] {
  // Memoized on the artifact's identity (static once its slot lands); a
  // released slot drops the set to empty so the captions dissolve with it.
  // Scoped to this closure, not module-level: a second engine instance must
  // not share the cache.
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

  return (_state, ctx, fade) => {
    const artifact = runtime.slot.committed()?.value;
    const captions = captionsFor(artifact);
    if (captions.length === 0) return { labels: [], awake: false };

    const camPos = ctx.drawCamPos;

    const labels: Label2D[] = captions.map((label) => {
      const anchor: Vec3 = [
        label.worldPos[0] - camPos[0],
        label.worldPos[1] - camPos[1],
        label.worldPos[2] - camPos[2],
      ];
      return {
        ...label,
        worldPos: anchor,
        fadeAlpha: fade,
        prominencePx: CONSTELLATION_PROMINENCE_PX,
      };
    });

    return { labels, awake: false };
  };
}
