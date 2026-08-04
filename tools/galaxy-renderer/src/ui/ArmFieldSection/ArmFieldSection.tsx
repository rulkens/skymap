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
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armField);

  const patchArms = (patch: Partial<GalaxyArmTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, ...patch } }));
  };

  // `cloud` is ARM CLOUD's own section and copies from there — this one offers
  // only the ridge knobs its own sliders drive.
  const { cloud: _cloud, ...ridge } = arms;

  return (
    <CollapsibleSection
      title="ARM OVERDENSITIES"
      open={open}
      onToggle={() => dispatch(sectionToggled('armField'))}
      headerToggle={arms.enabled}
      onHeaderToggleChange={(value) => patchArms({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: ridge } }}
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
          info="1.0 is the Milky Way's measured maser-arm width. Higher = wider arms, more overlap; old stellar arms are plausibly broader, so above 1 is physical."
        />
        <ParamSlider
          label="Arm contrast K"
          value={arms.contrast}
          min={1.05}
          max={4}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchArms({ contrast: v })}
          info="Arm/interarm surface-brightness ratio in old stellar light: the Milky Way measures ~1.3, strong grand designs ~2. Each arm's age scales it — old arms carry the full contrast, young ones fade toward 1. The light comes out of the disc, so raising it never brightens the galaxy."
        />
        <ParamSlider
          label="Light scale × disc"
          value={arms.excessScaleRatio}
          min={1}
          max={4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => patchArms({ excessScaleRatio: v })}
          info="How fast the arms' light falls off, as a multiple of the disc's own scale length. BRIGHTNESS only — it cannot move where an arm ends; the 'Arm edge falloff' generation knob does that. 1 holds contrast K flat with radius; above 1 the arms outrun the disc and the outer arm brightens. Governs the ridge chain and the sprite cloud together."
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
