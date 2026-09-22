import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';
import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';

/**
 * SelectionRef — the identity Intent for a selectable thing. The single
 * authoritative reference the URL hash, tween, dedup, and tier re-anchor all
 * key off. Galaxy refs are POSITIONAL (`index`, drifts on a tier swap — the
 * tier saga re-anchors them by durable id); structure refs carry the durable
 * instance `id`; the Milky Way and the zone of avoidance are both singletons
 * needing no per-instance data; a scene body (Earth, a planet, a mesh body)
 * carries the durable seed `id`
 * that keys the static `SCENE_BODIES` table — the body's data is re-looked-up
 * from that table when the ref is resolved, mirroring the structure arm.
 *
 * Flat serializable primitives only — this is stored in the RTK `selection`
 * slice with the serializability check on, so no bigint and no class instances.
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
  | { readonly type: 'body'; readonly id: string }
  // One arm for all four star catalogs, the pair the pick texture already packs:
  // `index` is the bin-stable global record index for the Gaia survey (tier-
  // scoped, so a stale index after a tier swap warns+nulls rather than
  // mis-resolving) and the seed-table index for a seeded catalog, where the
  // durable id lives on the row and in the URL rather than in the ref.
  | {
      readonly type: 'starCatalog';
      readonly source: StarCatalogSourceType;
      readonly index: number;
    };
