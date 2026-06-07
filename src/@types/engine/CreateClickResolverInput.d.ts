import type { PickRenderer } from '../rendering/PickRenderer';
import type { PickStructureStore } from './data/PickStructureStore';

export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  /**
   * Structure store projection for `pickToSelection` to resolve a ring
   * hit's `(category, poiIndex)` to its record id. In production
   * `wireInput` passes `state.data.structures`; tests stub a one-method
   * `{ byCategory }` object. An empty store resolves structure hits to
   * null — no phantom POI card.
   */
  structures: PickStructureStore;
};
