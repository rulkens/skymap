/**
 * The body Layer's asset rows — demand, release, request and priority only; each
 * `slot` is one `create` minted. The atlas row is rank 0 and never proximity-gated:
 * it is the fallback the per-body rows upgrade, so gating it would reopen the
 * "body reached before its texture" gap.
 */

import { ALL_BODY_TEXTURE_KEYS } from '../data/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../data/bodyTextureRegistry';
import { clampTier } from '../../../../utils/math/clampTier';
import { hostBodyId } from '../present/hostBodyId';
import { asSceneBodyId } from '../../../../utils/scene/asSceneBodyId';
import { bodyTextureSlotKey } from './bodyTextureSlotKey';
import type { AssetWiringRow } from '../../../../@types/loading/AssetWiringRow';
import type { BodyAssetKey } from '../../@types/BodyAssetKey';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../../@types/data/RingTextureId';
import type { BodyTextureKey } from '../../../../@types/data/BodyTextureKey';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import type { Tier } from '../../../../@types/data/Tier';
import type { BodyRuntime } from '../../@types/BodyRuntime';

/** Per-`kind` tier ceiling (a ring's is its host's); total because the keys are enumerated from present `kinds`, hence the `!`. */
function ceilingOf(id: BodyTextureId | RingTextureId, kind: TextureKind): Tier {
  return BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]!;
}

/** Loads at 16 px across, releases below 8 px; the gap keeps a dithering camera from thrashing a multi-MB load/free cycle. */
function bodyTextureRow(
  runtime: BodyRuntime,
  entry: BodyTextureKey,
): AssetWiringRow<unknown, unknown, BodyAssetKey> {
  const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
  return {
    key,
    slot: runtime.textureSlots.get(key)!,
    req: (tier) => ({
      bodyId: entry.bodyId,
      kind: entry.kind,
      tier: clampTier(tier, ceilingOf(entry.bodyId, entry.kind)),
    }),
    demand: { size: { body: asSceneBodyId(hostBodyId(entry.bodyId)), loadPx: 16, releasePx: 8 } },
    priority: 10, // one rank for the family; they are rarely co-demanded with each other
  };
}

export function bodyAssetRows(
  runtime: BodyRuntime,
): readonly AssetWiringRow<unknown, unknown, BodyAssetKey>[] {
  return [
    {
      key: 'bodyTextureAtlas',
      slot: runtime.atlasSlot,
      req: () => undefined,
      demand: 'always',
      priority: 0,
    },
    ...ALL_BODY_TEXTURE_KEYS.map((entry) => bodyTextureRow(runtime, entry)),
  ];
}
