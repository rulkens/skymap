import type { AgentInitMode } from './AgentInitMode';
import type { McpmParams } from './McpmParams';

/**
 * SimSlice — the live MCPM knobs plus run lifecycle. `params` is read by the
 * harness every frame with no rebuild. Reset/clear-trace/export/scfd are no
 * longer state here: they're plain `createAction`s in `state/commands.ts`
 * that a saga (Tasks 7/8) `takeEvery`/`takeLeading`s directly.
 */
export type SimSlice = {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly running: boolean;
  readonly stepCount: number;
  readonly seed: number;
};
