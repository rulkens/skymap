import type { BodyTextureId } from '../data/BodyTextureId';
import type { RingTextureId } from '../data/RingTextureId';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `bodyTextureFetcher`: which textured body (or the ring
 * strip), and at which tier. `tier` selects the pixel-edge resolution variant
 * (`tierToTexturePx`) that names the on-disk file — the tier here has already
 * been clamped to the body's `maxTier` ceiling by the wiring row, so a body that
 * only ships a `small` texture is never asked for a `large` one.
 *
 * `bodyId` spans `BodyTextureId | RingTextureId`: the ring strip rides the same
 * fetcher and slot family, and its `'saturn-ring'` key is what selects the
 * PNG-for-alpha filename branch inside the fetcher — so the request type (not
 * just the slot Map's key union) must admit it, or the fetcher could never be
 * called with the ring id through its typed surface. This matches Task 10's
 * family Map key space (`BodyTextureId | RingTextureId`).
 */
export type BodyTextureReq = {
  readonly bodyId: BodyTextureId | RingTextureId;
  readonly tier: Tier;
};
