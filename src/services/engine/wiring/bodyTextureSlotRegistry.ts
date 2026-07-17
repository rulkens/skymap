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
 * ### Commit + release dispatch by key
 *
 * A single fetcher feeds the whole family, but each key commits into a different
 * resident renderer, chosen by registry membership rather than an `if (id ===
 * …)` ladder:
 *
 *  - `'earth'` re-skins its dedicated placeholder sphere through
 *    `earthRenderer.setTexture` (Earth keeps its own renderer — the planned
 *    atmosphere/day-night divergence).
 *  - every other `BodyTextureId` (the twelve non-Earth textured bodies) routes to
 *    the shared `texturedBodyRenderer.setTexture(bodyId, …)`; its `onRelease`
 *    frees that body's GPU texture via `clearTexture(bodyId)` — the slot family's
 *    eviction premise, so a body leaving its proximity radius actually releases
 *    its (up to ~135 MB) surface texture rather than leaking it.
 *  - the ring keys (`RingTextureId`, currently `'saturn-ring'`) route to the
 *    shared `texturedBodyRenderer.setRingTexture`, keyed on the ring's HOST body
 *    (`hostBodyId` resolves `'saturn-ring'` → `'saturn'`), so the strip lands on
 *    binding 3 of the sphere it rides. Their `onRelease` is a no-op — the ring
 *    strip is a small, non-evicted asset that shares the body's per-body
 *    resources.
 *
 * Earth's `onRelease` is likewise a no-op — `earthRenderer` has no clear surface
 * (its texture lifecycle is a Plan-02 follow-up), so the descent texture is not
 * evicted. Membership in `BODY_TEXTURE_REGISTRY` (via `bodyTextureSpec`)
 * distinguishes a body key from a ring key without hardcoding the ring id, so a
 * second ring joins the family with no dispatch edit.
 *
 * ### Destroy-race posture (same as `wireGalaxyCatalogSourceSlot`)
 *
 * `commit` / `onRelease` re-read `state.gpu.*` and null-guard the handle: it can
 * be null mid-bootstrap (commit fires before the renderer is assigned) or after
 * teardown (StrictMode unmount / hot-reload). A null handle drops the upload /
 * clear silently — the slot still transitions to `ready` / `idle`.
 */

import { createAssetSlot } from '../../loading/AssetSlot';
import { bodyTextureFetcher } from '../../loading/fetchers/bodyTextureFetcher';
import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';
import { hostBodyId } from '../../../utils/scene/hostBodyId';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';

type BodyTextureKey = BodyTextureId | RingTextureId;

/**
 * True iff `key` names a textured SPHERE body other than Earth — the set the
 * shared `texturedBodyRenderer` owns. Earth (its own renderer) and the ring keys
 * (no `BODY_TEXTURE_REGISTRY` row) are excluded, so a `true` here narrows `key`
 * to a `BodyTextureId` the textured renderer accepts.
 */
function isTexturedBodyKey(key: BodyTextureKey): key is BodyTextureId {
  return key !== 'earth' && bodyTextureSpec(key) !== null;
}

/**
 * Route a committed bitmap to the resident renderer for `key`. Earth →
 * `earthRenderer`; the twelve other bodies → the shared `texturedBodyRenderer`'s
 * `setTexture`; a ring key → that renderer's `setRingTexture`, keyed on the
 * ring's HOST body (`hostBodyId` resolves `'saturn-ring'` → `'saturn'`), so the
 * ring strip lands on binding 3 of the sphere it rides.
 */
function commitBodyTexture(state: EngineState, key: BodyTextureKey, bitmap: ImageBitmap): void {
  // Destroy race: each handle may be null mid-bootstrap or post-teardown — a
  // null-guarded drop keeps the slot's `ready` transition intact.
  if (key === 'earth') {
    state.gpu.earthRenderer?.setTexture(bitmap);
  } else if (isTexturedBodyKey(key)) {
    state.gpu.texturedBodyRenderer?.setTexture(key, bitmap);
  } else {
    // A ring key (no BODY_TEXTURE_REGISTRY row) feeds BOTH halves of the ring
    // system from one commit: the ring-on-planet SHADOW (binding 3 of the host
    // body's sphere, via setRingTexture — hostBodyId keeps the ring→host link in
    // one authored home, SCENE_RINGS) and the translucent ring OVERLAY itself
    // (the ringRenderer's radial strip). One asset, two resident consumers.
    state.gpu.texturedBodyRenderer?.setRingTexture(hostBodyId(key), bitmap);
    state.gpu.ringRenderer?.setTexture(bitmap);
  }
}

/**
 * The inverse of commit: free the resident texture on eviction. Only the shared
 * textured bodies have a clear surface — Earth's renderer has none (its texture
 * lifecycle is a Plan-02 follow-up) and the ring keys route in Task 8 — so a
 * body key frees via `clearTexture` and every other key is a no-op.
 */
function releaseBodyTexture(state: EngineState, key: BodyTextureKey): void {
  if (isTexturedBodyKey(key)) {
    state.gpu.texturedBodyRenderer?.clearTexture(key);
  }
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
      // The committed value (the bitmap) is ignored — the key alone selects the
      // renderer + body to clear, so the whole family shares one release path.
      onRelease: () => releaseBodyTexture(state, key),
    });
    state.assetSlots.bodyTextures.set(key, slot);
  }
}
