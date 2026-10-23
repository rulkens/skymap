import { MISSIONS_BODY_ROWS } from '../bodies/missionsBodyRows';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import type { SceneBodyId } from '../../../@types/scene/SceneBodyId';

/**
 * The craft missions draws: the ids of its rows' mesh bodies. Presence needs no filter here, since the
 * frame's scene bodies hold only present craft.
 */
export const MISSION_CRAFT_IDS: ReadonlySet<SceneBodyId> = new Set(
  MISSIONS_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => body.id),
);
