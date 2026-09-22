/**
 * CORE_PLANNERS — core's half of the contributed-planner registry;
 * `createLayers` appends each Layer's own rows. Order lives in `FRAME_ORDER`,
 * not this array (mirrors `CORE_COMPUTES`).
 */

import type { ContentPlanner } from '../../../../@types/engine/frame/ContentPlanner';
import { structureMarkersPlanner } from './structureMarkersPlanner';

export const CORE_PLANNERS: readonly ContentPlanner<unknown>[] = [structureMarkersPlanner];
