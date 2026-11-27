/**
 * computes/index — CORE's half of the compute registry, as `passes/index.ts` is of the passes;
 * `createLayers` appends each Layer's own rows onto `state.computes`. `FRAME_ORDER` places them.
 */

import type { ContentCompute } from '../../../../@types/engine/frame/ContentCompute';
import { meshShadowsCompute } from './meshShadowsCompute';

export const CORE_COMPUTES: readonly ContentCompute[] = [meshShadowsCompute];
