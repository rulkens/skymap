/**
 * CORE_PLANNERS — core's half of the contributed-planner registry;
 * `createLayers` appends each Layer's own rows. Order lives in `FRAME_ORDER`,
 * not this array (mirrors `CORE_COMPUTES`).
 */

import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import { structureMarkersPlanner } from './structureMarkersPlanner';

export const CORE_PLANNERS: readonly FrameContentPlanner<unknown>[] = [structureMarkersPlanner];
