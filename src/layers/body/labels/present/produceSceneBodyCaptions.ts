/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for the Earth, planet and small-body captions
 * `sceneBodyLabels` keeps, composed by the shared `composeForegroundCaption`. Declutter, envelope
 * and lift run in `label2DDirector`; every candidate emits even at target 0 so a dropped id eases out.
 */

import type { BodyState } from '../../../../@types/scene/BodyState';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import { sceneBodyLabels } from './sceneBodyLabels';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../../utils/labels/composeForegroundCaption';

// The body snapshot is the SAME Map while `simDays` is unchanged and nothing moving is selected
// (`placeLiveSelection`): a free change-detector.
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

export const produceSceneBodyCaptions: LayerScreenLabel<'body'>['produceLabels'] = (
  state,
  ctx,
  fade,
) => {
  const composeCtx = captionComposeContextOf(state, ctx);
  const labels = baseLabelsFor(sceneBodyStates(state, ctx)).map((label) =>
    composeForegroundCaption(composeCtx, label, fade[label.item]),
  );

  return { labels, awake: false };
};
