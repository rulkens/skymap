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
          label="Width × measured law"
          value={fieldTuning.armWidthScale}
          min={0.5}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armWidthScale: v }))}
          info="1.0 is Reid et al. 2019's maser-arm width law (336 pc at the solar circle, widening 36 pc/kpc). Old stellar arms are plausibly broader, so >1 is physical, not a fudge."
        />
        <ParamSlider
          label="Arm contrast K"
          value={fieldTuning.armContrast}
          min={1.05}
          max={2.2}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armContrast: v }))}
          info="Arm/interarm surface-brightness ratio in old stellar light. The Milky Way measures ~1.3 (Drimmel & Spergel 2001, GLIMPSE); strong grand designs reach ~2 (Rix & Zaritsky 1995). Per-arm age scales it: old arms carry the full contrast, young arms fade toward 1."
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
        <ParamSlider
          label="Cloud share"
          value={fieldTuning.armCloudShare}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudShare: v }))}
          info="Fraction of the arm excess carried by stochastic sprites instead of the deterministic ridge chain. The two totals always sum to the same excess; 0 is today's ridge-only look."
        />
        <ParamSlider
          label="Cloud count"
          value={fieldTuning.armCloudCount}
          min={0}
          max={400}
          step={10}
          format={(v) => String(Math.round(v))}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudCount: Math.round(v) }))}
          info="Arm sprite budget. Raising it borrows component slots from the ridge chain's own budget, not from GALAXY_FIELD_MAX_COMPONENTS directly."
        />
        <ParamSlider
          label="Cloud clumpiness"
          value={fieldTuning.armCloudClumpiness}
          min={0}
          max={1}
          step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudClumpiness: v }))}
          info="Hierarchical clustering amplitude — 0 = Poisson-scattered along the ridge, 1 = strongly hierarchical complexes."
        />
        <ParamSlider
          label="Cloud size scale"
          value={fieldTuning.armCloudSizeScale}
          min={0.2}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudSizeScale: v }))}
          info="Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — so this scales with the arm's own flare rather than an absolute parsec span."
        />
        <ParamSlider
          label="Cloud elongation"
          value={fieldTuning.armCloudElongation}
          min={1}
          max={8}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(fieldTuningPatched({ armCloudElongation: v }))}
          info="sigma_along / sigma_across — how stretched each sprite is along the arm's own flow."
        />
      </div>
    </CollapsibleSection>
  );
}

export default ArmFieldSection;
