import type { AgentInitMode } from './AgentInitMode';
import type { McpmParams } from './McpmParams';

/**
 * SimSlice — the live MCPM knobs plus run lifecycle. `params` is read by the
 * harness every frame with no rebuild; `resetToken`/`clearTraceToken` are
 * one-shot commands (Viewport diffs them against the last value it
 * processed and calls `harness.reset`/`clearTrace`, then acks by mirroring
 * the token — see Viewport for the ack contract) rather than booleans, so
 * two clicks in a row without an intervening render still both fire.
 */
export type SimSlice = {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly running: boolean;
  readonly stepCount: number;
  readonly seed: number;
  readonly resetToken: number;
  readonly clearTraceToken: number;
};
