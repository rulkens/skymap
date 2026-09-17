/**
 * computes/index — CORE's half of the contributed-compute registry;
 * `createLayers` appends each Layer's own compute rows onto `state.computes`.
 * It states no order — `FRAME_ORDER` (`frameOrder.ts`) is the one artifact
 * naming which row runs, in what order, in the frame's prelude.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { flowCompute } from './flowCompute';
import { skyViewCompute } from './skyViewCompute';

/** Core's contributed compute rows, as a flat set. States no order or grouping. */
export const CORE_COMPUTES: readonly ContentCompute[] = [flowCompute, skyViewCompute];
