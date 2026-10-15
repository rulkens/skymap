/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for Earth, the
 * planets and the mesh bodies `sceneBodyLabels` keeps (the stars, the Sun and
 * the sampled craft caption through their Layers' producers, sharing the
 * per-caption compose `composeForegroundCaption`). Declutter, envelope and lift run in
 * `label2DDirector`; every candidate emits even at target 0 (a dropped id eases out instead of popping).
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { sceneBodyLabels } from './sceneBodyLabels';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

// `deriveBodyStates` returns the SAME Map by reference while `simDays` is
// unchanged, so this identity check is a free change-detector.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedLabels: ReturnType<typeof sceneBodyLabels> = [];

function baseLabelsFor(
  bodyStates: ReadonlyMap<string, BodyState>,
  simDays: number,
): ReturnType<typeof sceneBodyLabels> {
  if (bodyStates !== cachedStates) {
    cachedLabels = sceneBodyLabels(bodyStates, simDays);
    cachedStates = bodyStates;
  }
  return cachedLabels;
}

export function produceSceneBodyCaptions(
  state: EngineState,
  ctx: FrameView,
): Label2DProducerOutput {
  const now = ctx.snapshot.nowMs;
  // Hoisted, not resolved per-caption: every kind this producer emits shares
  // the bodyLabel clip key (the star Layer's own producer owns starCatalogLabel
  // now), so it is a single frame-constant literal (the
  // `produceStructureMarkers.ts:65` / `produceFamousGalaxyLabels.ts:218` idiom).
  const clipFactorBody = state.subsystems.clipPlayer.clipOpacityOf('bodyLabel', now);

  const composeCtx = captionComposeContextOf(state, ctx);
  const labels = baseLabelsFor(sceneBodyStates(state, ctx), ctx.snapshot.simDays).map((label) =>
    composeForegroundCaption(composeCtx, label, clipFactorBody),
  );

  return { labels, awake: false };
}
