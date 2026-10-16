/**
 * produceBlackHoleCaptions — the blackHoles Layer's NEAR0 `screenLabels`
 * producer: one caption per hole at its place, composed through
 * `composeForegroundCaption` like the star and body captions. Inside the lens
 * band, where the marker has faded, the caption is what marks the hole.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { BLACK_HOLES } from '../data/blackHoles';
import { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';
import { blackHoleAnchorId } from './blackHoleAnchorId';

/**
 * A hole has no light to take a colour from, so the tint is authored: a warm
 * accretion amber, distinct from every blue-to-white star tint so the Galactic
 * Centre reads as a landmark rather than one more name in the star map.
 */
const BLACK_HOLE_CAPTION_TINT: Readonly<Vec3> = [1, 0.66, 0.32];

const ENTRIES = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry);

export function produceBlackHoleCaptions(): (
  state: EngineState,
  ctx: FrameView,
  fade: Readonly<Record<string, number>>,
) => Label2DProducerOutput {
  return (state, ctx, fade) => {
    const composeCtx = captionComposeContextOf(state, ctx);
    const states = sceneBodyStates(state, ctx);

    const labels = BLACK_HOLES.map((row, i) => {
      const caption = bodyCaption(
        findByIdOrThrow(ENTRIES, row.id, 'produceBlackHoleCaptions'),
        schwarzschildRadiusM(row.massSolar),
        states.get(blackHoleAnchorId(row))!.positionMpc,
        BLACK_HOLE_CAPTION_TINT,
        'sgrAStar',
        packSelection(Source.SgrAStar, i + PICK_SENTINEL_OFFSET),
      );
      return composeForegroundCaption(composeCtx, caption, fade[row.id]!);
    });

    return { labels, awake: false };
  };
}
