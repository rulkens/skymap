/** The fields of a Chrome trace event the frame summary reads (µs timestamps). */
export type TraceEvent = {
  readonly name: string;
  readonly ph: string;
  readonly pid: number;
  readonly tid: number;
  readonly ts: number;
  readonly dur?: number;
};
