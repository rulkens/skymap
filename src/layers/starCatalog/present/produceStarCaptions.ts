/**
 * produceStarCaptions — the star Layer's NEAR0 `screenLabels` producer:
 * captions for the curated map and the Sun (the S-stars carry no caption kind
 * and are skipped), composed the same way `produceSceneBodyCaptions` composes
 * a planet's. `runtime` is unread; kept for parity with the Layer's other
 * guide/pass factories, all of which close over it.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { StarBody } from '../../../@types/scene/StarBody';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';
import type { StarCatalogRuntime } from '../@types/StarCatalogRuntime';
import { SEEDED_STAR_CATALOGS } from '../../../data/bodies/seededStarCatalogs';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderBodies } from '../../../services/engine/frame/sceneOccluderBodies';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { STAR_CAPTION_KIND } from './starCaptionKinds';
import { STAR_CATALOG_SOURCE_ROWS } from '../sources/starCatalogSourceRows';
import { CAPTION_FADE_RULES } from '../../../services/engine/presentation/captionFadeRules';
import {
  CAPTION_PRIORITY,
  CAPTION_TIER_SCALE,
} from '../../../services/engine/presentation/captionPriority';
import { apparentSizePx } from '../../../utils/math/apparentSizePx';
import { overflowFade } from '../../../utils/scene/overflowFade';
import { subjectOccludedByBodies } from '../../../utils/occlusion/subjectOccludedByBodies';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { LEADER_LINE_BOTTOM_GAP_PX } from '../../../services/engine/presentation/leaderLineStyle';

type CaptionSourceRow = {
  readonly source: StarCatalogSourceType;
  readonly kind: CaptionKind;
  readonly stars: readonly StarBody[];
};

/**
 * The catalogs that caption, each carrying its own table — the star-Layer
 * twin of `sceneBodyLabels`' old unconditional `SCENE_STARS.map`/`SCENE_SUN.map`.
 * Unconditional on purpose: every row here is emitted EVERY frame regardless of
 * settings (the zero-target-still-emitted contract `CAPTION_FADE_RULES` below
 * enforces via `fadeAlpha`), so a toggled-off caption eases out through the
 * director's envelope instead of popping — an S-star row never enters at all,
 * since `STAR_CAPTION_KIND.sStar` is `null`.
 */
const CAPTION_SOURCE_ROWS: readonly CaptionSourceRow[] = STAR_CATALOG_SOURCE_ROWS.flatMap(
  ([code, entry]): readonly CaptionSourceRow[] => {
    if (entry.binBaseName !== null) return [];
    const kind = STAR_CAPTION_KIND[entry.id as SeededStarCatalogId];
    return kind === null
      ? []
      : [
          {
            source: code as StarCatalogSourceType,
            kind,
            stars: SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId],
          },
        ];
  },
);

export function produceStarCaptions(runtime: StarCatalogRuntime): Label2DProducer['produceLabels'] {
  return (state: EngineState, ctx: FrameView): Label2DProducerOutput => {
    const settings = state.settings;
    const camPos = ctx.drawCamPos;
    const camOrbitDistanceMpc = ctx.cam.distance;
    const viewportShortSidePx = Math.min(ctx.canvasSize.width, ctx.canvasSize.height);
    const fades = state.subsystems.fades;
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
    const bodyStates = sceneBodyStates(state, ctx);
    const occluders = sceneOccluderBodies(state, ctx);

    const labels: Label2D[] = [];
    for (const row of CAPTION_SOURCE_ROWS) {
      row.stars.forEach((star, seedIndex) => {
        const pickId = packSelection(row.source, seedIndex + PICK_SENTINEL_OFFSET);
        const label = bodyCaption(
          star,
          bodyStates.get(star.id)!.positionMpc,
          star.color,
          row.kind,
          pickId,
        );

        const anchor: Vec3 = [
          label.worldPos[0] - camPos[0],
          label.worldPos[1] - camPos[1],
          label.worldPos[2] - camPos[2],
        ];
        const distanceMpc = Math.hypot(anchor[0], anchor[1], anchor[2]);
        const subjectSizePx = apparentSizePx({
          diameterKpc: (2 * label.worldEmMpc) / SCALE_UNITS.KPC_TO_MPC,
          distanceMpc,
          pxPerRad: ctx.drawPxPerRad,
        });

        const rule = CAPTION_FADE_RULES[row.kind];
        const registryOpacity =
          rule.fadeHandle === null ? 1 : fades.opacityOf(rule.fadeHandle, now);
        const clipFactor = row.kind === 'star' ? clipFactorStarCatalog : clipFactorBody;
        const ruleGate =
          rule.subjectVisible(settings) && (rule.labelEnabled(settings) || registryOpacity > 0)
            ? 1
            : 0;
        const fadeAlpha =
          ruleGate *
          rule.fadeTarget(distanceMpc, camOrbitDistanceMpc) *
          overflowFade(subjectSizePx, viewportShortSidePx) *
          registryOpacity *
          clipFactor;

        const prominencePx =
          CAPTION_PRIORITY[row.kind] * CAPTION_TIER_SCALE +
          Math.min(subjectSizePx, CAPTION_TIER_SCALE - 1);

        labels.push({
          ...label,
          worldPos: anchor,
          fadeAlpha,
          occludeWeight: subjectOccludedByBodies({
            subjectMpc: label.worldPos,
            camPosMpc: camPos,
            bodies: occluders,
          })
            ? 1
            : 0,
          occludeNearKm:
            (distanceMpc - label.worldEmMpc) * SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM,
          prominencePx,
          lift: {
            subjectSizePx,
            lineBottomLiftPx: subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX,
          },
        });
      });
    }

    return { labels, awake: false };
  };
}
