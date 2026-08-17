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
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';
import { SCENE_S_STARS } from '../../../data/bodies/sceneSStars';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

/**
 * Each body row's DURABLE seed table — the array a pick tagged with that row's
 * source code indexes into. Total over `BodyId`, so a new body row cannot be
 * added to the registry without naming the seeds its picks decode against; a
 * missing entry would otherwise resolve every click on that body to `null`,
 * silently.
 *
 * The Sun's row is total-by-obligation rather than reachable: its dot is drawn
 * by the STAR layers over the shared famous-star seed table, so a click on the
 * Sun arrives tagged `Source.FamousStar` and decodes through the `starCatalog`
 * arm below. `SCENE_STARS` is nonetheless the honest answer to this table's
 * question — it is the array a `Source.Sun` pick index would address — so the
 * entry is correct by construction should a layer ever stamp that code.
 */
const PICK_SEEDS_BY_BODY_ID: Readonly<Record<BodyId, readonly { readonly id: string }[]>> = {
  earth: [SCENE_EARTH],
  planet: SCENE_PLANETS,
  sun: SCENE_STARS,
  // Sgr A* draws nothing at any zoom, so its pick coverage is a caption-range
  // stamp `starPointsLayer` emits at the anchor — that is what reaches this arm.
  // Only index 0 names it; any other localIdx falls off the end.
  'sgr-a-star': [SGR_A_STAR],
  // The one body row whose arm is genuinely REACHABLE: the star layers stamp
  // `Source.SStar` for any star drawn out of `SCENE_S_STARS` (`starPickId`), so
  // a click on an S-star decodes here rather than through the `starCatalog` arm
  // — which indexes `SCENE_STARS` and would name the wrong star.
  's-star': SCENE_S_STARS,
};

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
  // The zone of avoidance is a singleton too — same tag-only resolution.
  zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' }),
  // The two star-catalog variants carry different notions of a star's identity,
  // so the arm splits on the same `binBaseName` discriminant the entry type
  // does. A SURVEY catalog is positional like the galaxy arm — the pick's
  // localIdx is the bin-stable global star-record index, and the reconciler
  // resolves it to a row at display time. A SEEDED catalog has no bin: its
  // localIdx indexes the durable body-store seed array, so it resolves to a
  // body ref, exactly as the planet/earth arms below do.
  starCatalog: (entry, pick) => {
    if (entry.type !== 'starCatalog') return null;
    if (entry.binBaseName !== null) return { type: 'star', index: pick.localIdx };
    const body = SCENE_STARS[pick.localIdx];
    return body ? { type: 'body', id: body.id } : null;
  },
  // The body arm is the decode side of the foreground `drawPick`s: the pack side
  // stamped `seedIndexOfBody(body, seeds) + PICK_SENTINEL_OFFSET`, and
  // `unpackPick` has already subtracted the offset, so `pick.localIdx` indexes
  // the SAME durable seed array. That seed index is order-stable (a property of
  // the authored table, not the camera-dependent draw subset), so it round-trips
  // to `seeds[localIdx].id` — the durable `{ type: 'body', id }` ref the body
  // half of the selection path already resolves against SCENE_BODIES. A localIdx
  // past the array (a seed/draw-set desync) yields null rather than a ghost hit,
  // which is also what makes the single-element Earth seed correct: only index 0
  // names it, and any other localIdx falls off the end.
  //
  // Every body row shares that decode, differing ONLY in which seed table it
  // indexes — so the row-to-table correspondence is DATA
  // (`PICK_SEEDS_BY_BODY_ID`) rather than a branch chain that would grow an arm
  // per body row.
  body: (entry, pick) => {
    const seeds = PICK_SEEDS_BY_BODY_ID[entry.id as BodyId];
    const body = seeds[pick.localIdx];
    return body ? { type: 'body', id: body.id } : null;
  },
};
