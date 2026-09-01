import type { BodyTextureId } from '../../src/@types/data/BodyTextureId';
import type { Tier } from '../../src/@types/data/Tier';
import type { TextureKind } from '../../src/@types/data/TextureKind';
import { BODY_TEXTURE_REGISTRY } from '../../src/data/bodies/bodyTextureRegistry';
import { TIER_LADDER } from '../../src/data/tierLadder';

/**
 * emittedTiersForBody — the tiers `build-textures` may ever ship for a body's
 * `kind` map, capped at that kind's registry tier ceiling.
 *
 * This answers the *policy* question — "what resolutions does this body's `kind`
 * map justify?" — read straight off `BODY_TEXTURE_REGISTRY[id].kinds[kind]`
 * (surface: Uranus/Neptune → `small`, Venus → `medium`, everything else →
 * `large`). The tier ladder is a strict `small < medium < large` prefix, so the
 * emitted set is every tier up to and including the ceiling. A body that has no
 * map of the requested kind emits nothing.
 *
 * The ceiling exists because a near-featureless disc buys nothing from an 8 k
 * texture, and — the load-bearing rule — the pipeline must **never upscale**: a
 * body's raw source tops out at its native resolution (Uranus's only SSS map is
 * 2 k), so emitting a `large` tier for it would mean manufacturing detail that
 * does not exist (spec §3). The 4 k (`medium`) tier is always a build-time
 * *downsample* of an 8 k raw, never an upscale of a smaller one.
 *
 * This helper is deliberately pure registry → tier-set: it says what a body may
 * ship in principle. A given build run may emit *fewer* tiers if the source on
 * disk cannot produce them without upscaling (the `--dev` 2 k subset case) —
 * that source cap lives in `buildTextures.ts`, intersected against this set, so
 * the two concerns (policy ceiling vs. what a run can produce) stay separate.
 */

export function emittedTiersForBody(id: BodyTextureId, kind: TextureKind): readonly Tier[] {
  const ceiling = BODY_TEXTURE_REGISTRY[id].kinds[kind];
  if (ceiling === undefined) return [];
  return TIER_LADDER.slice(0, TIER_LADDER.indexOf(ceiling) + 1);
}
