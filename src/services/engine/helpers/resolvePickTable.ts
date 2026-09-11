/**
 * RESOLVE_PICK — table dispatch turning a decoded pick into a SelectionRef
 * (identity), not a resolved FocusableTarget. The galaxy arm is positional
 * (source + localIdx); the structure arm resolves the pick index to the record
 * to recover its durable id; the Milky Way is the singleton tag. The display
 * row is materialized later by the reconciler — the pick only commits identity.
 */
import { resolveStructureFromPick } from './resolveStructureFromPick';
import { SCENE_STARS } from '../../../data/bodies/sceneStars';
import { BODY_PICK_ROWS } from '../../../data/bodies/bodyPickRows';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { BodyId } from '../../../@types/data/body/BodyId';
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
  // A localIdx past the seed array (a seed/draw-set desync) yields null rather
  // than a ghost hit — which is also what makes the single-element Earth seed
  // correct: only index 0 names it, any other localIdx falls off the end.
  body: (entry, pick) => {
    const seeds = BODY_PICK_ROWS[entry.id as BodyId];
    const body = seeds[pick.localIdx];
    return body ? { type: 'body', id: body.id } : null;
  },
};
