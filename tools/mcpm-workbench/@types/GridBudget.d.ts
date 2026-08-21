/**
 * GridBudget — `planGridBudget`'s verdict on a grid + agent configuration,
 * produced BEFORE any allocation. `perBufferBytes.agents` is one SoA lane (the
 * unit WebGPU's per-buffer limits apply to); `totalBytes` counts all seven
 * lanes (agentX/Y/Z/Phi/Theta/Weight plus T20's `densities`) and is HUD
 * material only — WebGPU imposes no total-memory limit to enforce.
 */
export type GridBudget = {
  readonly perBufferBytes: Readonly<Record<'depositA' | 'depositB' | 'trace' | 'agents', number>>;
  readonly totalBytes: number;
  /** null when the configuration fits; otherwise names the offending buffer. */
  readonly refusal: {
    readonly buffer: string;
    readonly requestedBytes: number;
    readonly limitBytes: number;
    readonly maxLongAxis: number;
  } | null;
};
