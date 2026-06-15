import type { GalaxyInfo } from './GalaxyInfo';
import type { StructureInfo } from '../data/structure/StructureInfo';
import type { MilkyWayInfo } from './MilkyWayInfo';

/**
 * FocusableTarget — TAGGED discriminated union of the three things the camera
 * can focus on: a single galaxy point (`type: 'galaxyCatalog'`), an extended
 * structure anchor (`type: 'structure'` — cluster, supercluster, void, group),
 * or the Milky Way singleton (`type: 'milkyWay'`).
 *
 * The union is tagged on `type: FocusableTargetType`, so dispatch is a `type`
 * narrow or a table lookup on the tag (`DETAIL_CARD[t.type]`,
 * `URL_HASH_FOR[t.type]`, `COMMIT_FOCUS[t.type]`) rather than a structural
 * sniff — a new arm is one table row per dispatch, not a new branch everywhere.
 *
 * Used by the public `camera.focusOn(target)` handle and by InfoCard's unified
 * `hovered` / `selected` props.  Deliberately distinct from `FocusTarget` in
 * `@types/camera/FocusTarget.d.ts`, which is the URL-parsed deep-link descriptor
 * (`{ kind: 'pgc' | 'objid' | 'famous', ...}`) — that one is a *request* to
 * find a target; this one is the *resolved* target itself.
 */
export type FocusableTarget = GalaxyInfo | StructureInfo | MilkyWayInfo;
