/**
 * applyLayerSwitchesSaga — puts a link's `layers` switches, in order. Shared by
 * `applyLinkSettingsSaga` and an exhibit body, which re-lands them over its own settings.
 */
import { put, select } from 'typed-redux-saga';

import { selectSettings } from '../settings/selectSettings';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';
import type { LayerSwitch } from '../../@types/url/LayerSwitch';

export function* applyLayerSwitchesSaga(layers: readonly LayerSwitch[]) {
  // One read serves the list: whether a cluster has a section switch is structural, and no
  // write here changes it. `overMs: 0` snaps, as a link's orientation does.
  const settings = yield* select(selectSettings);
  for (const { address, on } of layers) {
    for (const action of setVisibilityActionsFor(settings, address, on, 0)) yield* put(action);
  }
}
