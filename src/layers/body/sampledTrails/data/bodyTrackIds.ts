/** The body Layer's bodies on a `sampled` position: the ids whose track files the Layer loads. */

import type { SceneBodyId } from '../../../../@types/scene/SceneBodyId';
import { BODY_BODY_ROWS } from '../../bodies/bodyBodyRows';

export const BODY_TRACK_IDS: readonly SceneBodyId[] = BODY_BODY_ROWS.flatMap((row) =>
  row.position.kind === 'sampled' ? [row.position.sampled.id] : [],
);
