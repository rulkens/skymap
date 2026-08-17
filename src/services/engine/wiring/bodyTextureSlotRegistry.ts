/**
 * bodyTextureSlotRegistry — mints the keyed `bodyTextures` slot family and owns its
 * per-key commit/release dispatch. The slots are minted in `initGpu`, beside the
 * body renderers their commit uploads into, not by the `ASSET_WIRING` construction
 * pass — their rows carry `built: 'external'`, and the demand loop triggers and
 * evicts the already-minted slots through them. Dispatch reads the structured
 * `(entry.bodyId, entry.kind)` pair, never a parse of the composite key; every
 * `state.gpu.*` handle is re-read and null-guarded, since it can be null
 * mid-bootstrap or after a StrictMode teardown and the slot must still settle.
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
 * shared `texturedBodyRenderer` owns. Registry membership, not a hardcoded ring id,
 * is what excludes the rings, so a second ring joins with no dispatch edit.
 */
function isTexturedBodyKey(bodyId: BodyTextureId | RingTextureId): bodyId is BodyTextureId {
  return bodyId !== 'earth' && bodyTextureSpec(bodyId) !== null;
}

/** Route a committed bitmap to every resident renderer that consumes `entry`. */
function commitBodyTexture(state: EngineState, entry: BodyTextureKey, bitmap: ImageBitmap): void {
  if (entry.bodyId === 'earth') {
    state.gpu.earthRenderer?.setMap(entry.kind, bitmap);
    // One cloud bitmap, two consumers: the surface pipeline samples it for the ring
    // shadow + night occlusion (spec §7.3), the shell draws it as the translucent
    // layer. Same shape as the ring commit below.
    if (entry.kind === 'clouds') state.gpu.cloudShellRenderer?.setTexture(bitmap);
  } else if (isTexturedBodyKey(entry.bodyId)) {
    state.gpu.texturedBodyRenderer?.setMap(entry.bodyId, entry.kind, bitmap);
  } else {
    // One ring strip, three consumers: the ring-on-planet SHADOW (binding 3 of the
    // host sphere — `hostBodyId` keeps the ring→host link in SCENE_RINGS alone), the
    // translucent OVERLAY, and the atmosphere shell's ring-in-front occlusion
    // (binding 4, so the shell's over-blend can't darken a ring in front of it).
    state.gpu.texturedBodyRenderer?.setRingTexture(hostBodyId(entry.bodyId), bitmap);
    state.gpu.ringRenderer?.setTexture(bitmap);
    state.gpu.atmosphereShellRenderer?.setRingTexture(hostBodyId(entry.bodyId), bitmap);
  }
}

/**
 * Free the resident texture on eviction — the family's eviction premise: a slot
 * leaving its proximity radius releases up to ~135 MB rather than leaking it. Only
 * the shared textured bodies have a clear surface (Earth's renderer has none, rings
 * share the host's resources), and the clear is per-KIND to match the per-(body,kind)
 * slot granularity: `surface` and `normal` clamp to independent tiers, so evicting
 * one kind must not destroy the sibling kind's still-demanded texture.
 */
function releaseBodyTexture(state: EngineState, entry: BodyTextureKey): void {
  if (isTexturedBodyKey(entry.bodyId)) {
    state.gpu.texturedBodyRenderer?.clearMap(entry.bodyId, entry.kind);
  }
}

/**
 * Mint one asset slot per `(bodyId, kind)` family entry into
 * `state.assetSlots.bodyTextures`. Must run AFTER the body renderers exist.
 */
export function wireBodyTextureSlots(state: EngineState): void {
  for (const entry of ALL_BODY_TEXTURE_KEYS) {
    const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
    const slot = createAssetSlot<ImageBitmap, BodyTextureReq>({
      name: `${key}-texture`,
      fetch: bodyTextureFetcher,
      commit: async (bitmap) => commitBodyTexture(state, entry, bitmap),
      onRelease: () => releaseBodyTexture(state, entry),
    });
    state.assetSlots.bodyTextures.set(key, slot);
  }
}
