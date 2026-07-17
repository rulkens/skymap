/**
 * RESOLVE_PICK — table dispatch turning a decoded pick into a SelectionRef
 * (identity), not a resolved FocusableTarget. The galaxy arm is positional
 * (source + localIdx); the structure arm resolves the pick index to the record
 * to recover its durable id; the Milky Way is the singleton tag. The display
 * row is materialized later by the reconciler — the pick only commits identity.
 */
import { resolveStructureFromPick } from './resolveStructureFromPick';
import { SCENE_STARS } from '../../../data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../data/bodies/sceneEarth';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export const RESOLVE_PICK: Partial<
  Record<
    SourceEntry['type'],
    (entry: SourceEntry, pick: PickResult, deps: ResolvePickDeps) => SelectionRef | null
  >
> = {
  // Galaxy identity is purely positional — no cloud read needed. The
  // reconciler resolves the cloud at display time, insulating the pick path
  // from tier-swap races (a stale index is re-anchored by the tier saga).
  galaxyCatalog: (_entry, pick) => ({
    type: 'galaxyCatalog',
    source: pick.sourceCode as GalaxyCatalogSourceType,
    index: pick.localIdx,
  }),
  // A structure entry's id *is* its category (StructureId derives from exactly
  // these ids), so the cast is sound by construction. The record's durable `id`
  // becomes the ref — stable across re-loads and tier swaps.
  structure: (entry, pick, deps) => {
    if (entry.type !== 'structure') return null;
    const record = resolveStructureFromPick(deps.structures, {
      category: entry.id as StructureId,
      structureIndex: pick.localIdx,
    });
    return record ? { type: 'structure', id: record.id } : null;
  },
  // The Milky Way is a singleton: the pick resolves to the tag with no
  // per-instance data needed.
  milkyWay: () => ({ type: 'milkyWay' }),
  // Star identity is positional like the galaxy arm — the pick's localIdx is
  // the bin-stable global star-record index. No catalog read here; the
  // reconciler resolves the record to a row at display time.
  starCatalog: (_entry, pick) => ({ type: 'star', index: pick.localIdx }),
  // Body arms are the decode side of the foreground `drawPick`s (Task 11): the
  // pack side stamped `seedIndexOfBody(body, seeds) + PICK_SENTINEL_OFFSET`, and
  // `unpackPick` has already subtracted the offset, so `pick.localIdx` indexes
  // the SAME durable seed array. That seed index is order-stable (a property of
  // the authored table, not the camera-dependent draw subset), so it round-trips
  // to `seeds[localIdx].id` — the durable `{ type: 'body', id }` ref the body
  // half of the selection path already resolves against SCENE_BODIES. A localIdx
  // past the array (a seed/draw-set desync) yields null rather than a ghost hit.
  famousStar: (_entry, pick) => {
    const body = SCENE_STARS[pick.localIdx];
    return body ? { type: 'body', id: body.id } : null;
  },
  planet: (_entry, pick) => {
    const body = SCENE_PLANETS[pick.localIdx];
    return body ? { type: 'body', id: body.id } : null;
  },
  // Earth is a singleton seed: only index 0 names it; any other localIdx is a
  // desync and drops out of picking.
  earth: (_entry, pick) => (pick.localIdx === 0 ? { type: 'body', id: SCENE_EARTH.id } : null),
};
