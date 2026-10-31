/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for the Earth and planet captions
 * `sceneBodyLabels` keeps, composed by the shared `composeForegroundCaption`. Declutter, envelope
 * and lift run in `label2DDirector`; every candidate emits even at target 0 so a dropped id eases out.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';
import { sceneBodyLabels } from './sceneBodyLabels';
import { EARTH_ENTRY } from '../sources/earth';
import { SMALL_BODY_ENTRY } from '../sources/smallBody';
import { PLANET_ENTRY } from '../sources/planet';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

const BODY_CAPTION_ITEM: Readonly<Partial<Record<CaptionKind, LabelItemOf<'body'>>>> = {
  earth: EARTH_ENTRY.id,
  planet: PLANET_ENTRY.id,
  smallBody: SMALL_BODY_ENTRY.id,
};

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
    composeForegroundCaption(composeCtx, label, fade[BODY_CAPTION_ITEM[label.kind]!]),
  );

  return { labels, awake: false };
};
