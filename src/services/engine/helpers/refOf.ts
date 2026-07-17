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
import type { StarInfo } from '../../../@types/engine/StarInfo';

const REF_OF: {
  galaxyCatalog: (t: GalaxyInfo) => SelectionRef;
  structure: (t: StructureInfo) => SelectionRef;
  milkyWay: (t: MilkyWayInfo) => SelectionRef;
  body: (t: StarInfo) => SelectionRef;
} = {
  galaxyCatalog: (t) => ({
    type: 'galaxyCatalog',
    source: t.source as GalaxyCatalogSourceType,
    index: t.index,
  }),
  structure: (t) => ({ type: 'structure', id: t.id }),
  milkyWay: () => ({ type: 'milkyWay' }),
  // A displayed star (StarInfo) maps to its body ref — the seed id is the
  // durable identity the selection slice stores.
  body: (t) => ({ type: 'body', id: t.id }),
};

export function refOf(target: FocusableTarget): SelectionRef {
  return (REF_OF[target.type] as (t: FocusableTarget) => SelectionRef)(target);
}
