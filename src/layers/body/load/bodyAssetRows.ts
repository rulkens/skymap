/**
 * The body Layer's asset rows — demand, release, request and priority only; each
 * `slot` is one `create` already minted. The atlas row is rank 0 and
 * never proximity-gated: it is the universal fallback the per-body rows upgrade, so
 * gating it would reinstate the "body reached before its texture" gap it closes.
 */

import { ALL_BODY_TEXTURE_KEYS } from '../../../data/bodies/bodyTextureKeys';
import { BODY_TEXTURE_REGISTRY } from '../../../data/bodies/bodyTextureRegistry';
import { clampTier } from '../../../utils/math/clampTier';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { hostBodyId } from '../present/hostBodyId';
import { bodyTextureSlotKey } from '../../../utils/bodyTextures/bodyTextureSlotKey';
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

/**
 * The host body's world position at the frame's LIVE sim instant — every host
 * MOVES, so this must come from `deriveBodyStates(ctx.simDays)` (the memoized source
 * the render layers read), never a baked epoch. A paused clock re-reads the same
 * snapshot; a tick re-solves the ~22 Kepler orbits once for all proximity rows.
 */
function bodyPosOf(id: BodyTextureId | RingTextureId, simDays: number): Readonly<Vec3> {
  const hostId = hostBodyId(id);
  // A texture key is not a scene id; the hosts all are, so a miss is the throw below.
  const state = isSceneBodyId(hostId) ? deriveBodyStates(simDays).get(hostId) : undefined;
  if (state === undefined) {
    throw new Error(`bodyPosOf: texture host '${hostId}' has no derived body state`);
  }
  return state.positionMpc;
}

/**
 * The per-`kind` tier ceiling (a ring's is its host's). `ALL_BODY_TEXTURE_KEYS` is
 * enumerated from present `kinds` keys, so the lookup is total — hence the `!`.
 */
function ceilingOf(id: BodyTextureId | RingTextureId, kind: TextureKind): Tier {
  return BODY_TEXTURE_REGISTRY[hostBodyId(id)].kinds[kind]!;
}

/**
 * One demand+release row per body-texture key. DEMANDED inside the body's load
 * radius, RELEASED past twice it: `release` is deliberately not `!demand`, and the
 * band between `X` and `2X` where neither fires is the hysteresis that stops a
 * camera dithering at the boundary from thrashing a multi-MB load/free cycle. `req`
 * clamps the tier to the `(body, kind)` ceiling.
 */
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
