import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';
import type { BlackHoleId } from '../data/blackHole/BlackHoleId';
import type { SceneBodyId } from '../scene/SceneBodyId';

/**
 * SelectionRef — the identity of a selectable thing; the URL hash, tween, dedup and tier
 * re-anchor all key off it. Galaxy refs are POSITIONAL (`index` drifts on a tier swap; the tier
 * saga re-anchors by durable id). Body, craft and earthScene carry the seed `id` keying the static
 * `SCENE_BODIES` table. Flat primitives only: it lives in the RTK `selection` slice with the
 * serializability check on.
 */
export type SelectionRef =
  | {
      readonly type: 'galaxyCatalog';
      readonly source: GalaxyCatalogSourceType;
      readonly index: number;
    }
  | { readonly type: 'structure'; readonly id: string }
  | { readonly type: 'milkyWay' }
  | { readonly type: 'zoneOfAvoidance' }
  | { readonly type: 'body'; readonly id: SceneBodyId }
  | { readonly type: 'craft'; readonly id: SceneBodyId }
  | { readonly type: 'earthScene'; readonly id: SceneBodyId }
  // `index` is the tier-scoped record index for the Gaia survey (a stale one after a tier swap
  // warns and nulls) and the seed-table index for a seeded catalog.
  | {
      readonly type: 'starCatalog';
      readonly source: StarCatalogSourceType;
      readonly index: number;
    }
  | { readonly type: 'blackHole'; readonly id: BlackHoleId };
