import type { GalaxyInfo } from './GalaxyInfo';
import type { StructureInfo } from './data/StructureInfo';

/**
 * FocusableTarget — TAGGED discriminated union of the two things the camera can
 * focus on: a single galaxy point (`type: 'galaxyCatalog'`) or an extended
 * structure anchor (`type: 'structure'` — cluster, supercluster, void, group).
 *
 * The union is tagged on `type: FocusableTargetType`, so dispatch is a table
 * lookup on the tag rather than a structural sniff.  (The structural
 * `isStructure` predicate in `services/engine/isStructure.ts` still works — it
 * sniffs `'category' in target` — but it is being retired later in this plan in
 * favour of switching on `type`.)
 *
 * Used by the public `camera.focusOn(target)` handle and by InfoCard's unified
 * `hovered` / `selected` props.  Deliberately distinct from `FocusTarget` in
 * `@types/camera/FocusTarget.d.ts`, which is the URL-parsed deep-link descriptor
 * (`{ kind: 'pgc' | 'objid' | 'famous', ...}`) — that one is a *request* to
 * find a target; this one is the *resolved* target itself.
 */
export type FocusableTarget = GalaxyInfo | StructureInfo;
