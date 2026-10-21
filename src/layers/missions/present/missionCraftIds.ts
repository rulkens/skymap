import { MISSIONS_BODY_ROWS } from '../bodies/missionsBodyRows';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';

/**
 * The craft missions draws: its rows' mesh body ids. Presence needs no filter here, since the
 * frame's scene bodies hold only present craft.
 */
export const MISSION_CRAFT_IDS: ReadonlySet<string> = new Set(
  MISSIONS_BODY_ROWS.map((row) => row.body)
    .filter(isMeshBody)
    .map((body) => body.id),
);
