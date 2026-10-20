/**
 * rankPaletteMatches — the command palette's pure ranking pipeline: filters and
 * ranks the parallel indexes (famous atlas, scene bodies, Earth places, alias
 * index, structures) plus the Milky Way row against a non-empty query (the
 * featured grid owns browsing).
 *
 * Famous rows, bodies, seeded stars and Earth places share one score-sorted
 * list, so an exact body match like "earth" outranks a famous row that only
 * matched "earth" in its description. Alias and structure lists are capped and
 * appended after.
 */
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import { MILKY_WAY_NAMES } from '../../data/palette/milkyWayNames';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../data/bodies/seededStarCatalogsBySource';
import { BODY_SEARCH_NAMES } from '../../data/bodies/bodySearchNames';
import { isRegistryBodyId } from '../scene/isRegistryBodyId';
import { APP_EXHIBITS } from '../../compositions/appExhibits';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import { EARTH_PLACES } from '../../data/palette/earthPlaces';
import type { ScoredRow } from '../../@types/palette/ScoredRow';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';
import type { LayerSearchEntry } from '../../@types/engine/layer/LayerSearchEntry';

/** Generic substrings like `MCG` match thousands of rows; uncapped, the palette would render a stuttering 5,000-row `<ul>`. */
const MAX_ALIAS_RESULTS = 50;

/** Same DOM budget: a generic substring ('A' for Abell) still hits a few hundred of ~370 structures. */
const MAX_STRUCTURE_RESULTS = 50;

/** Primary-row boost: keeps an alias's longer-query bonus (queries <16 chars) from leapfrogging a primary match. */
const PRIMARY_TIEBREAK = 5;

export function rankPaletteMatches(
  entries: readonly FamousGalaxyMetaEntry[],
  aliasIndex: readonly AliasIndexEntry[] | undefined,
  structures: readonly StructureSearchEntry[] | undefined,
  layerRows: readonly LayerSearchEntry[],
  query: string,
): ScoredRow[] {
  if (query.trim().length === 0) return [];

  // The Milky Way row has no catalog membership; scored over MILKY_WAY_NAMES
  // like a famous row and only kept if it hits.
  const mwScore = scoreFamousMatch(
    { id: 'milky-way', names: MILKY_WAY_NAMES, description: '' },
    query,
  );
  const milkyWayRow: ScoredRow | null = mwScore > 0 ? { kind: 'milkyWay', score: mwScore } : null;

  const famousScored: ScoredRow[] = entries
    .map<ScoredRow>((entry) => {
      const raw = scoreFamousMatch(entry, query);
      return { kind: 'famous', entry, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
    })
    .filter((s) => s.score > 0);

  // Seeded scene bodies (Earth, the planets, the mesh bodies) are scored like a
  // famous row. The wheel-zoom floor (clampDistance.ts) is derived from the
  // focused body's own radius, so a picked body always resolves to a
  // reachable, non-sub-pixel focus target.
  //
  // A body scores over its full alias list (BODY_SEARCH_NAMES), so a Bayer
  // designation ("Alpha Canis Majoris") surfaces the same row as the common
  // name ("Sirius"). Earth/planets aren't in the map and fall back to their
  // single label.
  //
  // `SCENE_BODIES` still lists the seeded stars for the camera and occluder
  // readers, so the body rows are narrowed to the ids a body source actually
  // seeds; the stars get their own rows below, carrying star identity.
  const bodyScored: ScoredRow[] = SCENE_BODIES.filter((body) => isRegistryBodyId(body.id))
    .map<ScoredRow>((body) => {
      const names = BODY_SEARCH_NAMES.get(body.id) ?? [body.label];
      const raw = scoreFamousMatch({ id: body.id, names, description: '' }, query);
      return { kind: 'body', body, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
    })
    .filter((s) => s.score > 0);

  // The seeded stars, scored the same way off the same alias map — the row that
  // results carries the source + seed index its `starCatalog` ref needs.
  const starScored: ScoredRow[] = [...SEEDED_STAR_CATALOGS_BY_SOURCE]
    .flatMap<ScoredRow>(([source, row]) =>
      row.stars.map((star, index) => {
        const names = BODY_SEARCH_NAMES.get(star.id) ?? [star.label];
        const raw = scoreFamousMatch({ id: star.id, names, description: '' }, query);
        return {
          kind: 'starCatalog',
          source,
          index,
          star,
          score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0,
        };
      }),
    )
    .filter((s) => s.score > 0);

  // Exhibits and tours are scored on their registry label alone — only a
  // registry row gets a search row (spec §7.4), so a focus card never
  // duplicates the object it takes over to. `Tour.dev` tours are harnesses for
  // the tour machinery and stay out of search; they remain launchable from the
  // debug panel and by id.
  const exhibitScored: ScoredRow[] = Object.values(APP_EXHIBITS)
    .map<ScoredRow>((exhibit) => {
      const raw = scoreFamousMatch(
        { id: exhibit.id, names: [exhibit.label], description: '' },
        query,
      );
      return { kind: 'exhibit', exhibit, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
    })
    .filter((s) => s.score > 0);

  const tourScored: ScoredRow[] = Object.values(tourRegistry)
    .filter((tour) => tour.dev !== true)
    .map<ScoredRow>((tour) => {
      const raw = scoreFamousMatch({ id: tour.id, names: [tour.label], description: '' }, query);
      return { kind: 'tour', tour, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
    })
    .filter((s) => s.score > 0);

  // Earth places are scored the same way as a scene body: a fixed, small
  // table with no catalog membership, so no cap/append treatment like alias
  // or structure rows.
  const placeScored: ScoredRow[] = EARTH_PLACES.map<ScoredRow>((place) => {
    const raw = scoreFamousMatch({ id: place.id, names: place.names, description: '' }, query);
    return { kind: 'place', entry: place, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
  }).filter((s) => s.score > 0);

  // Layer-published rows, scored off their own `names` like any primary row.
  // `class` decides where they land: `primary` merges into the sorted primary
  // list below, `catalog` is capped beside the alias rows, so a Layer that one
  // day publishes a loaded catalog cannot drown the named objects.
  const layerScored: ScoredRow[] = layerRows
    .map<ScoredRow>((entry) => {
      const raw = scoreFamousMatch({ id: entry.id, names: entry.names, description: '' }, query);
      const boost = entry.class === 'primary' ? PRIMARY_TIEBREAK : 0;
      return { kind: 'layer', entry, score: raw > 0 ? raw + boost : 0 };
    })
    .filter((s) => s.score > 0);
  const layerPrimaryScored = layerScored.filter(
    (s) => s.kind === 'layer' && s.entry.class === 'primary',
  );
  const layerCatalogScored = layerScored.filter(
    (s) => s.kind === 'layer' && s.entry.class === 'catalog',
  );

  // Famous rows, scene bodies, Earth places, exhibits and tours are one class
  // of primary named object: merge and sort together so an exact match
  // ("earth") outranks a famous row that only matched "earth" in its
  // description. The sort is stable, so earlier arrays stay ahead on an exact
  // score tie (famous first).
  const primaryScored = [
    ...famousScored,
    ...bodyScored,
    ...starScored,
    ...placeScored,
    ...exhibitScored,
    ...tourScored,
    ...layerPrimaryScored,
  ].sort((a, b) => b.score - a.score);

  const aliasScored: ScoredRow[] = (aliasIndex ?? [])
    .map<ScoredRow>((entry) => ({
      kind: 'alias',
      entry,
      score: scoreAliasMatch(entry, query),
    }))
    .filter((s) => s.score > 0);
  // One capped bucket, not two: a Layer's catalog rows and the alias index are
  // the same class of bulk row, so they compete for the same DOM budget. Stable:
  // equal-score aliases keep the alias index's order, which is alias-file order.
  const catalogScored = [...aliasScored, ...layerCatalogScored].sort((a, b) => b.score - a.score);
  const catalogCapped = catalogScored.slice(0, MAX_ALIAS_RESULTS);

  // Structures score through the same heuristic as famous rows: we fold the
  // Abell designation into the searchable `names` so 'A1656' and 'Coma' both
  // hit, and pass the durable id (which contains the seed slug) + description
  // for last-resort substring matches — no structure-specific scorer needed.
  const structureScored: ScoredRow[] = (structures ?? [])
    .map<ScoredRow>((entry) => ({
      kind: 'structure',
      entry,
      score: scoreFamousMatch(
        {
          id: entry.id,
          names: entry.abell !== null ? [entry.name, entry.abell] : [entry.name],
          description: entry.description,
        },
        query,
      ),
    }))
    .filter((s) => s.score > 0);
  structureScored.sort((a, b) => b.score - a.score);
  const structureCapped = structureScored.slice(0, MAX_STRUCTURE_RESULTS);

  return [
    ...(milkyWayRow ? [milkyWayRow] : []),
    ...primaryScored,
    ...catalogCapped,
    ...structureCapped,
  ];
}
