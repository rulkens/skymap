/**
 * Optional commit step run after fetch+decode succeeds.  For point-cloud
 * slots this uploads to the GPU; for sidecar slots it's omitted.
 *
 * Receives the same AbortSignal as the fetch so a long-running GPU upload
 * can be aborted by a superseding `load()` (the slot's second race-check
 * still applies even if commit happens to ignore the signal — the check is
 * the structural fix, the signal is the cooperative one).
 *
 * It also receives the originating `req`, so a commit can vary by what was
 * asked for — e.g. the galaxy-catalog commit dissolves the old buffer first
 * only when `setTier` flagged the request a tier swap (`dissolvePrevious`),
 * rather than guessing the swap from data-store membership.  Committers that
 * don't need it simply omit the parameter (fewer args stays assignable);
 * `Req` defaults to `unknown` so `Committer<T>` still type-checks.
 */
export type Committer<T, Req = unknown> = (
  value: T,
  signal: AbortSignal,
  req: Req,
) => Promise<void>;
