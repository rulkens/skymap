/**
 * rankPaletteMatches — the command palette's pure ranking pipeline.
 *
 * Filters + ranks the two parallel indexes (the curated famous atlas and the
 * PGC-keyed alias index) against the current query, plus the always-present
 * Milky Way row, into one ordered `ScoredRow[]` ready to render.  Pulled out
 * of the component so it has no React / DOM dependency and can be tested in
 * isolation.
 *
 * Empty query shows the full famous atlas in seed-file order so the user can
 * browse without typing — alias entries are NOT shown for empty queries
 * because there are 48k of them and rendering the full list every time the
 * palette opens would be a DOM-thrashing disaster.
 *
 * Non-empty query: score both indexes, sort, slice the alias list to a
 * reasonable cap, and concatenate (famous first because famous always
 * wins ties — see FAMOUS_TIEBREAK).
 */
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import { MILKY_WAY_NAMES } from '../paletteRowModel';
import type { ScoredRow } from '../paletteRowModel';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { AliasIndexEntry } from '../../../@types/engine/AliasIndexEntry';

/**
 * The maximum number of alias rows to include in the rendered list.
 * Generic substrings like `MCG` match thousands of rows; without a
 * cap the palette would render an unscrolled-but-scroll-stuttering
 * 5,000-row `<ul>` and the user would have to type more to see the
 * famous hits.
 */
const MAX_ALIAS_RESULTS = 50;

/**
 * Famous-row tiebreak boost.  Added to every famous-row score so that
 * when a famous entry and an alias entry both score "name starts with
 * query", the famous one ranks higher.  Set just over the largest
 * possible length-bonus to avoid an alias's longer query bonus
 * leapfrogging a famous match — queries are realistically <16 chars,
 * so a +1 boost would be enough; we use +5 for safety.
 */
const FAMOUS_TIEBREAK = 5;

export function rankPaletteMatches(
  entries: readonly FamousMetaEntry[],
  aliasIndex: readonly AliasIndexEntry[] | undefined,
  query: string,
): ScoredRow[] {
  // The Milky Way row is always present (no catalog membership): on an empty
  // query it heads the list as the most-asked-after object; on a query it's
  // scored over MILKY_WAY_NAMES like a famous row and only kept if it hits.
  const mwScore =
    query.trim().length === 0
      ? 0
      : scoreFamousMatch({ id: 'milky-way', names: MILKY_WAY_NAMES, description: '' }, query);
  const milkyWayRow: ScoredRow | null =
    query.trim().length === 0 || mwScore > 0 ? { kind: 'milkyWay', score: mwScore } : null;

  if (query.trim().length === 0) {
    const famousAll = entries.map<ScoredRow>((e) => ({ kind: 'famous', entry: e, score: 0 }));
    return milkyWayRow ? [milkyWayRow, ...famousAll] : famousAll;
  }

  const famousScored: ScoredRow[] = entries
    .map<ScoredRow>((entry) => ({
      kind: 'famous',
      entry,
      score:
        scoreFamousMatch(entry, query) + (scoreFamousMatch(entry, query) > 0 ? FAMOUS_TIEBREAK : 0),
    }))
    .filter((s) => s.score > 0);
  famousScored.sort((a, b) => b.score - a.score);

  const aliasScored: ScoredRow[] = (aliasIndex ?? [])
    .map<ScoredRow>((entry) => ({
      kind: 'alias',
      entry,
      score: scoreAliasMatch(entry, query),
    }))
    .filter((s) => s.score > 0);
  aliasScored.sort((a, b) => b.score - a.score);
  const aliasCapped = aliasScored.slice(0, MAX_ALIAS_RESULTS);

  return [...(milkyWayRow ? [milkyWayRow] : []), ...famousScored, ...aliasCapped];
}
