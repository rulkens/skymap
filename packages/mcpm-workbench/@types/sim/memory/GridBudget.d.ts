/**
 * GridBudget — `planGridBudget`'s verdict on a grid + agent configuration,
 * produced BEFORE any allocation. `perBufferBytes.agents` is one SoA lane, the
 * unit WebGPU's per-buffer limits apply to.
 */
export type GridBudget = {
  readonly perBufferBytes: Readonly<Record<'depositA' | 'depositB' | 'trace' | 'agents', number>>;
  /** null when the configuration fits; otherwise names the offending buffer. */
  readonly refusal: {
    readonly buffer: string;
    readonly requestedBytes: number;
    readonly limitBytes: number;
    readonly maxLongAxis: number;
  } | null;
};
