/**
 * paletteRowModel — the NON-JSX row vocabulary for the command palette.
 *
 * Kept free of React / CSS imports on purpose: the pure ranking pipeline
 * (`utils/rankPaletteMatches`) needs the `ScoredRow` union and the
 * Milky-Way name list, but pulling those out of the JSX-heavy `paletteRows`
 * module would drag React + the CSS-module into a pure util. This module is
 * the shared seam both halves can import.
 */
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';
import type { SceneBody } from '../../@types/scene/SceneBody';
import type { StarBody } from '../../@types/scene/StarBody';
import type { StarCatalogSourceType } from '../../@types/data/starCatalog/StarCatalogSourceType';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { Tour } from '../../@types/animation/tour/Tour';
import type { EarthPlace } from '../../@types/palette/EarthPlace';
import type { LayerSearchEntry } from '../../@types/engine/layer/LayerSearchEntry';

/**
 * Fixed search terms for the always-present Milky Way row.  The matcher
 * (`scoreFamousMatch`) scores these like any catalog row's `names`, so
 * "milky way", "galaxy", or "home" all surface the command.  The first is
 * what renders in the row.
 */
const MILKY_WAY_PRIMARY_NAME = 'Milky Way';
// `as const` (readonly tuple, not `readonly string[]`) so `MILKY_WAY_NAMES[0]`
// and `[0][0]` are `string` under `noUncheckedIndexedAccess` — the row view
// indexes them directly.
export const MILKY_WAY_NAMES = [MILKY_WAY_PRIMARY_NAME, 'Galaxy', 'Home'] as const;

/**
 * One scored row, ready to render.  `kind` discriminates the payload shapes;
 * `ROW_VIEW` dispatches on it for the rendered text and `utils/actionForRow`
 * for the resulting `PaletteAction`.  `milkyWay` carries no payload — it's the singleton
 * FocusableTarget, resolved by the saga.  `body` carries a seeded scene body
 * (Earth, a planet, a mesh body — the `SceneBody` union; the row only reads
 * the shared `id`/`label` fields) and `starCatalog` a seeded star with the
 * source + index its ref needs; both are scored and ranked in like a famous
 * row (see `rankPaletteMatches`).  `exhibit` and `tour` carry a registry row each
 * (`exhibitRegistry`, `tourRegistry`); `place` carries an `EarthPlace` — a
 * search-only point, not a focusable ref — ranked the same way. Those three
 * are the kinds that resolve to something other than a focus. `layer` carries a
 * row a Layer published through its `search` feed, which already names the ref
 * it selects, so it is the one kind that needs no id grammar.
 */
export type ScoredRow =
  | { kind: 'famous'; entry: FamousGalaxyMetaEntry; score: number }
  | { kind: 'alias'; entry: AliasIndexEntry; score: number }
  | { kind: 'structure'; entry: StructureSearchEntry; score: number }
  | { kind: 'milkyWay'; score: number }
  | { kind: 'body'; body: SceneBody; score: number }
  | {
      kind: 'starCatalog';
      source: StarCatalogSourceType;
      index: number;
      star: StarBody;
      score: number;
    }
  | { kind: 'exhibit'; exhibit: Exhibit; score: number }
  | { kind: 'tour'; tour: Tour; score: number }
  | { kind: 'place'; entry: EarthPlace; score: number }
  | { kind: 'layer'; entry: LayerSearchEntry; score: number };
