import type { GalaxyCatalogSourceType } from '../data/galaxyCatalog/GalaxyCatalogSourceType';

/**
 * SelectionRef — the identity Intent for a selectable thing. The single
 * authoritative reference the URL hash, tween, dedup, and tier re-anchor all
 * key off. Galaxy refs are POSITIONAL (`index`, drifts on a tier swap — the
 * tier saga re-anchors them by durable id); structure refs carry the durable
 * instance `id`; the Milky Way and the zone of avoidance are both singletons
 * needing no per-instance data; a scene body (Earth, and later stars/planets)
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
  // Star refs are POSITIONAL like the galaxy ref: `index` is the bin-stable
  // global star-record index the pick texture names. It is tier-scoped, so a
  // stale index after a tier swap warns+nulls rather than mis-resolving —
  // unlike the durable `id` a structure or body carries.
  | { readonly type: 'star'; readonly index: number };
