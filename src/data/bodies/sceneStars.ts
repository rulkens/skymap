/**
 * sceneStars — the local star map: the descent's foreground stars, derived from
 * the generated seed table.
 *
 * These are data, not runtime state: constants the descent renders against once
 * the zoom reaches the local (sub-kiloparsec) neighbourhood. The rows are not
 * hand-authored here — they come from `famousStars.generated.ts` (baked from
 * `data/seeds/famous_stars.seed.json`, never hand-edited), and the `star` maker
 * converts each row's photometric units (temperature in kelvin, radius in solar
 * radii) into the drawn record's.
 *
 * A star's POSITION is not here: the same seed row's RA/Dec and distance become
 * a `SCENE_ANCHORS` root via `starAnchor`, and the frame's snapshot resolves it
 * — one map for every scene body, moving or not.
 */

import { star } from './makers/star';
import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import type { StarBody } from '../../@types/scene/StarBody';

/** The local star map, derived row-for-row from the generated seed table. */
export const SCENE_STARS: readonly StarBody[] = FAMOUS_STARS_GENERATED.map(star);
