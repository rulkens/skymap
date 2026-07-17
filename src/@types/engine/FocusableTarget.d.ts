import type { GalaxyInfo } from './GalaxyInfo';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { MilkyWayInfo } from './MilkyWayInfo';
import type { StarInfo } from './StarInfo';

/**
 * FocusableTarget — TAGGED discriminated union of the things the camera can
 * focus on: a single galaxy point (`type: 'galaxyCatalog'`), an extended
 * structure anchor (`type: 'structure'` — cluster, supercluster, void, group),
 * the Milky Way singleton (`type: 'milkyWay'`), or a seeded scene body
 * (`type: 'body'` — the StarInfo arm; currently a body only becomes a
 * focusable when it is a famous STAR, so Earth/planets never reach this union —
 * see buildFocusable's star-only guard).
 *
 * The union is tagged on `type: FocusableTargetType`, so dispatch is a `type`
 * narrow or a table lookup on the tag (`DETAIL_CARD[t.type]`,
 * `URL_HASH_FOR[t.type]`, `REF_OF[t.type]`) rather than a structural
 * sniff — a new arm is one table row per dispatch, not a new branch everywhere.
 *
 * Used by InfoCard's unified `hovered` / `selected` props and by `refOf` (the
 * boundary mapper to `SelectionRef` for store dispatches).
 */
export type FocusableTarget = GalaxyInfo | StructureInfo | MilkyWayInfo | StarInfo;
