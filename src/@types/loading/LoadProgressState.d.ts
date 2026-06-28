/**
 * Aggregated download-progress snapshot dispatched via `engineLoadProgressChanged`.
 *
 * The aggregator owns one of these whenever any source's fetch is in
 * flight.  Once the last in-flight fetch settles (success, abort, or
 * error), the engine dispatches `engineLoadProgressChanged(null)` so the UI can hide
 * the bar.
 */
export type LoadProgressState = {
  /** Sum of bytes received across every in-flight source's stream. */
  loadedBytes: number;
  /**
   * Sum of `Content-Length` totals across every in-flight source.  May
   * be 0 if no source advertised a total — UI falls back to indeterminate.
   */
  totalBytes: number;
  /** Number of sources currently being fetched (1-3 in practice). */
  inFlightCount: number;
};
