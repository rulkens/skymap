/**
 * HiiSection — the analytic field's HII-region tier (`src/services/engine/galaxyGenerator/v2/hiiRegions.ts`):
 * discrete emission sprites with a limb-brightened shell, an embedded OB
 * cluster core, and a dust cavity they carve into the analytic dust lane.
 * Own section, own header pill (`fieldTuning.hiiEnabled`), same idiom as
 * `ArmCloudSection`/`DustCloudSection` — a sub-tier with its own knobs, not
 * a settings drawer folded into FLUX FIELD.
 */
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './HiiSection.module.css';

function HiiSection(): ReactNode {
  const dispatch = useAppDispatch();
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const open = useAppSelector((state) => state.ui.openSections.hii);

  return (
    <CollapsibleSection
      title="HII REGIONS"
      open={open}
      onToggle={() => dispatch(sectionToggled('hii'))}
      headerToggle={fieldTuning.hiiEnabled}
      onHeaderToggleChange={(value) => dispatch(fieldTuningPatched({ hiiEnabled: value }))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Brightness"
          value={fieldTuning.hiiBrightness}
          min={0}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ hiiBrightness: v }))}
          info="Whole-tier flux multiplier. Unlike the arm cloud's share knob this ADDS light on top of the disc mixture — F98 masked young features out of its fit, so HII emission was never inside it. 1 is the calibrated default."
        />
        <ParamSlider
          label="Radius scale"
          value={fieldTuning.hiiRadiusScale}
          min={0.2}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ hiiRadiusScale: v }))}
          info="Multiplies the Strömgren radius law. 1 is that law exactly."
        />
        <ParamSlider
          label="Shell thickness"
          value={fieldTuning.hiiShellThickness}
          min={0.02}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ hiiShellThickness: v }))}
          info="Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front."
        />
        <ParamSlider
          label="Cluster strength"
          value={fieldTuning.hiiClusterStrength}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ hiiClusterStrength: v }))}
          info="Brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell."
        />
        <ParamSlider
          label="Cavity scale"
          value={fieldTuning.hiiCavityScale}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ hiiCavityScale: v }))}
          info="Radius of the dust cavity a young event carves, as a fraction of its own HII radius. 0 leaves the dust undisturbed."
        />
      </div>
    </CollapsibleSection>
  );
}

export default HiiSection;
