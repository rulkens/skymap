/**
 * produceBlackHoleCaptions — the blackHoles Layer's NEAR0 `screenLabels`
 * producer: one caption per hole at its place, composed through
 * `composeForegroundCaption` like the star and body captions. The hole draws
 * nothing inside its lens band's far side, so this caption is often its whole
 * on-screen presence, and it is the pick surface there (the stamp packs the
 * same `Source.SgrAStar` + row index `blackHoleSelectionRow` resolves).
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducer } from '../../../@types/engine/subsystems/Label2DProducer';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import type { CaptionComposeContext } from '../../../@types/rendering/CaptionComposeContext';
import { Source } from '../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { sceneOccluderBodies } from '../../../services/engine/frame/sceneOccluderBodies';
import { bodyCaption } from '../../../utils/labels/bodyCaption';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { BLACK_HOLES } from '../data/blackHoles';
import { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';

/**
 * A hole has no light to take a colour from, so the tint is authored: a warm
 * accretion amber, distinct from every blue-to-white star tint so the Galactic
 * Centre reads as a landmark rather than one more name in the star map.
 */
const BLACK_HOLE_CAPTION_TINT: Readonly<Vec3> = [1, 0.66, 0.32];

const ENTRIES = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry);

export function produceBlackHoleCaptions(): Label2DProducer['produceLabels'] {
  return (state: EngineState, ctx: FrameView): Label2DProducerOutput => {
    const now = ctx.snapshot.nowMs;
    // A tour cue addresses this caption with the near-field bodies' key, as it
    // did while Sgr A* was a body.
    const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('bodyLabel', now);
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
    const states = sceneBodyStates(state, ctx);

    const labels = BLACK_HOLES.map((row, i) =>
      composeForegroundCaption(
        composeCtx,
        bodyCaption(
          findByIdOrThrow(ENTRIES, row.id, 'produceBlackHoleCaptions'),
          schwarzschildRadiusM(row.massSolar),
          states.get(row.anchorId)!.positionMpc,
          BLACK_HOLE_CAPTION_TINT,
          'sgrAStar',
          packSelection(Source.SgrAStar, i + PICK_SENTINEL_OFFSET),
        ),
        clipFactor,
      ),
    );

    return { labels, awake: false };
  };
}
