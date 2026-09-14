/**
 * StructureSettings — per-category structure overlays: one `items` row per
 * `StructureId`, ring/marker and caption axes co-located. No cluster master
 * gate — nothing turns a "hide all structures" knob. All categories default on.
 */

import type { StructureId } from '../data/structure/StructureId';
import type { StructureItemSettings } from './StructureItemSettings';

export type StructureSettings = {
  items: Record<StructureId, StructureItemSettings>;
};
