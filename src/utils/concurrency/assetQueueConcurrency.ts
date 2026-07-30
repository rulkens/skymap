/**
 * Concurrency limit for the engine's boot `assetQueue` — the queue that
 * serialises the handful of big one-shot boot fetches (catalog `.bin`
 * files, body textures) so they load in priority order instead of all at
 * once.
 *
 * This is a DIFFERENT number from `MAX_CONCURRENT_FETCHES` on purpose: that
 * constant bounds the thumbnail queue, which streams many small fetches as
 * the camera moves and can afford more parallelism. The boot queue moves a
 * handful of large payloads exactly once at startup, so the right N is
 * driven by a different trade-off:
 *
 *   - Under HTTP/2 (the deploy target — see docs/DEPLOY.md), all requests
 *     to the same origin share ONE multiplexed connection, so a HIGHER N
 *     doesn't buy more parallel bandwidth the way it does under HTTP/1.1 —
 *     it just splits that one pipe more ways, delaying whichever response
 *     matters most for time-to-first-visible.
 *   - N = 1 is worse than N = 2: while the main thread parses one `.bin`
 *     after a fetch resolves, the network sits idle instead of prefetching
 *     the next asset.
 *   - N = 4 (matching `MAX_CONCURRENT_FETCHES`) reintroduces exactly the
 *     pipe-splitting this feature exists to remove.
 *
 * N = 2 keeps one fetch in flight while another's response is being parsed,
 * without fragmenting the shared HTTP/2 connection across four downloads
 * at once.
 *
 * The two queues are deliberately NOT coordinated (no shared limiter, no
 * cross-queue backpressure): at the Earth boot view the galaxy point
 * clouds are faded out, so nothing requests thumbnails yet — the
 * thumbnail queue is idle exactly when boot contention matters, so
 * coordinating them would add plumbing for a race that structurally
 * doesn't happen.
 */
export const ASSET_QUEUE_CONCURRENCY = 2;
