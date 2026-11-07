/**
 * rankPaletteMatches — the command palette's pure ranking pipeline over a non-empty query.
 * Primary named objects share one score-sorted list, so an exact "earth" outranks a famous row
 * that only matched it in its description; alias and structure lists are capped and appended.
 * Sky rows: typed coordinates lead, each place match is followed by its own "Sky from" row, and
 * "Sky from here" competes by name only while entry is on offer (spec §4.2).
 */
import { scoreFamousMatch } from './scoreFamousMatch';
import { scoreAliasMatch } from './scoreAliasMatch';
import { APP_EXHIBIT_REGISTRY } from '../../compositions/appExhibits';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import { EARTH_PLACES } from '../../data/palette/earthPlaces';
import { parseLatLonQuery } from '../geo/parseLatLonQuery';
import { skySpotFromLonLat } from '../geo/skySpotFromLonLat';
import { asSceneBodyId } from '../scene/asSceneBodyId';
import type { ScoredRow } from '../../@types/palette/ScoredRow';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';
import type { LayerSearchEntry } from '../../@types/engine/layer/LayerSearchEntry';
import type { PaletteSkyContext } from '../../@types/palette/PaletteSkyContext';

/** Generic substrings like `MCG` match thousands of rows; uncapped, the palette would render a stuttering 5,000-row `<ul>`. */
const MAX_ALIAS_RESULTS = 50;

/** Same DOM budget: a generic substring ('A' for Abell) still hits a few hundred of ~370 structures. */
const MAX_STRUCTURE_RESULTS = 50;

/** Primary-row boost: keeps an alias's longer-query bonus (queries <16 chars) from leapfrogging a primary match. */
const PRIMARY_TIEBREAK = 5;

/** Typed coordinates are as exact as a query gets: an exact name match's score. */
const COORDINATES_SCORE = 1000 + PRIMARY_TIEBREAK;

const EARTH = asSceneBodyId('earth');
const SKY_HERE_NAMES = ['Sky from here', 'Look up from here'];

export function rankPaletteMatches(
  entries: readonly FamousGalaxyMetaEntry[],
  aliasIndex: readonly AliasIndexEntry[] | undefined,
  structures: readonly StructureSearchEntry[] | undefined,
  layerRows: readonly LayerSearchEntry[],
  query: string,
  sky: PaletteSkyContext,
): ScoredRow[] {
  if (query.trim().length === 0) return [];

  const famousScored: ScoredRow[] = entries
    .map<ScoredRow>((entry) => {
      const raw = scoreFamousMatch(entry, query);
      return { kind: 'famous', entry, score: raw > 0 ? raw + PRIMARY_TIEBREAK : 0 };
    })
    .filter((s) => s.score > 0);

  // Scored on the registry label alone (spec §7.4), so a focus card never duplicates the object
  // it takes over to. `Tour.dev` tours are harnesses and stay out of search.
  const exhibitScored: ScoredRow[] = Object.values(APP_EXHIBIT_REGISTRY)
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

  // Same score as its fly-to and right behind it, so the stable sort keeps the pair together.
  const placeScored: ScoredRow[] = EARTH_PLACES.flatMap<ScoredRow>((place) => {
    const raw = scoreFamousMatch({ id: place.id, names: place.names, description: '' }, query);
    if (raw === 0) return [];
    const score = raw + PRIMARY_TIEBREAK;
    const spot = skySpotFromLonLat(EARTH, place);
    return [
      { kind: 'place', entry: place, score },
      { kind: 'sky', spot, place, score },
    ];
  });

  const typed = parseLatLonQuery(query);
  const coordinatesScored: ScoredRow[] =
    typed === null
      ? []
      : [
          {
            kind: 'sky',
            spot: skySpotFromLonLat(sky.host, typed),
            place: null,
            score: COORDINATES_SCORE,
          },
        ];

  const hereRaw = sky.hereOpen
    ? scoreFamousMatch({ id: '', names: SKY_HERE_NAMES, description: '' }, query)
    : 0;
  const hereScored: ScoredRow[] =
    hereRaw > 0
      ? [{ kind: 'sky', spot: 'here', place: null, score: hereRaw + PRIMARY_TIEBREAK }]
      : [];

  // The id is withheld: Layer ids are focus ids (`body-mars`), which would substring-match "bod".
  // `catalog` rows are capped beside the alias rows so a bulk catalog cannot drown named objects.
  const layerScored: ScoredRow[] = layerRows
    .map<ScoredRow>((entry) => {
      const raw = scoreFamousMatch({ id: '', names: entry.names, description: '' }, query);
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

  // The sort is stable, so earlier arrays stay ahead on a score tie (famous first).
  const primaryScored = [
    ...coordinatesScored,
    ...famousScored,
    ...placeScored,
    ...hereScored,
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
  // One capped bucket: Layer catalog rows and aliases compete for the same DOM budget.
  const catalogScored = [...aliasScored, ...layerCatalogScored].sort((a, b) => b.score - a.score);
  const catalogCapped = catalogScored.slice(0, MAX_ALIAS_RESULTS);

  // The Abell designation joins `names` so 'A1656' and 'Coma' both hit.
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

  return [...primaryScored, ...catalogCapped, ...structureCapped];
}
