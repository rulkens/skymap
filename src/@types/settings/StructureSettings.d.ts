/**
 * StructureSettings — structure-overlay per-category settings. `items` — one
 * row per `StructureId` — carries the ring/marker axis (`enabled`) and the
 * text-label axis (`labelEnabled`) co-located, so a reader walks one
 * `items[cat]` entry instead of cross-indexing two parallel records. The
 * same per-item accessor galaxy catalogs / volumes / star catalogs / bodies
 * expose. No cluster-level master gate — like `galaxyCatalogs`, nothing
 * turns a "hide all structures" knob. Defaults to every category visible.
 */

import type { StructureId } from '../data/structure/StructureId';
import type { StructureItemSettings } from './StructureItemSettings';

export type StructureSettings = {
  items: Record<StructureId, StructureItemSettings>;
};
