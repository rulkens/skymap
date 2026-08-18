import type { AgentInitMode } from './AgentInitMode';
import type { McpmParams } from './McpmParams';

/**
 * SimSlice — the live MCPM knobs plus run lifecycle. `params` is read by the
 * harness every frame with no rebuild; `resetToken`/`clearTraceToken` are
 * one-shot commands (Viewport diffs them against the last value it
 * processed and calls `harness.reset`/`clearTrace`, then acks by mirroring
 * the token — see Viewport for the ack contract) rather than booleans, so
 * two clicks in a row without an intervening render still both fire.
 * `exportToken` is the same one-shot shape for the T16 `.npy`+sidecar
 * download pair — only the harness's own closure (Viewport) can reach
 * `readbackTrace`, so ControlsPanel's download button can only request.
 * `scfdToken` is T17's fourth sibling of the same pattern: the in-browser
 * `.scfd` download, through the same `packLogTraceVoxels`/`encodeScalarField`
 * the offline importer uses.
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
  readonly exportToken: number;
  readonly scfdToken: number;
};
