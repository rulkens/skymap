/** RecipeSliders — one control per `AlbedoRecipe` field (the rows live in
 *  `RecipeSliders.constants.ts`), plus Save. */
import type { ReactNode } from 'react';
import { api } from '../api';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { saveFailed, saveStarted, saveSucceeded, setRecipeNumber } from '../store/recipeSlice';
import { recipeNumberAt } from '../utils/recipeNumberAt';
import { RECIPE_SLIDER_ROWS } from './RecipeSliders.constants';
import { SliderRow } from './SliderRow';

function Group(props: { title: string; children: ReactNode }) {
  return (
    <div className="group">
      <span className="label">{props.title}</span>
      {props.children}
    </div>
  );
}

export function RecipeSliders() {
  const dispatch = useAppDispatch();
  const { recipe, saveStatus } = useAppSelector((s) => s.recipe);
  if (recipe === undefined) return null;
  const sections = [...new Set(RECIPE_SLIDER_ROWS.map((row) => row.section))];

  const onSave = async (): Promise<void> => {
    dispatch(saveStarted());
    try {
      dispatch(saveSucceeded(await api.saveRecipe(recipe)));
    } catch (err) {
      dispatch(saveFailed(String(err)));
    }
  };

  return (
    <>
      {sections.map((section) => (
        <Group key={section} title={section}>
          {RECIPE_SLIDER_ROWS.filter((row) => row.section === section).map((row) => (
            <SliderRow
              key={row.label}
              label={row.label}
              value={recipeNumberAt(recipe, row.path)}
              min={row.min}
              max={row.max}
              step={row.step}
              onChange={(value) => dispatch(setRecipeNumber({ path: row.path, value }))}
            />
          ))}
        </Group>
      ))}
      <div className="foot">
        <button className="btn primary" onClick={() => void onSave()}>
          Save
        </button>
        <span className="status">{saveStatus}</span>
      </div>
    </>
  );
}
