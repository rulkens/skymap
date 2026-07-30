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

/**
 * Fixed search terms for the always-present Milky Way row.  The matcher
 * (`scoreFamousMatch`) scores these like any catalog row's `names`, so
 * "milky way", "galaxy", or "home" all surface the command.  The first is
 * what renders in the row.
 */
export const MILKY_WAY_PRIMARY_NAME = 'Milky Way';
// `as const` (readonly tuple, not `readonly string[]`) so `MILKY_WAY_NAMES[0]`
// and `[0][0]` are `string` under `noUncheckedIndexedAccess` — the row view
// indexes them directly.
export const MILKY_WAY_NAMES = [MILKY_WAY_PRIMARY_NAME, 'Galaxy', 'Home'] as const;

/**
 * One scored row, ready to render.  `kind` discriminates the payload shapes;
 * `ROW_VIEW` dispatches on it for the rendered text and `utils/focusIdForRow`
 * for the durable focus id.  `milkyWay` carries no payload — it's the singleton
 * FocusableTarget, resolved by the saga.  `body` carries a seeded scene body
 * (Earth, the stars, the planets — the `SceneBody` union; the row only reads
 * the shared `id`/`label` fields); it's scored and ranked in like a famous
 * row (see `rankPaletteMatches`).
 */
export type ScoredRow =
  | { kind: 'famous'; entry: FamousGalaxyMetaEntry; score: number }
  | { kind: 'alias'; entry: AliasIndexEntry; score: number }
  | { kind: 'structure'; entry: StructureSearchEntry; score: number }
  | { kind: 'milkyWay'; score: number }
  | { kind: 'body'; body: SceneBody; score: number };
