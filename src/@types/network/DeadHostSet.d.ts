/**
 * DeadHostSet — session-scoped memory of hosts that stopped answering, so one
 * outage costs a handful of requests instead of one full deadline per item.
 *
 * Deliberately has no recovery path: a retired host stays retired until the
 * page reloads. The cooldown/half-open state machine that would let it back
 * is real complexity to own against a rare event.
 */

export type DeadHostSet = {
  /** True once this URL's host has failed to answer `DEAD_HOST_STREAK` times running. */
  isDead(url: string): boolean;
  /**
   * Record an ATTEMPTED request's outcome — never a skipped one, which would
   * make a retired host look like it kept failing.
   *
   * `alive` means the host ANSWERED, 404 and non-image content-type included:
   * those say the data isn't there, not that the host is down. Only a dead
   * connection (timeout, DNS, CORS, abort) counts against it — counting a 404
   * would retire SDSS after three galaxies outside its footprint, which is the
   * ordinary case the DSS fallback exists to handle.
   */
  note(url: string, alive: boolean): void;
};
