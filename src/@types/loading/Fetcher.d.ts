/**
 * One asset's fetcher: pure async function from a typed request to the
 * decoded payload.  Receives an AbortSignal (so the slot can supersede
 * in-flight fetches) and a progress callback (so the slot can mirror byte
 * counts into LoadState).
 *
 * Generic over both T (payload) and Req (request) so the typechecker
 * catches mistakes like calling a sidecar slot with a tier-bearing request.
 */
export type Fetcher<T, Req> = (
  req: Req,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) => Promise<T>;
