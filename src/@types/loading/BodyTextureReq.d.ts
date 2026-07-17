import type { BodyTextureId } from '../data/BodyTextureId';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `bodyTextureFetcher`: which textured body (or the ring
 * strip), and at which tier. `tier` selects the pixel-edge resolution variant
 * (`tierToTexturePx`) that names the on-disk file — the tier here has already
 * been clamped to the body's `maxTier` ceiling by the wiring row, so a body that
 * only ships a `small` texture is never asked for a `large` one.
 *
 * `bodyId` also carries `'saturn-ring'` (a `RingTextureId`) in practice — the
 * ring rides the same fetcher and slot family — but the request type names
 * `BodyTextureId` because the ring key widens the family Map's key union at the
 * slot layer, not this per-body request.
 */
export type BodyTextureReq = { readonly bodyId: BodyTextureId; readonly tier: Tier };
