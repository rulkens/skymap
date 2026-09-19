/**
 * rankPaletteMatches — the command palette's pure ranking pipeline.
 *
 * Filters + ranks the parallel indexes (the curated famous atlas, the seeded
 * scene bodies, the PGC-keyed alias index, and the large-scale structure
 * catalog) against the current query, plus the always-present Milky Way row,
 * into one ordered `ScoredRow[]` ready to render.  Pulled out of the component
 * so it has no React / DOM dependency and can be tested in isolation.
 *
 * An empty query yields no rows — the featured grid owns browsing now
 * (`FeaturedGrid` over `FEATURED_TABS`), so this only scores non-empty queries.
 *
 * Famous rows and seeded scene bodies (Earth, the planets, the stars) are one
 * class of "primary named object" and share a single score-sorted list, so an
 * exact body match like "earth" outranks a famous row that only matched
 * "earth" in its description. The alias and structure lists are scored,
 * capped, and appended after.
 */
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import { MILKY_WAY_NAMES } from '../paletteRowModel';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { BODY_SEARCH_NAMES } from '../../../data/bodies/bodySearchNames';
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

  // The Milky Way row is always present (no catalog membership), scored over
  // MILKY_WAY_NAMES like a famous row and only kept if it hits.
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

  // Seeded scene bodies (Earth, the stars, the planets) are scored like a
  // famous row. The wheel-zoom floor (clampDistance.ts) is derived from the
  // focused body's own radius, so a picked body always resolves to a
  // reachable, non-sub-pixel focus target.
  //
  // A body scores over its full alias list (BODY_SEARCH_NAMES), so a Bayer
  // designation ("Alpha Canis Majoris") surfaces the same row as the common
  // name ("Sirius"). Earth/planets aren't in the map and fall back to their
  // single label.
  const bodyScored: ScoredRow[] = SCENE_BODIES.map<ScoredRow>((body) => {
    const names = BODY_SEARCH_NAMES.get(body.id) ?? [body.label];
    const raw = scoreFamousMatch({ id: body.id, names, description: '' }, query);
    return { kind: 'body', body, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
  }).filter((s) => s.score > 0);

  // Famous rows and scene bodies are one class of primary named object: merge
  // and sort together so an exact body match ("earth") outranks a famous row
  // that only matched "earth" in its description. The sort is stable, so a
  // famous row stays ahead of a body on an exact score tie (famous listed first).
  const primaryScored = [...famousScored, ...bodyScored].sort((a, b) => b.score - a.score);

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
