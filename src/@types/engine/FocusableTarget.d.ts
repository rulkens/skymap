import type { GalaxyInfo } from './GalaxyInfo';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { MilkyWayInfo } from './MilkyWayInfo';
import type { ZoneOfAvoidanceInfo } from './ZoneOfAvoidanceInfo';
import type { BodyInfo } from './BodyInfo';
import type { FieldStarInfo } from './FieldStarInfo';

/**
 * FocusableTarget — TAGGED discriminated union of the things the camera can
 * focus on: a single galaxy point (`type: 'galaxyCatalog'`), an extended
 * structure anchor (`type: 'structure'` — cluster, supercluster, void, group),
 * the Milky Way singleton (`type: 'milkyWay'`), the zone-of-avoidance guide
 * band singleton (`type: 'zoneOfAvoidance'` — a line-of-sight extinction
 * effect with no `x`/`y`/`z`, so it carries no Focus target), a seeded scene
 * body (`type: 'body'` — the BodyInfo arm; every scene body reaches this union —
 * a famous star, Earth, or a planet — since buildFocusable builds a BodyInfo
 * for each), or a picked survey star (`type: 'star'` — the FieldStarInfo arm,
 * an anonymous Gaia/SKST catalogue star with no per-star identity).
 *
 * The union is tagged on `type: FocusableTargetType`, so dispatch is a `type`
 * narrow or a table lookup on the tag (`DETAIL_CARD[t.type]`,
 * `URL_HASH_FOR[t.type]`, `REF_OF[t.type]`) rather than a structural
 * sniff — a new arm is one table row per dispatch, not a new branch everywhere.
 *
 * Used by InfoCard's unified `hovered` / `selected` props and by `refOf` (the
 * boundary mapper to `SelectionRef` for store dispatches).
 */
export type FocusableTarget =
  | GalaxyInfo
  | StructureInfo
  | MilkyWayInfo
  | ZoneOfAvoidanceInfo
  | BodyInfo
  | FieldStarInfo;
