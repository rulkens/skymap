/** createBenchStore — a factory, like the other tools' stores, so a test
 *  or a remount never shares state with the last one. */
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { navigationSlice } from './navigationSlice';
import { recipeSlice } from './recipeSlice';
import { renderSlice } from './renderSlice';
import { sunSlice } from './sunSlice';

const rootReducer = combineReducers({
  navigation: navigationSlice.reducer,
  recipe: recipeSlice.reducer,
  sun: sunSlice.reducer,
  render: renderSlice.reducer,
});

export function createBenchStore() {
  return configureStore({ reducer: rootReducer });
}
