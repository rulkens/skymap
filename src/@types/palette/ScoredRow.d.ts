/**
 * ScoredRow — the command palette's row vocabulary, free of React / CSS imports so the pure
 * `rankPaletteMatches` need not pull in the JSX `paletteRows` module.
 */

import type { FamousGalaxyMetaEntry } from '../loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../engine/StructureSearchEntry';
import type { Exhibit } from '../exhibits/Exhibit';
import type { Tour } from '../animation/tour/Tour';
import type { EarthPlace } from './EarthPlace';
import type { LayerSearchEntry } from '../engine/layer/LayerSearchEntry';
import type { SkySpot } from '../camera/pose/SkySpot';

/**
 * One scored row. `ROW_VIEW` and `utils/palette/actionForRow` dispatch on `kind`. `exhibit`,
 * `tour` and `place` (a search-only `EarthPlace`, not a focusable ref) resolve to something
 * other than a focus. `layer` carries a Layer's `search` feed row, whose `id` is the focus id
 * that Layer's `SelectionKindRow.focusId` claims. `sky` stands at a spot (`'here'` is the view
 * centre, read when picked); `place` names it after an Earth place, else it reads as coordinates.
 */
export type ScoredRow =
  | { kind: 'famous'; entry: FamousGalaxyMetaEntry; score: number }
  | { kind: 'alias'; entry: AliasIndexEntry; score: number }
  | { kind: 'structure'; entry: StructureSearchEntry; score: number }
  | { kind: 'exhibit'; exhibit: Exhibit; score: number }
  | { kind: 'tour'; tour: Tour; score: number }
  | { kind: 'place'; entry: EarthPlace; score: number }
  | { kind: 'layer'; entry: LayerSearchEntry; score: number }
  | { kind: 'sky'; spot: SkySpot | 'here'; place: EarthPlace | null; score: number };
