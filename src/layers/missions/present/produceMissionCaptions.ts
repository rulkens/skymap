/**
 * produceMissionCaptions — the missions Layer's NEAR0 `screenLabels` producer:
 * one mesh-body caption per sampled craft once its track is loaded, dimmed
 * when the visitor emphasises the other craft. The label entry's `items` claim
 * these ids from core's scene-body captions, so each craft has exactly one captioner.
 */

import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import { MISSIONS_BODY_ROWS } from '../bodies/missionsBodyRows';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { emphasisDim } from '../../../utils/scene/emphasisDim';
import { meshBodyCaption } from '../../../utils/labels/meshBodyCaption';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';

const CRAFT = MISSIONS_BODY_ROWS.filter((row) => row.position.kind === 'sampled')
  .map((row) => row.body)
  .filter(isMeshBody);

export const produceMissionCaptions: LayerScreenLabel<'missions'>['produceLabels'] = (
  state,
  ctx,
  fade,
) => {
  const { simDays } = ctx.snapshot;
  const present = CRAFT.filter((body) => spacecraftPresent(body.id, simDays));
  if (present.length === 0) return { labels: [], awake: false };

  const composeCtx = captionComposeContextOf(state, ctx);
  const states = sceneBodyStates(state, ctx);
  const craft = state.settings.missions.craft;

  const labels = present.map((body) =>
    composeForegroundCaption(
      composeCtx,
      meshBodyCaption(body, states.get(body.id)!.positionMpc),
      fade[body.id]! * emphasisDim(craft, body.id),
    ),
  );
  return { labels, awake: false };
};
