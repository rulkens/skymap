/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for Earth, the
 * planets and the mesh bodies `sceneBodyLabels` keeps (the stars, the Sun and
 * every body a Layer's label entry claims caption through that Layer's producer,
 * sharing the per-caption compose `composeForegroundCaption`). Declutter, envelope and lift run in
 * `label2DDirector`; every candidate emits even at target 0 (a dropped id eases out instead of popping).
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { CaptionKind } from './captionPriority';
import { sceneBodyLabels } from './sceneBodyLabels';
import { SCENE_BODY_CAPTION_LABEL } from '../../../data/labels/sceneBodyCaptionLabel';
import { EARTH_ENTRY } from '../../../data/sources/earth';
import { PLANET_ENTRY } from '../../../data/sources/planet';
import { MESH_BODY_ENTRY } from '../../../data/sources/mesh-body';
import { claimedLabelItemsOf } from '../../../utils/visibility/claimedLabelItemsOf';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

// Which item of core's own `label:body` entry carries each kind `sceneBodyLabels` emits:
// the source entry the kind's bodies caption under.
const BODY_CAPTION_ITEM: Readonly<
  Partial<Record<CaptionKind, LabelItemOf<typeof SCENE_BODY_CAPTION_LABEL>>>
> = { earth: EARTH_ENTRY.id, planet: PLANET_ENTRY.id, meshBody: MESH_BODY_ENTRY.id };

// `deriveBodyStates` returns the SAME Map by reference while `simDays` is
// unchanged, so this identity check is a free change-detector.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedClaimed: ReadonlySet<string> | undefined;
let cachedLabels: ReturnType<typeof sceneBodyLabels> = [];

function baseLabelsFor(
  bodyStates: ReadonlyMap<string, BodyState>,
  simDays: number,
  claimed: ReadonlySet<string>,
): ReturnType<typeof sceneBodyLabels> {
  if (bodyStates !== cachedStates || claimed !== cachedClaimed) {
    cachedLabels = sceneBodyLabels(bodyStates, simDays, claimed);
    cachedStates = bodyStates;
    cachedClaimed = claimed;
  }
  return cachedLabels;
}

// The composed entries are built once per engine, so their reference keys the claim set.
let claimedFor: readonly VisibilityEntry[] | undefined;
let claimed: ReadonlySet<string> = new Set();

function claimedBy(entries: readonly VisibilityEntry[]): ReadonlySet<string> {
  if (entries !== claimedFor) {
    claimed = claimedLabelItemsOf(entries, SCENE_BODY_CAPTION_LABEL);
    claimedFor = entries;
  }
  return claimed;
}

export const produceSceneBodyCaptions: LayerScreenLabel<
  typeof SCENE_BODY_CAPTION_LABEL
>['produceLabels'] = (state, ctx, fade) => {
  const composeCtx = captionComposeContextOf(state, ctx);
  const labels = baseLabelsFor(
    sceneBodyStates(state, ctx),
    ctx.snapshot.simDays,
    claimedBy(state.visibilityEntries),
  ).map((label) =>
    composeForegroundCaption(composeCtx, label, fade[BODY_CAPTION_ITEM[label.kind]!]),
  );

  return { labels, awake: false };
};
