/**
 * bodyTextureSlots — the body Layer's `(bodyId, kind)` texture slots and their per-key
 * commit/release dispatch. `create` mints them once its renderers exist, so every sink
 * is the runtime's own non-null renderer; the asset rows hand these slots back to the
 * demand loop. Dispatch reads the structured `(entry.bodyId, entry.kind)` pair, never a
 * parse of the composite key.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { bodyTextureFetcher } from './bodyTextureFetcher';
import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { hostBodyId } from '../present/hostBodyId';
import { bodyTextureSlotKey } from '../../../utils/bodyTextures/bodyTextureSlotKey';
import { isTexturedBodyKey } from '../present/isTexturedBodyKey';
import { closeBitmap } from '../../../utils/gpu/closeBitmap';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { BodyTextureKey } from '../../../@types/data/BodyTextureKey';
import type { BodyTextureSlotKey } from '../../../@types/data/BodyTextureSlotKey';
import type { BodyTextureSinks } from '../@types/BodyTextureSinks';

/** Route a committed bitmap to every renderer that consumes `entry`. */
function commitBodyTexture(
  sinks: BodyTextureSinks,
  entry: BodyTextureKey,
  bitmap: ImageBitmap,
): void {
  if (entry.bodyId === 'earth') {
    sinks.earthRenderer.setMap(entry.kind, bitmap);
    // One cloud bitmap, two consumers: the surface pipeline samples it for the ring
    // shadow + night occlusion (spec §7.3), the shell draws it as the translucent
    // layer. Same shape as the ring commit below.
    if (entry.kind === 'clouds') sinks.cloudShellRenderer.setTexture(bitmap);
  } else if (isTexturedBodyKey(entry.bodyId)) {
    sinks.texturedBodyRenderer.setMap(entry.bodyId, entry.kind, bitmap);
  } else {
    // One ring strip, three consumers: the ring-on-planet SHADOW (binding 3 of the
    // host sphere — `hostBodyId` keeps the ring→host link in SCENE_RINGS alone), the
    // translucent OVERLAY, and the atmosphere shell's ring-in-front occlusion
    // (binding 4, so the shell's over-blend can't darken a ring in front of it).
    sinks.texturedBodyRenderer.setRingTexture(hostBodyId(entry.bodyId), bitmap);
    sinks.ringRenderer.setTexture(bitmap);
    sinks.atmosphereShellRenderer.setRingTexture(hostBodyId(entry.bodyId), bitmap);
  }
}

/**
 * Free the resident texture on eviction — the family's eviction premise: a slot
 * leaving its proximity radius releases up to ~135 MB rather than leaking it. The
 * clear is per-KIND to match the per-(body,kind) slot granularity: `surface` and
 * `normal` clamp to independent tiers, so evicting one kind must not destroy the
 * sibling kind's still-demanded texture. Ring strips stay resident: three small
 * copies, not worth a clear surface on each consumer.
 */
function releaseBodyTexture(sinks: BodyTextureSinks, entry: BodyTextureKey): void {
  if (entry.bodyId === 'earth') {
    sinks.earthRenderer.clearMap(entry.kind);
    if (entry.kind === 'clouds') sinks.cloudShellRenderer.clearTexture();
  } else if (isTexturedBodyKey(entry.bodyId)) {
    sinks.texturedBodyRenderer.clearMap(entry.bodyId, entry.kind);
  }
}

export function createBodyTextureSlots(
  sinks: BodyTextureSinks,
): ReadonlyMap<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>> {
  const slots = new Map<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>();
  for (const entry of ALL_BODY_TEXTURE_KEYS) {
    const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
    const slot = createAssetSlot<ImageBitmap, BodyTextureReq>({
      name: `${key}-texture`,
      fetch: bodyTextureFetcher,
      // Every sink copies into its own texture, so the decoded bitmap is dead weight
      // (up to 128 MiB at 8k) once they have; the slot keeps the closed handle as
      // its "resident" marker, which ringsPass/cloudShellPass test for presence only.
      commit: async (bitmap) => {
        commitBodyTexture(sinks, entry, bitmap);
        bitmap.close();
      },
      dispose: closeBitmap,
      onRelease: () => releaseBodyTexture(sinks, entry),
    });
    slots.set(key, slot);
  }
  return slots;
}
