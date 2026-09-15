/**
 * EngineSliceState — the shape of the Redux 'engine' slice: `CoreEngineSliceState`
 * widened with every Layer's published facts (D6), the same composition pattern
 * `EngineSettingsState` uses over the settings fragments.
 *
 * The `APP_COMPOSITION` import is TYPE-ONLY and fully erased at build — nothing
 * here folds a value, so `engineSlice.ts` carries no runtime edge to the
 * composition (see the plan's D1 import-cycle finding). `createLayers` seeds
 * each Layer's key from `layer.facts` before its `create` runs.
 */

import type { APP_COMPOSITION } from '../../compositions/app';
import type { CoreEngineSliceState } from './CoreEngineSliceState';
import type { FactsOf } from '../engine/layer/FactsOf';

export type EngineSliceState = CoreEngineSliceState & FactsOf<typeof APP_COMPOSITION.layers>;
