/**
 * bootstrap — runs the engine's five async startup phases in fixed order,
 * each mutating `state.*` for the next to read (no return-value channel).
 * The caller (`engine.ts`) wraps this in one try/catch; phases never catch.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

import { initGpu } from './initGpu';
import { createLayers } from './createLayers';
import { wireSlots } from './wireSlots';
import { wireInput } from './wireInput';
import { startLoop } from './startLoop';

// createLayers runs right after initGpu (D7): it needs the four LayerCoreDeps
// prerequisites initGpu just built, and nothing before wireSlots needs it.
export async function runBootstrapPhases(state: EngineState, deps: BootstrapDeps): Promise<void> {
  await initGpu(state, deps);
  await createLayers(state, deps);
  await wireSlots(state, deps);
  await wireInput(state, deps);
  await startLoop(state, deps);
}
