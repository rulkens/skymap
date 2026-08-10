/**
 * DEFAULT_EXTRAS_STATE — the spike's boot extra-galaxies scatter toggle
 * (`Galaxy Renderer.dc.html`): off by default, 8 satellites once enabled.
 */

import type { ExtrasState } from '../../@types/state/ExtrasState';

export const DEFAULT_EXTRAS_STATE: ExtrasState = {
  enabled: false,
  count: 8,
  regenNonce: 0,
};
