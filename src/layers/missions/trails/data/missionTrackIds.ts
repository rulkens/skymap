/** The missions bodies on a `sampled` position: the ids whose track files the Layer loads. */

import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import { MISSIONS_BODY_ROWS } from '../../bodies/missionsBodyRows';

export const MISSION_TRACK_IDS: readonly SceneBodyId[] = MISSIONS_BODY_ROWS.flatMap((row) =>
  row.position.kind === 'sampled' ? [row.position.sampled.id] : [],
);
