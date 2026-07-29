/**
 * LabelHomes — the authoritative homes of per-category label visibility,
 * bundled for the projection and the dispatch table.
 *
 * Label visibility is not stored in one place: each label-bearing source type
 * keeps its bit beside that source's OTHER visibility axis, so a reader walks
 * one item row to learn everything about a category. This bundle gathers those
 * homes without flattening them into a fourth stored copy that could drift.
 *
 * ### Why these fields and not `EngineSettingsState`
 *
 * Under Immer, `state.settings` gets a fresh identity on EVERY settings write,
 * so a projection keyed off the whole bag would rebuild — and re-render the
 * Labels section — on an unrelated slider drag. Each field here is the exact
 * stable reference a selector returns, so the container's `useMemo` rebuilds
 * only when a label home actually changes.
 */

import type { StructureId } from '../data/structure/StructureId';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { StarCatalogId } from '../data/starCatalog/StarCatalogId';
import type { BodyId } from '../data/body/BodyId';
import type { StructureItemSettings } from './StructureItemSettings';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { StarCatalogItemSettings } from './StarCatalogItemSettings';
import type { BodyItemSettings } from './BodyItemSettings';

export type LabelHomes = {
  readonly structures: Record<StructureId, StructureItemSettings>;
  readonly galaxyCatalogs: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
  readonly starCatalogs: Record<StarCatalogId, StarCatalogItemSettings>;
  readonly bodies: Record<BodyId, BodyItemSettings>;
  readonly milkyWayLabelEnabled: boolean;
};
