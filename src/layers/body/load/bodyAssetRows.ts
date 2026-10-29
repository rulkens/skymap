/**
 * The body Layer's asset rows — demand, release, request and priority only; each
 * `slot` is one `create` minted. The atlas row is rank 0 and never proximity-gated:
 * it is the fallback the per-body rows upgrade, so gating it would reopen the
 * "body reached before its texture" gap.
 */

import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { hostBodyId } from '../present/hostBodyId';
import { bodyTextureSlotKey } from './bodyTextureSlotKey';
import { isSceneBodyId } from '../../../utils/scene/isSceneBodyId';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { loadRadiusMpc } from './bodyTextureLoadRadius';
import { pastTextureReleaseRadius } from './pastTextureReleaseRadius';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../../@types/data/RingTextureId';
import type { BodyTextureKey } from '../../../@types/data/BodyTextureKey';
import type { TextureKind } from '../../../@types/data/TextureKind';
import type { Tier } from '../../../@types/data/Tier';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyRuntime } from '../@types/BodyRuntime';

/** Host position at the LIVE sim instant: hosts move, so read the memoized `deriveBodyStates(simDays)`, never a baked epoch. */
function bodyPosOf(id: BodyTextureId | RingTextureId, simDays: number): Readonly<Vec3> {
  const hostId = hostBodyId(id);
  // A texture key is not a scene id; the hosts all are, so a miss is the throw below.
  const state = isSceneBodyId(hostId) ? deriveBodyStates(simDays).get(hostId) : undefined;
  if (state === undefined) {
    throw new Error(`bodyPosOf: texture host '${hostId}' has no derived body state`);
  }
  return state.positionMpc;
}

/** Per-`kind` tier ceiling (a ring's is its host's); total because the keys are enumerated from present `kinds`, hence the `!`. */
function ceilingOf(id: BodyTextureId | RingTextureId, kind: TextureKind): Tier {
  return BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]!;
}

/** Demanded inside the load radius X, released past 2X; `release` is deliberately not `!demand` (see `pastTextureReleaseRadius`). */
function bodyTextureRow(runtime: BodyRuntime, entry: BodyTextureKey): AssetWiringRow {
  const key = bodyTextureSlotKey(entry.bodyId, entry.kind);
  return {
    key,
    slot: runtime.textureSlots.get(key)!,
    req: (tier) => ({
      bodyId: entry.bodyId,
      kind: entry.kind,
      tier: clampTier(tier, ceilingOf(entry.bodyId, entry.kind)),
    }),
    demand: (ctx) =>
      distanceMpc(ctx.cameraPosMpc, bodyPosOf(entry.bodyId, ctx.simDays)) <
      loadRadiusMpc(entry.bodyId),
    release: (ctx) =>
      pastTextureReleaseRadius(
        entry.bodyId,
        ctx.cameraPosMpc,
        bodyPosOf(entry.bodyId, ctx.simDays),
      ),
    priority: 10, // one rank for the family; they are rarely co-demanded with each other
  };
}

export function bodyAssetRows(runtime: BodyRuntime): readonly AssetWiringRow[] {
  return [
    {
      key: 'bodyTextureAtlas',
      slot: runtime.atlasSlot,
      req: () => undefined,
      demand: () => true,
      priority: 0,
    },
    ...ALL_BODY_TEXTURE_KEYS.map((entry) => bodyTextureRow(runtime, entry)),
  ];
}
