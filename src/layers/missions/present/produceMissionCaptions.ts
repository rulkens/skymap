/**
 * produceMissionCaptions — the missions Layer's NEAR0 `screenLabels` producer:
 * one mesh-body caption per sampled craft once its track is loaded, dimmed
 * when the visitor emphasises the other craft. Core's `sceneBodyLabels` leaves
 * these ids out, so each craft has exactly one captioner.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Label2DProducerOutput } from '../../../@types/engine/subsystems/Label2DProducerOutput';
import { SCENE_MESH_BODIES } from '../../../data/bodies/sceneMeshBodies';
import { ANCHORED_MESH_BODY_IDS } from '../../../data/bodies/anchoredMeshBodyIds';
import { SAMPLED_BODY_IDS } from '../../../data/missions/sampledBodyIds';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { findByIdOrThrow } from '../../../utils/object/findByIdOrThrow';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { emphasisDim } from '../../../utils/scene/emphasisDim';
import { meshBodyCaption } from '../../../utils/labels/meshBodyCaption';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

const CRAFT = SAMPLED_BODY_IDS.map((id) =>
  findByIdOrThrow(SCENE_MESH_BODIES, id, 'produceMissionCaptions'),
).filter((body) => !ANCHORED_MESH_BODY_IDS.has(body.id));

export function produceMissionCaptions(state: EngineState, ctx: FrameView): Label2DProducerOutput {
  const { nowMs, simDays } = ctx.snapshot;
  const present = CRAFT.filter((body) => spacecraftPresent(body.id, simDays));
  if (present.length === 0) return { labels: [], awake: false };

  // A tour cue addresses these with the near-field bodies' key, as it did
  // while core captioned them.
  const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('bodyLabel', nowMs);
  const composeCtx = captionComposeContextOf(state, ctx);
  const states = sceneBodyStates(state, ctx);
  const craft = state.settings.missions.craft;

  const labels = present.map((body) =>
    composeForegroundCaption(
      composeCtx,
      meshBodyCaption(body, states.get(body.id)!.positionMpc),
      clipFactor * emphasisDim(craft, body.id),
    ),
  );
  return { labels, awake: false };
}
