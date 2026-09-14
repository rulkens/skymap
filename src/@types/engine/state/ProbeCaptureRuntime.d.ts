/**
 * ProbeCaptureRuntime — cross-frame memory for the ONE probe row: which body
 * this frame's faces write, and when each body was last refreshed. Single
 * writer, like its sky sibling `SkyCaptureRuntime`.
 */

export type ProbeCaptureRuntime = {
  /** The body whose probe this frame's faces write; null when idle. */
  subject: string | null;
  /** Per body, `ctx.nowMs` of its last completed refresh. */
  refreshedAtMs: Map<string, number>;
};
