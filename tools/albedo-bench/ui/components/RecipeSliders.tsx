/**
 * RecipeSliders — one control per `AlbedoRecipe` field, plus Save. Grouped
 * by the recipe's own step order (design §7/§8) so the layout mirrors the
 * pipeline the values feed.
 */
import type { ReactNode } from 'react';
import type { AlbedoRecipe } from '../../../textures/AlbedoRecipe';

export type RecipeSlidersProps = {
  recipe: AlbedoRecipe;
  onRecipe: (recipe: AlbedoRecipe) => void;
  onSave: () => void;
  saveStatus: string;
};

const slugify = (label: string) => 'sl-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const id = slugify(props.label);
  return (
    <div className="ctl">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{props.value.toFixed(3)}</output>
    </div>
  );
}

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
  const gain = recipe.grade.gain;
  const offset = recipe.grade.offset;
  return (
    <>
      <Group title="Sun fit">
        <SliderRow
          label="window (km)"
          value={recipe.sunFit.windowKm}
          min={5}
          max={100}
          step={1}
          onChange={(v) => onRecipe({ ...recipe, sunFit: { ...recipe.sunFit, windowKm: v } })}
        />
        <SliderRow
          label="stride (km)"
          value={recipe.sunFit.strideKm}
          min={2}
          max={100}
          step={1}
          onChange={(v) => onRecipe({ ...recipe, sunFit: { ...recipe.sunFit, strideKm: v } })}
        />
        <SliderRow
          label="high pass (km)"
          value={recipe.sunFit.highPassKm}
          min={1}
          max={100}
          step={1}
          onChange={(v) => onRecipe({ ...recipe, sunFit: { ...recipe.sunFit, highPassKm: v } })}
        />
        <SliderRow
          label="min confidence"
          value={recipe.sunFit.minConfidence}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, sunFit: { ...recipe.sunFit, minConfidence: v } })}
        />
        <SliderRow
          label="fill sigma (km)"
          value={recipe.sunFit.fillSigmaKm}
          min={5}
          max={200}
          step={1}
          onChange={(v) => onRecipe({ ...recipe, sunFit: { ...recipe.sunFit, fillSigmaKm: v } })}
        />
      </Group>
      <Group title="De-shade">
        <SliderRow
          label="strength"
          value={recipe.deshade.strength}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, deshade: { ...recipe.deshade, strength: v } })}
        />
        <SliderRow
          label="min shading"
          value={recipe.deshade.minShading}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, deshade: { ...recipe.deshade, minShading: v } })}
        />
      </Group>
      <Group title="Knee">
        <SliderRow
          label="threshold"
          value={recipe.knee.threshold}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, knee: { ...recipe.knee, threshold: v } })}
        />
        <SliderRow
          label="softness"
          value={recipe.knee.softness}
          min={0}
          max={5}
          step={0.05}
          onChange={(v) => onRecipe({ ...recipe, knee: { ...recipe.knee, softness: v } })}
        />
      </Group>
      <Group title="Ice">
        <SliderRow
          label="min |lat| (deg)"
          value={recipe.ice.minAbsLatDeg}
          min={0}
          max={90}
          step={1}
          onChange={(v) => onRecipe({ ...recipe, ice: { ...recipe.ice, minAbsLatDeg: v } })}
        />
        <SliderRow
          label="fade (deg)"
          value={recipe.ice.fadeDeg}
          min={0}
          max={30}
          step={0.5}
          onChange={(v) => onRecipe({ ...recipe, ice: { ...recipe.ice, fadeDeg: v } })}
        />
        <SliderRow
          label="min whiteness"
          value={recipe.ice.minWhiteness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, ice: { ...recipe.ice, minWhiteness: v } })}
        />
        <SliderRow
          label="min luminance"
          value={recipe.ice.minLuminance}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, ice: { ...recipe.ice, minLuminance: v } })}
        />
      </Group>
      <Group title="Grade">
        <SliderRow
          label="exposure (EV)"
          value={recipe.grade.ev}
          min={-3}
          max={3}
          step={0.05}
          onChange={(v) => onRecipe({ ...recipe, grade: { ...recipe.grade, ev: v } })}
        />
        <SliderRow
          label="gain R"
          value={gain[0]}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, gain: [v, gain[1], gain[2]] } })
          }
        />
        <SliderRow
          label="gain G"
          value={gain[1]}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, gain: [gain[0], v, gain[2]] } })
          }
        />
        <SliderRow
          label="gain B"
          value={gain[2]}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, gain: [gain[0], gain[1], v] } })
          }
        />
        <SliderRow
          label="offset R"
          value={offset[0]}
          min={-0.2}
          max={0.2}
          step={0.005}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, offset: [v, offset[1], offset[2]] } })
          }
        />
        <SliderRow
          label="offset G"
          value={offset[1]}
          min={-0.2}
          max={0.2}
          step={0.005}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, offset: [offset[0], v, offset[2]] } })
          }
        />
        <SliderRow
          label="offset B"
          value={offset[2]}
          min={-0.2}
          max={0.2}
          step={0.005}
          onChange={(v) =>
            onRecipe({ ...recipe, grade: { ...recipe.grade, offset: [offset[0], offset[1], v] } })
          }
        />
        <SliderRow
          label="contrast"
          value={recipe.grade.contrast}
          min={0.5}
          max={2}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, grade: { ...recipe.grade, contrast: v } })}
        />
        <SliderRow
          label="saturation"
          value={recipe.grade.saturation}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, grade: { ...recipe.grade, saturation: v } })}
        />
        <SliderRow
          label="gamma"
          value={recipe.grade.gamma}
          min={0.3}
          max={3}
          step={0.01}
          onChange={(v) => onRecipe({ ...recipe, grade: { ...recipe.grade, gamma: v } })}
        />
      </Group>
      <div className="foot">
        <button className="btn primary" onClick={props.onSave}>
          Save
        </button>
        <span className="status">{props.saveStatus}</span>
      </div>
    </>
  );
}
