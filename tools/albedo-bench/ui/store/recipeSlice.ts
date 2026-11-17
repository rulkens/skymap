import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AlbedoRecipe } from '../../../textures/@types/AlbedoRecipe';
import type { RecipeEditState } from '../../@types/RecipeEditState';
import type { RecipeNumberPath } from '../../@types/RecipeNumberPath';

const initialState: RecipeEditState = { recipe: undefined, loadError: undefined, saveStatus: '' };

export const recipeSlice = createSlice({
  name: 'recipe',
  initialState,
  reducers: {
    recipeLoaded: (state, action: PayloadAction<AlbedoRecipe>) => {
      state.recipe = action.payload;
    },
    recipeLoadFailed: (state, action: PayloadAction<string>) => {
      state.loadError = action.payload;
    },
    // Mutating one leaf keeps every other group's identity (immer), which is
    // what lets the field refit key on `sunFit` and skip grade edits.
    setRecipeNumber: (state, action: PayloadAction<{ path: RecipeNumberPath; value: number }>) => {
      if (state.recipe === undefined) return;
      const [group, key, channel] = action.payload.path;
      const fields = state.recipe[group] as Record<string, number | number[]>;
      if (channel === undefined) fields[key] = action.payload.value;
      else (fields[key] as number[])[channel] = action.payload.value;
    },
    saveStarted: (state) => {
      state.saveStatus = 'Saving…';
    },
    saveSucceeded: (state, action: PayloadAction<AlbedoRecipe>) => {
      state.recipe = action.payload;
      state.saveStatus = 'Saved.';
    },
    saveFailed: (state, action: PayloadAction<string>) => {
      state.saveStatus = `Save failed: ${action.payload}`;
    },
  },
});

export const {
  recipeLoaded,
  recipeLoadFailed,
  setRecipeNumber,
  saveStarted,
  saveSucceeded,
  saveFailed,
} = recipeSlice.actions;
