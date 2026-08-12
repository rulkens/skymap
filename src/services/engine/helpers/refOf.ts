/**
 * refOf — maps a resolved `FocusableTarget` to its identity `SelectionRef`.
 *
 * The two types carry mostly the same data but serve different roles:
 *
 *   - `FocusableTarget` is the rich display-model (GalaxyInfo, StructureInfo,
 *     MilkyWayInfo) returned by selectors and used by InfoCard, URL-sync, etc.
 *   - `SelectionRef` is the serializable identity ref stored in the Redux
 *     `selection` slice — flat primitives, no bigint, safe for the RTK
 *     serializability check.
 *
 * This mapper lives at the boundary: when App translates a user action on a
 * displayed target (e.g. the InfoCard Focus button) back into a dispatch, it
 * needs a `SelectionRef` to hand to `updateSelectionFocus`. Table-dispatched on
 * the `type` tag, so a new arm is one table row.
 *
 * `GalaxyInfo.source` is typed `SourceType` (the wider union), but a displayed
 * galaxy always came from a galaxy catalog source, so the cast to
 * `GalaxyCatalogSourceType` is correct at this boundary.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { MilkyWayInfo } from '../../../@types/engine/MilkyWayInfo';
import type { ZoneOfAvoidanceInfo } from '../../../@types/engine/ZoneOfAvoidanceInfo';
import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { FieldStarInfo } from '../../../@types/engine/FieldStarInfo';

const REF_OF: {
  galaxyCatalog: (t: GalaxyInfo) => SelectionRef;
  structure: (t: StructureInfo) => SelectionRef;
  milkyWay: (t: MilkyWayInfo) => SelectionRef;
  zoneOfAvoidance: (t: ZoneOfAvoidanceInfo) => SelectionRef;
  body: (t: BodyInfo) => SelectionRef;
  star: (t: FieldStarInfo) => SelectionRef;
} = {
  galaxyCatalog: (t) => ({
    type: 'galaxyCatalog',
    source: t.source as GalaxyCatalogSourceType,
    index: t.index,
  }),
  structure: (t) => ({ type: 'structure', id: t.id }),
  milkyWay: () => ({ type: 'milkyWay' }),
  zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' }),
  // A displayed body (BodyInfo) maps to its body ref — the seed id is the
  // durable identity the selection slice stores.
  body: (t) => ({ type: 'body', id: t.id }),
  // A survey-star ref is positional — the bin-stable record index the pick names.
  star: (t) => ({ type: 'star', index: t.index }),
};

export function refOf(target: FocusableTarget): SelectionRef {
  return (REF_OF[target.type] as (t: FocusableTarget) => SelectionRef)(target);
}
