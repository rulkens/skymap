/**
 * produceStarCaptions — the star Layer's NEAR0 `screenLabels` producer:
 * captions for the curated map and the Sun (the S-stars carry no caption kind
 * and are skipped), sharing `composeForegroundCaption` with
 * `produceSceneBodyCaptions`. The 119 base captions are memoised on the
 * `sceneBodyStates` Map's identity, same contract as core's `baseLabelsFor`.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import type { CaptionComposeContext } from '../../../@types/rendering/CaptionComposeContext';
import type { CaptionSourceRow } from '../@types/CaptionSourceRow';
import type { ForegroundCaption } from '../../../services/engine/presentation/foregroundCaption';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderBodies } from '../../../services/engine/frame/sceneOccluderBodies';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';
import { STAR_CAPTION_KIND } from './starCaptionKinds';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';

/**
 * The catalogs that caption, each carrying its own table — the star-Layer
 * twin of `sceneBodyLabels`' old unconditional `SCENE_STARS.map`/`SCENE_SUN.map`.
 * An S-star row never enters, since `STAR_CAPTION_KIND.sStar` is `null`.
 */
const CAPTION_SOURCE_ROWS: readonly CaptionSourceRow[] = [
  ...SEEDED_STAR_CATALOGS_BY_SOURCE,
].flatMap(([source, row]): readonly CaptionSourceRow[] => {
  const kind = STAR_CAPTION_KIND[row.id];
  return kind === null ? [] : [{ source, kind, stars: row.stars }];
});

// `sceneBodyStates` returns the SAME Map by reference while `simDays` is
// unchanged, so this identity check is a free change-detector — the same
// contract `produceSceneBodyCaptions.ts`'s `baseLabelsFor` keeps.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedCaptions: readonly ForegroundCaption[] = [];

function baseCaptionsFor(bodyStates: ReadonlyMap<string, BodyState>): readonly ForegroundCaption[] {
  if (bodyStates === cachedStates) return cachedCaptions;
  const built: ForegroundCaption[] = [];
  for (const row of CAPTION_SOURCE_ROWS) {
    row.stars.forEach((star, seedIndex) => {
      const pickId = packSelection(row.source, seedIndex + PICK_SENTINEL_OFFSET);
      built.push(
        bodyCaption(star, bodyStates.get(star.id)!.positionMpc, star.color, row.kind, pickId),
      );
    });
  }
  cachedCaptions = built;
  cachedStates = bodyStates;
  return cachedCaptions;
}

export function produceStarCaptions(): Label2DProducer['produceLabels'] {
  return (state: EngineState, ctx: FrameView): Label2DProducerOutput => {
    const now = ctx.snapshot.nowMs;
    // The Sun's tour-clip grouping rides WITH the bodies ('bodyLabel'), even
    // though its persistent Stars-panel toggle lives in the starCatalog
    // registry cluster — the two gates are independent by design (mirrors
    // `produceSceneBodyCaptions`'s identical split, preserved here verbatim).
    const clipFactorBody = state.subsystems.clipPlayer.clipOpacityOf('bodyLabel', now);
    const clipFactorStarCatalog = state.subsystems.clipPlayer.clipOpacityOf(
      'starCatalogLabel',
      now,
    );

    const composeCtx: CaptionComposeContext = {
      settings: state.settings,
      camPos: ctx.drawCamPos,
      camOrbitDistanceMpc: ctx.cam.distance,
      viewportShortSidePx: Math.min(ctx.canvasSize.width, ctx.canvasSize.height),
      drawPxPerRad: ctx.drawPxPerRad,
      fades: state.subsystems.fades,
      nowMs: now,
      occluders: sceneOccluderBodies(state, ctx),
    };

    const labels = baseCaptionsFor(sceneBodyStates(state, ctx)).map((label) =>
      composeForegroundCaption(
        composeCtx,
        label,
        label.kind === 'star' ? clipFactorStarCatalog : clipFactorBody,
      ),
    );

    return { labels, awake: false };
  };
}
