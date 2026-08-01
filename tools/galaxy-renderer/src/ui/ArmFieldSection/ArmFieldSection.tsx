/**
 * ArmFieldSection — the analytic field's own arm ridge: Gaussian blobs
 * placed along the SAME log-spiral curve `armStarSample` draws sprite stars
 * around (`pushArmRidges` in `src/data/galaxy/galaxyFieldMixture.ts`), so
 * the two renderings' arms land on top of each other. On/off lives in the
 * header, same master-toggle idiom as the FLUX FIELD group above it.
 */
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './ArmFieldSection.module.css';

function ArmFieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const fieldTuning = useAppSelector((state) => state.fieldTuning);
  const open = useAppSelector((state) => state.ui.openSections.armField);

  return (
    <CollapsibleSection
      title="ARM OVERDENSITIES"
      open={open}
      onToggle={() => dispatch(sectionToggled('armField'))}
      headerToggle={fieldTuning.armsEnabled}
      onHeaderToggleChange={(value) => dispatch(fieldTuningPatched({ armsEnabled: value }))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Arm width"
          value={fieldTuning.armWidthScale}
          min={0.3}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armWidthScale: v }))}
        />
        <ParamSlider
          label="Flux boost"
          value={fieldTuning.armFluxBoost}
          min={0}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armFluxBoost: v }))}
          info="Whole-arm-population flux multiplier over the share readGalaxyFieldGeometry un-folded from the disc. 1.0 is parity with the sprite arms."
        />
        <ParamSlider
          label="Blob sharpness"
          value={fieldTuning.armBlobSharpness}
          min={1}
          max={12}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(fieldTuningPatched({ armBlobSharpness: v }))}
          info="Debug only: shrinks every blob's three sigmas together at constant flux, so the ridge breaks into countable blobs whose tilt shows the surface frame they were placed on. 1 is the real field."
        />
      </div>
    </CollapsibleSection>
  );
}

export default ArmFieldSection;
