/**
 * setFlowAction — the imperative bridge for a partial patch into the
 * flow-overlay settings slice.
 *
 * Runs the pure `setFlow` reducer through `store.setState`, the only place a
 * write lands. The per-leaf render side-effects (demand re-eval on `enabled`,
 * the fade ramp, the mode/count reseed) stay in the `handle.flow.set` wrapper
 * alongside this action — they're render concerns, not settings writes. The
 * GPU-safe clamps stay at `clampFlowParams` in the flow renderer (the caller
 * passes raw intent).
 */

import type { SettingsStore } from '../createSettingsStore';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';
import { setFlow } from '../reducers/setFlow';

export function setFlowAction(store: SettingsStore, patch: Partial<FlowSettings>): void {
  store.setState((s) => setFlow(s, patch));
}
