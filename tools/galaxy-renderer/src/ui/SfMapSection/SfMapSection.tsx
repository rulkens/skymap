/**
 * SfMapSection — the SSPSF cellular automaton (`GalaxyFieldTuning.sfMap`,
 * `src/@types/galaxy/GalaxySfMapParams.ts`). Nested under `fieldTuning.sfMap`
 * rather than a flat field, same spreading-patch idiom as `DustSection`'s
 * `patchDust`. Nobody has tuned this yet, so every range here is
 * deliberately wide — see the field docblocks for what each knob does and
 * `defaultGalaxySfMapParams.ts` for why `spread` alone gets a fine step.
 */
import type { ReactNode } from 'react';
import type { GalaxySfMapParams } from '../../../../../src/@types/galaxy/GalaxySfMapParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './SfMapSection.module.css';

function SfMapSection(): ReactNode {
  const dispatch = useAppDispatch();
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const open = useAppSelector((state) => state.ui.openSections.sfMap);
  const sfMap = fieldTuning.sfMap;

  const patchSfMap = (patch: Partial<GalaxySfMapParams>): void => {
    dispatch(fieldTuningPatched({ sfMap: { ...sfMap, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="SF MAP"
      open={open}
      onToggle={() => dispatch(sectionToggled('sfMap'))}
      headerToggle={sfMap.enabled}
      onHeaderToggleChange={(value) => patchSfMap({ enabled: value })}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Steps"
          value={sfMap.steps}
          min={1}
          max={200}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ steps: Math.round(v) })}
          info="Automaton iterations per rebuild. Structure coarsens with more steps; the shear winds it. Rebuild latency is linear in this — the dominant cost of a slider drag."
        />
        <ParamSlider
          label="Base ignition"
          value={sfMap.baseIgnition}
          min={0}
          max={0.002}
          step={0.00005}
          format={(v) => v.toFixed(5)}
          onChange={(v) => patchSfMap({ baseIgnition: v })}
          info="Spontaneous ignition probability per cell per step, independent of neighbours — the seed that keeps a quiet disc from dying out. Seeds should be RARE: propagation does the work, and the whole grid rolls this every step."
        />
        <ParamSlider
          label="Spread"
          value={sfMap.spread}
          min={0}
          max={0.2}
          step={0.002}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ spread: v })}
          info="Added ignition probability per already-ignited neighbour. Mean offspring per active cell is 8*spread over the Moore neighbourhood, so criticality is exactly 1/8 = 0.125 — above it the disc saturates exponentially. The whole useful band is below that mark."
        />
        <ParamSlider
          label="Refractory steps"
          value={sfMap.refractorySteps}
          min={1}
          max={30}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ refractorySteps: Math.round(v) })}
          info="Steps a cell stays spent before its gas can ignite again. Sets the width of the trailing wake behind a propagating front."
        />
        <ParamSlider
          label="Gas regen"
          value={sfMap.gasRegen}
          min={0}
          max={0.2}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ gasRegen: v })}
          info="Gas recovered per step as a fraction of full — the star/gas feedback the original stars-only model lacked. Recovery takes 1/gasRegen steps, so this is the CONTRAST knob: it sets how long a burnt void stays a void rather than simmering back."
        />
        <ParamSlider
          label="Arm forcing"
          value={sfMap.armForcing}
          min={0}
          max={0.1}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ armForcing: v })}
          info="How much the spiral ridge raises local ignition probability, per step. 0 makes the automaton blind to the arms and the output goes purely flocculent. Past ~0.06 the arms IGNITE rather than bias — a forced cell then fires as often as its refractory window allows, whatever spread does."
        />
        <ParamSlider
          label="Corotation radius"
          value={sfMap.corotationRadius}
          min={1}
          max={20}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchSfMap({ corotationRadius: v })}
          info="Generator units. Sets the pattern speed the shear is measured against — shear vanishes at corotation and reverses across it."
        />
        <ParamSlider
          label="Shear rate"
          value={sfMap.shearRate}
          min={0}
          max={0.5}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ shearRate: v })}
          info="Angular offset scale per step, in radians at unit (1/r - 1/corotationRadius). Total winding is shearRate * steps, so dropping steps to 100 cut the wind by 3x — expect to raise this to get the same pitch back."
        />
        {/* Lives on `fieldTuning` directly, not `sfMap`, since it gates a
            CONSUMER (the dust cloud) reading this tier's output rather than
            a parameter of the automaton itself — see GalaxyFieldTuning's
            own docblock. */}
        <label className={styles.toggleRow}>
          <span>Seed dust from gas</span>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={fieldTuning.sfMapDustSeeding}
            onChange={(e) => dispatch(fieldTuningPatched({ sfMapDustSeeding: e.target.checked }))}
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}

export default SfMapSection;
