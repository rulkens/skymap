/**
 * produceStarCaptions — the star Layer's NEAR0 `screenLabels` producer:
 * captions for the curated map and the Sun (the S-stars bear no label and are
 * skipped), sharing `composeForegroundCaption` with
 * `produceSceneBodyCaptions`. The 119 base captions are memoised on the
 * `sceneBodyStates` Map's identity, same contract as core's `baseLabelsFor`.
 */

import type { BodyState } from '../../../@types/scene/BodyState';
import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import type { CaptionSourceRow } from '../@types/CaptionSourceRow';
import type { ForegroundCaption } from '../../../services/engine/presentation/foregroundCaption';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';
import { isKeyOf } from '../../../utils/object/isKeyOf';
import { STAR_CAPTION_KIND } from './starCaptionKinds';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';

/** The catalogs that caption, each carrying its own table and its label item. */
const CAPTION_SOURCE_ROWS: readonly CaptionSourceRow[] = [
  ...SEEDED_STAR_CATALOGS_BY_SOURCE,
].flatMap(([source, row]): readonly CaptionSourceRow[] =>
  isKeyOf(STAR_CAPTION_KIND, row.id)
    ? [{ source, item: row.id, kind: STAR_CAPTION_KIND[row.id], stars: row.stars }]
    : [],
);

// `sceneBodyStates` returns the SAME Map by reference while `simDays` is
// unchanged, so this identity check is a free change-detector — the same
// contract `produceSceneBodyCaptions.ts`'s `baseLabelsFor` keeps. One caption
// list per `CAPTION_SOURCE_ROWS` row, index-aligned, so a caption finds its item.
let cachedStates: ReadonlyMap<string, BodyState> | undefined;
let cachedCaptions: readonly (readonly ForegroundCaption[])[] = [];

function baseCaptionsFor(
  bodyStates: ReadonlyMap<string, BodyState>,
): readonly (readonly ForegroundCaption[])[] {
  if (bodyStates === cachedStates) return cachedCaptions;
  cachedCaptions = CAPTION_SOURCE_ROWS.map((row) =>
    row.stars.map((star, seedIndex) =>
      bodyCaption(
        star,
        bodyFootprintRadiusM(star),
        bodyStates.get(star.id)!.positionMpc,
        star.color,
        row.kind,
        packSelection(row.source, seedIndex + PICK_SENTINEL_OFFSET),
      ),
    ),
  );
  cachedStates = bodyStates;
  return cachedCaptions;
}

export function produceStarCaptions(): LayerScreenLabel<'starCatalog'>['produceLabels'] {
  return (state, ctx, fade) => {
    const composeCtx = captionComposeContextOf(state, ctx);

    // Each caption reads its own catalog's item of the `label:starCatalog` value: the
    // Sun and the curated stars switch, fade and clip independently.
    const base = baseCaptionsFor(sceneBodyStates(state, ctx));
    const labels = CAPTION_SOURCE_ROWS.flatMap((row, i) =>
      base[i]!.map((label) => composeForegroundCaption(composeCtx, label, fade[row.item])),
    );

    return { labels, awake: false };
  };
}
