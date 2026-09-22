/**
 * CORE_PLANNERS — the planners the engine core contributes to the frame
 * program; `createLayers` appends each Layer's own rows (`Layer.planners`)
 * to form `EngineState.planners`, the registry `runPlanSteps` and
 * `checkFrameOrder` resolve `plan` lines against. Order is NOT this array:
 * a planner runs where its `{ kind: 'plan', name }` line sits in
 * `frameSections.ts`, mirroring `CORE_COMPUTES`.
 */

import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import { structureMarkersPlanner } from './structureMarkersPlanner';

export const CORE_PLANNERS: readonly FrameContentPlanner<unknown>[] = [structureMarkersPlanner];
