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
          max={600}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ steps: Math.round(v) })}
          info="Automaton iterations per rebuild. Structure coarsens with more steps; the shear winds it."
        />
        <ParamSlider
          label="Base ignition"
          value={sfMap.baseIgnition}
          min={0}
          max={0.02}
          step={0.0005}
          format={(v) => v.toFixed(4)}
          onChange={(v) => patchSfMap({ baseIgnition: v })}
          info="Spontaneous ignition probability per cell per step, independent of neighbours — the seed that keeps a quiet disc from dying out."
        />
        <ParamSlider
          label="Spread"
          value={sfMap.spread}
          min={0}
          max={0.6}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ spread: v })}
          info="Added ignition probability per already-ignited neighbour. Percolation knob: below threshold the structure dies, far above it the disc saturates — the useful band is narrow."
        />
        <ParamSlider
          label="Refractory steps"
          value={sfMap.refractorySteps}
          min={1}
          max={40}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ refractorySteps: Math.round(v) })}
          info="Steps a cell stays spent before its gas can ignite again. Sets the width of the trailing wake behind a propagating front."
        />
        <ParamSlider
          label="Gas regen"
          value={sfMap.gasRegen}
          min={0}
          max={0.3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSfMap({ gasRegen: v })}
          info="Gas recovered per step as a fraction of full — the star/gas feedback the original stars-only model lacked."
        />
        <ParamSlider
          label="Arm forcing"
          value={sfMap.armForcing}
          min={0}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSfMap({ armForcing: v })}
          info="How much the spiral ridge raises local ignition probability. 0 makes the automaton blind to the arms and the output goes purely flocculent."
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
          max={0.3}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ shearRate: v })}
          info="Angular offset scale per step, in radians at unit (1/r - 1/corotationRadius)."
        />
      </div>
    </CollapsibleSection>
  );
}

export default SfMapSection;
