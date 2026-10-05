/**
 * produceSceneBodyCaptions — `Label2DProducer` candidate math for Earth, the
 * planets and the mesh bodies (the seeded stars and the Sun caption through
 * the star Layer's `produceStarCaptions` now, sharing the per-caption
 * compose `composeForegroundCaption`). Declutter, envelope and lift run in
 * `label2DDirector`; every candidate emits even at target 0 (a dropped id eases out instead of popping).
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import type { CaptionComposeContext } from '../../../@types/rendering/CaptionComposeContext';
import { sceneBodyLabels } from './sceneBodyLabels';
import { sceneBodyStates } from '../frame/sceneBodyStates';
import { sceneOccluderBodies } from '../frame/sceneOccluderBodies';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

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

  const composeCtx: CaptionComposeContext = {
    settings: state.settings,
    camPos: ctx.drawCamPos,
    // Orbit distance, NOT `|camPos|`: the bound the solar-system-reach kinds
    // ride, which diverges from origin distance once focus leaves the origin.
    camOrbitDistanceMpc: ctx.cam.distance,
    viewportShortSidePx: Math.min(ctx.canvasSize.width, ctx.canvasSize.height),
    drawPxPerRad: ctx.drawPxPerRad,
    fades: state.subsystems.fades,
    nowMs: now,
    // The overlay shaders attenuate per PIXEL, which cannot tell a subject in
    // FRONT of a body from one behind it — deciding that per caption is what
    // keeps the whale's name legible over Earth's disc while the Moon's still
    // sinks behind the limb.
    occluders: sceneOccluderBodies(state, ctx),
  };

  const labels = baseLabelsFor(sceneBodyStates(state, ctx)).map((label) =>
    composeForegroundCaption(composeCtx, label, clipFactorBody),
  );

  return { labels, awake: false };
}
