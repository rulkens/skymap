/**
 * bodyTextureSlotRegistry — mints the keyed `bodyTextures` slot family and owns
 * its per-key commit dispatch.
 *
 * ### Mirrors `wireGalaxyCatalogSourceSlot`
 *
 * Like the per-source point slots, the body-texture slots are minted in
 * `initGpu` (not by the `ASSET_WIRING` construction pass — their rows carry
 * `built: 'external'`), right next to the body renderers their commit uploads
 * into. One `createAssetSlot<ImageBitmap, BodyTextureReq>` per family key is
 * written into `state.assetSlots.bodyTextures`. The demand loop then triggers
 * and evicts the already-minted slots via those external rows.
 *
 * ### Commit dispatch by key
 *
 * A single fetcher feeds the whole family, but each key commits into a different
 * resident renderer. In THIS plan the only wired-up target is Earth: key
 * `'earth'` re-skins the placeholder sphere through `earthRenderer.setTexture`.
 * Every other key's commit is a documented no-op — `texturedBodyRenderer` /
 * `ringRenderer` (the resident targets for the planets, moons, and ring) arrive
 * in Plan 02, which extends this one dispatch rather than adding a second. A
 * non-Earth texture demanded before then fetches and commits harmlessly to
 * nothing; the renderer that will consume it does not exist yet.
 *
 * ### Destroy-race posture (same as `wireGalaxyCatalogSourceSlot`)
 *
 * `commit` re-reads `state.gpu.earthRenderer` and null-guards it: the handle can
 * be null mid-bootstrap (commit fires before the renderer is assigned) or after
 * teardown (StrictMode unmount / hot-reload). A null handle drops the upload
 * silently — the slot still transitions to `ready`.
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { bodyTextureFetcher } from '../../loading/fetchers/bodyTextureFetcher';
import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';

type BodyTextureKey = BodyTextureId | RingTextureId;

/**
 * Route a committed bitmap to the resident renderer for `key`. Only `'earth'`
 * has one this plan; the rest are documented no-ops until Plan 02 (see header).
 */
function commitBodyTexture(state: EngineState, key: BodyTextureKey, bitmap: ImageBitmap): void {
  if (key === 'earth') {
    // Destroy race: the handle may be null mid-bootstrap or post-teardown — a
    // null-guarded drop keeps the slot's `ready` transition intact.
    state.gpu.earthRenderer?.setTexture(bitmap);
    return;
  }
  // No resident target yet — texturedBodyRenderer / ringRenderer land in Plan 02.
}

/**
 * Mint one asset slot per body-texture family key into
 * `state.assetSlots.bodyTextures`. Must run AFTER the body renderers exist (the
 * commit uploads into them); safe to call once per engine bootstrap.
 */
export function wireBodyTextureSlots(state: EngineState): void {
  for (const key of ALL_BODY_TEXTURE_KEYS) {
    const slot = createAssetSlot<ImageBitmap, BodyTextureReq>({
      name: `${key}-texture`,
      fetch: bodyTextureFetcher,
      commit: async (bitmap) => commitBodyTexture(state, key, bitmap),
      // The inverse of commit: free the resident texture on eviction. No renderer
      // exposes a texture-clear surface this plan (earthRenderer has none, and the
      // other keys' renderers arrive in Plan 02 with the placeholder swap-back),
      // so it is a documented no-op — kept as the symmetric hook Plan 02's
      // texture lifecycle extends, not omitted, so the extension point is obvious.
      onRelease: () => {},
    });
    state.assetSlots.bodyTextures.set(key, slot);
  }
}
