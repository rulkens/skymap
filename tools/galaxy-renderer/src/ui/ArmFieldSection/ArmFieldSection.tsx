/**
 * ArmFieldSection — the analytic field's own arm ridge: Gaussian blobs
 * placed along the SAME log-spiral curve `armStarSample` draws sprite stars
 * around (`pushArmRidges` in `src/services/engine/galaxyGenerator/v2/galaxyFieldMixture.ts`), so
 * the two renderings' arms land on top of each other. On/off lives in the
 * header, same master-toggle idiom as the FLUX FIELD group above it.
 */
import type { ReactNode } from 'react';
import type { GalaxyArmTuning } from '../../../../../src/@types/galaxy/GalaxyArmTuning';
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
  const arms = fieldTuning.arms;

  const patchArms = (patch: Partial<GalaxyArmTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="ARM OVERDENSITIES"
      open={open}
      onToggle={() => dispatch(sectionToggled('armField'))}
      headerToggle={arms.enabled}
      onHeaderToggleChange={(value) => patchArms({ enabled: value })}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Width × measured law"
          value={arms.widthScale}
          min={0.5}
          max={2.5}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchArms({ widthScale: v })}
          info="1.0 is Reid et al. 2019's maser-arm width law (336 pc at the solar circle, widening 36 pc/kpc). Old stellar arms are plausibly broader, so >1 is physical, not a fudge."
        />
        <ParamSlider
          label="Arm contrast K"
          value={arms.contrast}
          min={1.05}
          max={2.2}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchArms({ contrast: v })}
          info="Arm/interarm surface-brightness ratio in old stellar light. The Milky Way measures ~1.3 (Drimmel & Spergel 2001, GLIMPSE); strong grand designs reach ~2 (Rix & Zaritsky 1995). Per-arm age scales it: old arms carry the full contrast, young arms fade toward 1."
        />
        <ParamSlider
          label="Light scale × disc"
          value={arms.excessScaleRatio}
          min={1}
          max={4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => patchArms({ excessScaleRatio: v })}
          info="How fast the arms' light falls off, as a multiple of the disc's own exponential scale length. This is BRIGHTNESS only — it cannot move where an arm ends; the 'Arm edge falloff' generation knob does that. 1 holds contrast K flat with radius; above 1 the arms outrun the disc and K grows outward, which is the observed direction — arm light is gas and young stars, whose discs are the more extended ones. Governs the ridge chain and the sprite cloud together."
        />
        <ParamSlider
          label="Blob sharpness"
          value={arms.blobSharpness}
          min={1}
          max={12}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchArms({ blobSharpness: v })}
          info="Debug only: shrinks every blob's three sigmas together at constant flux, so the ridge breaks into countable blobs whose tilt shows the surface frame they were placed on. 1 is the real field."
        />
      </div>
    </CollapsibleSection>
  );
}

export default ArmFieldSection;
