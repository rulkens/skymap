import type { BodyTextureId } from '../data/BodyTextureId';
import type { RingTextureId } from '../data/RingTextureId';
import type { TextureKind } from '../data/TextureKind';
import type { Tier } from '../data/Tier';

/**
 * Request shape for `bodyTextureFetcher`: which textured body (or the ring
 * strip), which map role, and at which tier. `tier` selects the pixel-edge
 * resolution variant (`tierToTexturePx`) that names the on-disk file — the tier
 * here has already been clamped to the body's per-kind ceiling by the wiring row,
 * so a body that only ships a `small` texture is never asked for a `large` one.
 *
 * `bodyId` spans `BodyTextureId | RingTextureId`: the ring strip rides the same
 * fetcher and slot family, and its `'saturn-ring'` key is what selects the
 * PNG-for-alpha filename branch inside `bodyTextureFilename` — so the request
 * type (not just the slot Map's key union) must admit it, or the fetcher could
 * never be called with the ring id through its typed surface.
 *
 * `kind` names the map role. The `surface` (day/albedo) kind keeps the
 * unsegmented filename every body ships today; non-surface kinds
 * (`night`/`clouds`/`material`/`normal`) add a `-${kind}-` segment — the
 * convention lives in `bodyTextureFilename`, which the fetcher calls.
 */
export type BodyTextureReq = {
  readonly bodyId: BodyTextureId | RingTextureId;
  readonly kind: TextureKind;
  readonly tier: Tier;
};
