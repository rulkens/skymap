/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for Earth and the
 * planets `sceneBodyLabels` keeps (the stars, the Sun and the craft caption through that Layer's producer,
 * sharing the per-caption compose `composeForegroundCaption`). Declutter, envelope and lift run in
 * `label2DDirector`; every candidate emits even at target 0 (a dropped id eases out instead of popping).
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { CaptionKind } from './captionPriority';
import { sceneBodyLabels } from './sceneBodyLabels';
import { SCENE_BODY_CAPTION_LABEL } from '../../../data/labels/sceneBodyCaptionLabel';
import { SOURCE_REGISTRY, Source } from '../../../data/sources';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

// Which item of core's own `label:body` entry carries each kind `sceneBodyLabels` emits:
// the source entry the kind's bodies caption under.
const BODY_CAPTION_ITEM: Readonly<
  Partial<Record<CaptionKind, LabelItemOf<typeof SCENE_BODY_CAPTION_LABEL>>>
> = { earth: SOURCE_REGISTRY[Source.Earth].id, planet: SOURCE_REGISTRY[Source.Planet].id };

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

export const produceSceneBodyCaptions: LayerScreenLabel<
  typeof SCENE_BODY_CAPTION_LABEL
>['produceLabels'] = (state, ctx, fade) => {
  const composeCtx = captionComposeContextOf(state, ctx);
  const labels = baseLabelsFor(sceneBodyStates(state, ctx)).map((label) =>
    composeForegroundCaption(composeCtx, label, fade[BODY_CAPTION_ITEM[label.kind]!]),
  );

  return { labels, awake: false };
};
