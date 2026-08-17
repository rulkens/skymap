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
 * A single fetcher feeds the whole family, but each `(bodyId, kind)` entry
 * commits into a different resident renderer, chosen by the structured entry
 * (`entry.bodyId` + `entry.kind`, read directly — never parsed from the composite
 * string) rather than an `if (id === …)` ladder:
 *
 *  - `'earth'` re-skins its dedicated placeholder sphere through
 *    `earthRenderer.setMap(kind, …)` (Earth keeps its own renderer — the planned
 *    atmosphere/day-night divergence). The `clouds` kind additionally fans to a
 *    SECOND resident consumer — `cloudShellRenderer.setTexture` — so one committed
 *    cloud bitmap reaches both the surface pipeline (shadow + night occlusion) and
 *    the translucent shell, the same one-asset/two-consumers shape the ring commit
 *    uses.
 *  - every other `BodyTextureId` (the fourteen non-Earth textured bodies) routes to
 *    the shared `texturedBodyRenderer.setMap(bodyId, kind, …)`; its `onRelease`
 *    frees that (body, kind)'s GPU texture via `clearMap(bodyId, kind)` — the slot
 *    family's eviction premise, so a slot leaving its proximity radius actually
 *    releases its (up to ~135 MB) texture rather than leaking it. The clear is
 *    per-KIND to match the per-(body,kind) slot granularity: `surface` and
 *    `normal` have independent clamped tiers, so evicting one kind's slot must not
 *    collaterally destroy the sibling kind's still-demanded texture.
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
import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { BodyTextureKey } from '../../../@types/data/BodyTextureKey';

/**
 * True iff `bodyId` names a textured SPHERE body other than Earth — the set the
 * shared `texturedBodyRenderer` owns. Earth (its own renderer) and the ring ids
 * (no `BODY_TEXTURE_REGISTRY` row) are excluded, so a `true` here narrows
 * `bodyId` to a `BodyTextureId` the textured renderer accepts.
 */
function isTexturedBodyKey(bodyId: BodyTextureId | RingTextureId): bodyId is BodyTextureId {
  return bodyId !== 'earth' && bodyTextureSpec(bodyId) !== null;
}

/**
 * Route a committed bitmap to the resident renderer for `entry`, dispatching on
 * the structured `(bodyId, kind)` pair. Earth → `earthRenderer.setMap(kind, …)`;
 * the fourteen other bodies → the shared `texturedBodyRenderer`'s `setMap`, routed
 * by `entry.kind`; a ring id → that renderer's `setRingTexture`, keyed on the
 * ring's HOST body (`hostBodyId` resolves `'saturn-ring'` → `'saturn'`), so the
 * ring strip lands on binding 3 of the sphere it rides.
 */
function commitBodyTexture(state: EngineState, entry: BodyTextureKey, bitmap: ImageBitmap): void {
  // Destroy race: each handle may be null mid-bootstrap or post-teardown — a
  // null-guarded drop keeps the slot's `ready` transition intact.
  if (entry.bodyId === 'earth') {
    // Earth owns every kind through one renderer's `setMap` — for `clouds` this
    // binds the surface-pipeline copy sampled for the ring shadow + night
    // occlusion (spec §7.3).
    state.gpu.earthRenderer?.setMap(entry.kind, bitmap);
    // Clouds fan to a SECOND resident consumer — the body-agnostic cloud shell —
    // the same one-asset/two-consumers shape the ring commit below uses. Surface
    // (setMap above) samples it for shadow + night-occlusion; the shell renders it
    // as the translucent layer.
    if (entry.kind === 'clouds') state.gpu.cloudShellRenderer?.setTexture(bitmap);
  } else if (isTexturedBodyKey(entry.bodyId)) {
    state.gpu.texturedBodyRenderer?.setMap(entry.bodyId, entry.kind, bitmap);
  } else {
    // A ring id (no BODY_TEXTURE_REGISTRY row) feeds every resident half of the
    // ring system from one commit: the ring-on-planet SHADOW (binding 3 of the
    // host body's sphere, via setRingTexture — hostBodyId keeps the ring→host
    // link in one authored home, SCENE_RINGS), the translucent ring OVERLAY
    // itself (the ringRenderer's radial strip), and the atmosphere shell's
    // ring-in-front occlusion (binding 4 — so the shell's over-blend does not
    // darken a ring between the camera and the atmosphere). One asset, three
    // resident consumers.
    state.gpu.texturedBodyRenderer?.setRingTexture(hostBodyId(entry.bodyId), bitmap);
    state.gpu.ringRenderer?.setTexture(bitmap);
    state.gpu.atmosphereShellRenderer?.setRingTexture(hostBodyId(entry.bodyId), bitmap);
  }
}

/**
 * The inverse of commit: free the resident texture on eviction. Only the shared
 * textured bodies have a clear surface — Earth's renderer has none (its texture
 * lifecycle is a follow-up) and the ring ids share the host body's resources — so
 * a body id frees via `clearMap(bodyId, kind)` and every other entry is a no-op.
 * The clear passes `entry.kind`: the slots are per-(body,kind), so eviction is
 * per-kind too. A proximity loss frees BOTH kinds because BOTH slots release, each
 * clearing its own kind — same end state, but no sibling collateral when a tier
 * switch evicts one kind's slot alone (`surface` and `normal` clamp independently).
 */
function releaseBodyTexture(state: EngineState, entry: BodyTextureKey): void {
  if (isTexturedBodyKey(entry.bodyId)) {
    state.gpu.texturedBodyRenderer?.clearMap(entry.bodyId, entry.kind);
  }
}

/**
 * Mint one asset slot per `(bodyId, kind)` family entry into
 * `state.assetSlots.bodyTextures`, keyed by its composite `bodyTextureSlotKey`.
 * Must run AFTER the body renderers exist (the commit uploads into them); safe to
 * call once per engine bootstrap.
 */
export function wireBodyTextureSlots(state: EngineState): void {
  for (const entry of ALL_BODY_TEXTURE_KEYS) {
    const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
    const slot = createAssetSlot<ImageBitmap, BodyTextureReq>({
      name: `${key}-texture`,
      fetch: bodyTextureFetcher,
      commit: async (bitmap) => commitBodyTexture(state, entry, bitmap),
      // The committed value (the bitmap) is ignored — the entry alone selects the
      // renderer + body to clear, so the whole family shares one release path.
      onRelease: () => releaseBodyTexture(state, entry),
    });
    state.assetSlots.bodyTextures.set(key, slot);
  }
}
