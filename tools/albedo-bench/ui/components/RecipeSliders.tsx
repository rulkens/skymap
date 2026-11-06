/** RecipeSliders — one control per `AlbedoRecipe` field (the rows live in
 *  `RecipeSliders.constants.ts`), plus Save. */
import type { ReactNode } from 'react';
import type { AlbedoRecipe } from '../../../textures/@types/AlbedoRecipe';
import { recipeNumberAt } from '../utils/recipeNumberAt';
import { withRecipeNumber } from '../utils/withRecipeNumber';
import { RECIPE_SLIDER_ROWS } from './RecipeSliders.constants';
import { SliderRow } from './SliderRow';

export type RecipeSlidersProps = {
  recipe: AlbedoRecipe;
  onRecipe: (recipe: AlbedoRecipe) => void;
  onSave: () => void;
  saveStatus: string;
};

function Group(props: { title: string; children: ReactNode }) {
  return (
    <div className="group">
      <span className="label">{props.title}</span>
      {props.children}
    </div>
  );
}

export function RecipeSliders(props: RecipeSlidersProps) {
  const { recipe, onRecipe } = props;
  const sections = [...new Set(RECIPE_SLIDER_ROWS.map((row) => row.section))];
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
              onChange={(v) => onRecipe(withRecipeNumber(recipe, row.path, v))}
            />
          ))}
        </Group>
      ))}
      <div className="foot">
        <button className="btn primary" onClick={props.onSave}>
          Save
        </button>
        <span className="status">{props.saveStatus}</span>
      </div>
    </>
  );
}
