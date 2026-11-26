/** The craft whose trails core's sampled-trails pass draws, each with its tint (linear HDR). */

import type { SampledTrailRow } from '../../../../@types/engine/layer/SampledTrailRow';
import { VOYAGER_1_LIME, VOYAGER_2_GREEN } from '../../../../data/bodies/palette';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';

export const MISSION_TRAIL_ROWS: readonly SampledTrailRow[] = [
  { id: asSceneBodyId('voyager1'), color: VOYAGER_1_LIME },
  { id: asSceneBodyId('voyager2'), color: VOYAGER_2_GREEN },
];
