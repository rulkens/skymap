/**
 * produceMissionCaptions — the missions Layer's NEAR0 `screenLabels` producer: one caption per
 * present craft (a sampled craft once its track is loaded), all switched by the one `craft`
 * item. Core captions no craft, so each has exactly one captioner. Only the sampled craft dim
 * when the visitor emphasises the other one: emphasis is a Voyager-exhibit idea.
 */

import type { LayerScreenLabel } from '../../../@types/engine/layer/LayerScreenLabel';
import { MISSIONS_BODY_ROWS } from '../bodies/missionsBodyRows';
import { CRAFT_ENTRY } from '../sources/craft';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { sceneBodyStates } from '../../../services/engine/frame/sceneBodyStates';
import { spacecraftPresent } from '../../../utils/scene/spacecraftPresent';
import { emphasisDim } from '../../../utils/scene/emphasisDim';
import { meshBodyCaption } from '../../../utils/labels/meshBodyCaption';
import { captionComposeContextOf } from '../../../utils/labels/captionComposeContextOf';
import { composeForegroundCaption } from '../../../utils/labels/composeForegroundCaption';
import { craftPickId } from './craftPickId';

const CRAFT = MISSIONS_BODY_ROWS.flatMap((row) =>
  isMeshBody(row.body) ? [{ body: row.body, sampled: row.position.kind === 'sampled' }] : [],
);

export const produceMissionCaptions: LayerScreenLabel<'missions'>['produceLabels'] = (
  state,
  ctx,
  fade,
) => {
  const { simDays } = ctx.snapshot;
  const composeCtx = captionComposeContextOf(state, ctx);
  const states = sceneBodyStates(state, ctx);
  const emphasis = state.settings.missions.craft;

  const labels = CRAFT.filter(({ body }) => spacecraftPresent(body.id, simDays)).map(
    ({ body, sampled }) =>
      composeForegroundCaption(
        composeCtx,
        meshBodyCaption(body, states.get(body.id)!.positionMpc, craftPickId(body.id)),
        fade[CRAFT_ENTRY.id]! * (sampled ? emphasisDim(emphasis, body.id) : 1),
      ),
  );
  return { labels, awake: false };
};
