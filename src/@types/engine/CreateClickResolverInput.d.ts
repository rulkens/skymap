import type { PickRenderer } from '../rendering/PickRenderer';
import type { PickStructureStore } from './data/PickStructureStore';

/**
 * Inputs `createClickResolver` needs to turn a click position into a
 * `SelectionRef`. The pick renderer decodes the pixel; `structures` is the
 * only dep forwarded to `resolvePick` (the galaxy arm is purely positional
 * now — no cloud read needed at pick time). In production `wireInput` passes
 * the live store; tests stub a one-method `{ byCategory }` object.
 */
export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  /**
   * Structure store projection `resolvePick` indexes to resolve a ring
   * hit's `(category, structureIndex)` to its durable record id. An empty
   * store resolves structure hits to null — no phantom selection.
   */
  structures: PickStructureStore;
};
