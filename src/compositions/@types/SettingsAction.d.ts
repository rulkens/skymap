/**
 * SettingsAction — the settings actions a clip's `scene(action)` effect may
 * dispatch. Narrow rather than `AnyAction` so a clip cannot dispatch something
 * no reconcile saga handles; widen it as a tour beat needs a new knob.
 *
 * `setGalaxyCatalogVisible` is here because the `'survey'` layer key fans over
 * ALL catalogs, and the tour's opening strips just milliquas.
 */

import type { setFlow, setFlowEnabled } from '../../layers/flow/state/flow/slice';
import type { setGalaxyCatalogVisible } from '../../layers/galaxyCatalog/state/galaxyCatalogs/slice';
import type { setLabelsFocusedOnly } from '../../state/settings/core/labelsSlice';

export type SettingsAction =
  | ReturnType<typeof setFlowEnabled>
  | ReturnType<typeof setFlow>
  | ReturnType<typeof setGalaxyCatalogVisible>
  | ReturnType<typeof setLabelsFocusedOnly>;
