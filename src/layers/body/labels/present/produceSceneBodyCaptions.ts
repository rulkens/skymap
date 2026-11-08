/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for the Earth, planet and small-body captions
 * `sceneBodyLabels` keeps, composed by the shared `composeForegroundCaption`. Declutter, envelope
 * and lift run in `label2DDirector`; every candidate emits even at target 0 so a dropped id eases out.
 */

import type { BodyState } from '../../../../@types/scene/BodyState';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { sceneBodyLabels } from './sceneBodyLabels';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../../utils/labels/composeForegroundCaption';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// A ring's plane is its host's equator, so its pole is the body frame's third column.
const RINGS = SCENE_RINGS.map((r) => ({
  id: `sceneBody-${r.bodyId}`,
  bodyId: r.bodyId,
  outerRadiusMpc: r.outerRadiusKm * SCALE_UNITS.KM_TO_MPC,
}));

export function produceSceneBodyCaptions(
  pickCodes: BodyRuntime['pickCodes'],
): LayerScreenLabel<'body'>['produceLabels'] {
  const codeOf = bodyCodeOf(pickCodes);
  // The body snapshot is the SAME Map while `simDays` is unchanged and nothing moving is selected
  // (`placeLiveSelection`): a free change-detector.
  let cachedStates: ReadonlyMap<string, BodyState> | undefined;
  let cachedLabels: ReturnType<typeof sceneBodyLabels> = [];

  function baseLabelsFor(
    bodyStates: ReadonlyMap<string, BodyState>,
  ): ReturnType<typeof sceneBodyLabels> {
    if (bodyStates !== cachedStates) {
      cachedLabels = sceneBodyLabels(bodyStates, codeOf);
      cachedStates = bodyStates;
    }
    return cachedLabels;
  }

  return (state, ctx, fade) => {
    const composeCtx = captionComposeContextOf(state, ctx);
    const bodyStates = sceneBodyStates(state, ctx);
    const labels = baseLabelsFor(bodyStates).map((label) => {
      const caption = composeForegroundCaption(composeCtx, label, fade[label.item]);
      const ring = RINGS.find((r) => r.id === label.id);
      if (!ring || !caption.lift) return caption;
      const m = bodyStates.get(ring.bodyId)!.orientation;
      const pole = [m[6], m[7], m[8]] as const;
      return {
        ...caption,
        lift: { ...caption.lift, ring: { pole, outerRadiusMpc: ring.outerRadiusMpc } },
      };
    });

    return { labels, awake: false };
  };
}
