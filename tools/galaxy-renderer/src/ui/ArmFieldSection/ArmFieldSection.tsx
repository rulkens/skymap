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
          label="Arm reach"
          value={fieldTuning.armExcessScaleRatio}
          min={1}
          max={4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => dispatch(fieldTuningPatched({ armExcessScaleRatio: v }))}
          info="The arms' own exponential scale length, in units of the disc's. 1 holds contrast K flat with radius, so the arms fade exactly as fast as the disc and stop before it does. Above 1 the arms outrun the disc and K grows outward, which is the observed direction — arm light is gas and young stars, whose discs are the more extended ones. Governs the ridge chain and the sprite cloud together."
        />
        <ParamSlider
          label="Taper start"
          value={fieldTuning.armTaperStartFrac}
          min={0.1}
          max={1.2}
          step={0.05}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => dispatch(fieldTuningPatched({ armTaperStartFrac: v }))}
          info="Where each arm's outer taper begins, as a multiple of that arm's own fade radius. Below ~0.6 the taper starts falling faster than the brightness law it multiplies and becomes a second radial dimming no other knob can reach past."
        />
        <ParamSlider
          label="Taper end"
          value={fieldTuning.armTaperEndFrac}
          min={0.5}
          max={2}
          step={0.05}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={(v) => dispatch(fieldTuningPatched({ armTaperEndFrac: v }))}
          info="Where each arm ends, as a multiple of the fade radius the 'Arm edge falloff' generation knob sizes. Blobs, sprites and SF events are all placed out to here, so above 1 the arms genuinely trail further — but the SF map's grid stops at the fade radius, so the trail carries no map-seeded dust."
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
