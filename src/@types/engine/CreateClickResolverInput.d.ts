import type { PickProgram } from './frame/PickProgram';
import type { SelectionResolver } from './selection/SelectionResolver';

/**
 * Inputs `createClickResolver` needs to turn a click position into a
 * `SelectionRef`. The pick program decodes the pixel under the cursor;
 * `resolvePick` is the composed resolver's dispatch (D5) — the same one the
 * hover path calls, so click and hover can't drift on how a pixel resolves.
 */
export type CreateClickResolverInput = {
  pickProgram: PickProgram;
  resolvePick: SelectionResolver['resolvePick'];
};
