/** The small bodies whose sampled trails core's sampled-trails pass draws, each with its tint. */

import type { SampledTrailRow } from '../../../../@types/engine/layer/SampledTrailRow';
import { SMALL_BODY_ROCK } from '../../../../data/bodies/palette';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

export const BODY_SAMPLED_TRAIL_ROWS: readonly SampledTrailRow[] = [
  { id: asSceneBodyId('2026-qq8'), color: SMALL_BODY_ROCK },
];
