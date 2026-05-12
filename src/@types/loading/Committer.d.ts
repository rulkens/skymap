/**
 * Optional commit step run after fetch+decode succeeds.  For point-cloud
 * slots this uploads to the GPU; for sidecar slots it's omitted.
 *
 * Receives the same AbortSignal as the fetch so a long-running GPU upload
 * can be aborted by a superseding `load()` (the slot's second race-check
 * still applies even if commit happens to ignore the signal — the check is
 * the structural fix, the signal is the cooperative one).
 */
export type Committer<T> = (value: T, signal: AbortSignal) => Promise<void>;
