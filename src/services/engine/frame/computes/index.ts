/**
 * CORE's half of the contributed-compute registry; `createLayers` appends each
 * Layer's own rows. Order lives in `FRAME_ORDER`, not this array.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { aerialPerspectiveCompute } from '../../../../layers/body/computes/aerialPerspectiveCompute';
import { skyViewCompute } from '../../../../layers/body/computes/skyViewCompute';

export const CORE_COMPUTES: readonly ContentCompute[] = [skyViewCompute, aerialPerspectiveCompute];
