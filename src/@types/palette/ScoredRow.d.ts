/**
 * ScoredRow — the command palette's row vocabulary. Kept free of React / CSS imports on purpose: the pure
 * ranking pipeline (`rankPaletteMatches`) needs it, and reaching it through the JSX `paletteRows` module would
 * drag React and the CSS module into a pure util.
 */

import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../engine/StructureSearchEntry';
import type { SceneBody } from '../scene/SceneBody';
import type { StarBody } from '../scene/StarBody';
import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';
import type { Exhibit } from '../exhibits/Exhibit';
import type { Tour } from '../animation/tour/Tour';
import type { EarthPlace } from './EarthPlace';
import type { LayerSearchEntry } from '../engine/layer/LayerSearchEntry';

/**
 * One scored row, ready to render.  `kind` discriminates the payload shapes;
 * `ROW_VIEW` dispatches on it for the rendered text and `utils/palette/actionForRow`
 * for the resulting `PaletteAction`.  `milkyWay` carries no payload — it's the singleton
 * FocusableTarget, resolved by the saga.  `body` carries a seeded scene body
 * (Earth, a planet, a mesh body — the `SceneBody` union; the row only reads
 * the shared `id`/`label` fields) and `starCatalog` a seeded star with the
 * source + index its ref needs; both are scored and ranked in like a famous
 * row (see `rankPaletteMatches`).  `exhibit` and `tour` carry a registry row each
 * (`exhibitRegistry`, `tourRegistry`); `place` carries an `EarthPlace` — a
 * search-only point, not a focusable ref — ranked the same way. Those three
 * are the kinds that resolve to something other than a focus. `layer` carries a
 * row a Layer published through its `search` feed, whose `id` is the durable
 * focus id that Layer's own `SelectionKindRow.focusId` claims.
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
