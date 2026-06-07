import type { PickRenderer } from '../rendering/PickRenderer';
import type { StructureRecord } from './data/StructureRecord';
import type { PoiCategory } from './data/PoiCategory';

export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  /**
   * Map a POI pick hit `(category, poiIndex)` to its `StructureRecord`
   * record.  Optional — when absent, POI hits resolve to null (no
   * selection) instead of a `'poi'` Selection.
   *
   * Why optional?  The galaxy-only call paths (unit tests; the engine
   * bootstrap window before POI tables exist) shouldn't be forced to
   * stub a callback they never trigger.  In production, `wireInput`
   * passes a closure that reads `state.data.structures`; in tests, a
   * static lookup or `() => null` suffices.
   *
   * Returning `null` (e.g. an unallocated `poiIndex`, or a category the
   * engine hasn't been seeded with yet) resolves to null — same
   * fall-through as omitting the callback. That keeps the InfoCard from
   * ever showing a phantom POI card for a pick that decoded
   * successfully but had no backing record.
   */
  resolvePoi?: (input: { category: PoiCategory; poiIndex: number }) => StructureRecord | null;
};
