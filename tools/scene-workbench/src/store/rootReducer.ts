import { combineReducers } from '@reduxjs/toolkit';

import { registrySlice } from '../state/registry/registrySlice';
import { groupSlice } from '../state/group/groupSlice';
import { viewSlice } from '../state/view/viewSlice';

/** Spec §7.1's `poses` and `edit` slices arrive with plan 3's overlay and
 *  nudge panel — adding them now would be reducers nothing dispatches. */
export const rootReducer = combineReducers({
  registry: registrySlice.reducer,
  group: groupSlice.reducer,
  view: viewSlice.reducer,
});
