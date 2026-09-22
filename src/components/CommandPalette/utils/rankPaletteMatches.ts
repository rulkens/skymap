/**
 * rankPaletteMatches — the command palette's pure ranking pipeline.
 *
 * Filters + ranks the parallel indexes (the curated famous atlas, the seeded
 * scene bodies, the fixed Earth-places table, the PGC-keyed alias index, and
 * the large-scale structure catalog) against the current query, plus the
 * always-present Milky Way row, into one ordered `ScoredRow[]` ready to
 * render.  Pulled out of the component so it has no React / DOM dependency
 * and can be tested in isolation.
 *
 * An empty query yields no rows — the featured grid owns browsing
 * (`FeaturedGrid` over `FEATURED_TABS`), so this only scores non-empty queries.
 *
 * Famous rows, seeded scene bodies (Earth, the planets), the seeded stars, and
 * Earth places are one class of "primary named object" and share a single
 * score-sorted list, so an exact body match like "earth" outranks a famous
 * row that only matched "earth" in its description. The alias and structure
 * lists are scored, capped, and appended after.
 */
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import { MILKY_WAY_NAMES } from '../paletteRowModel';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { BODY_SEARCH_NAMES } from '../../../data/bodies/bodySearchNames';
import { isRegistryBodyId } from '../../../utils/scene/isRegistryBodyId';
import { exhibitRegistry } from '../../../data/exhibits/exhibitRegistry';
import { tourRegistry } from '../../../data/animation/tours/tourRegistry';
import { EARTH_PLACES } from '../../../data/palette/earthPlaces';
import type { ScoredRow } from '../paletteRowModel';
import type { FamousGalaxyMetaEntry } from '../../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../@types/engine/StructureSearchEntry';

/**
 * The maximum number of alias rows to include in the rendered list.
 * Generic substrings like `MCG` match thousands of rows; without a
 * cap the palette would render an unscrolled-but-scroll-stuttering
 * 5,000-row `<ul>` and the user would have to type more to see the
 * famous hits.
 */
const MAX_ALIAS_RESULTS = 50;

/**
 * Cap on rendered structure rows.  Far fewer structures (~370) than aliases,
 * but a generic substring ('A' for Abell) still hits a few hundred, so we cap
 * for the same DOM-budget reason.
 */
const MAX_STRUCTURE_RESULTS = 50;

/**
 * Primary-row tiebreak boost.  Added to every famous-row and scene-body score
 * so that when a primary named object and an alias both score "name starts with
 * query", the primary one ranks higher.  Set just over the largest possible
 * length-bonus so an alias's longer-query bonus can't leapfrog a primary match
 * — queries are realistically <16 chars, so a +1 boost would be enough; we use
 * +5 for safety.
 */
const PRIMARY_TIEBREAK = 5;

export function rankPaletteMatches(
  entries: readonly FamousGalaxyMetaEntry[],
  aliasIndex: readonly AliasIndexEntry[] | undefined,
  structures: readonly StructureSearchEntry[] | undefined,
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
    .flatMap<ScoredRow>(([source, stars]) =>
      stars.map((star, index) => {
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
  const exhibitScored: ScoredRow[] = Object.values(exhibitRegistry)
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
  ].sort((a, b) => b.score - a.score);

  const aliasScored: ScoredRow[] = (aliasIndex ?? [])
    .map<ScoredRow>((entry) => ({
      kind: 'alias',
      entry,
      score: scoreAliasMatch(entry, query),
    }))
    .filter((s) => s.score > 0);
  aliasScored.sort((a, b) => b.score - a.score);
  const aliasCapped = aliasScored.slice(0, MAX_ALIAS_RESULTS);

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
    ...aliasCapped,
    ...structureCapped,
  ];
}
