/**
 * PoiCategory — the full set of point-of-interest categories the UI and
 * selection layers speak: the three extended-structure categories plus
 * `famousGalaxy`.
 *
 * Defined as `StructureCategory | 'famousGalaxy'` so the structure categories
 * and this superset can't drift: adding a structure category in one place adds
 * it here too.
 *
 * Used where the FOUR-category space is genuinely needed — the SettingsPanel
 * label/marker visibility toggles, `EngineSettingsState`'s per-category
 * visibility records, the label-style override target, and the ring pick
 * decode (which can only ever yield a structure category, but shares the
 * decode type).  The structure-only layers (the store, its records, the
 * marker producer) use the narrower `StructureCategory`.
 */

import type { StructureCategory } from './StructureCategory';

export type PoiCategory = StructureCategory | 'famousGalaxy';
