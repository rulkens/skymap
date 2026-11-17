/**
 * antiqueLookOn — the antique look draws this frame. Canvas-only: a dome's
 * faces resolve `swap` to their own outputs, which the look's rerouting of
 * the swap lines would leave unwritten.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';

export function antiqueLookOn(state: EngineState): boolean {
  return state.settings.antique.enabled && state.viewRig === 'mono';
}
