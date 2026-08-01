/**
 * FieldSection — the FLUX FIELD group: the analytic field's exposure and its
 * base/warped-disc toggle (the header pill; arms live in `ArmFieldSection`).
 * Ring layout is frozen in `galaxyFieldMixture.ts` (`pushWarpedOuterDisc`) —
 * the outer disc's warp support, not a separately tunable part — so this
 * section owns exposure and the part toggle only, never ring shape.
 *
 * Values live in the `fieldTuning`/`render` slices; `engineBridge` forwards
 * every change to `engine.setFieldTuning` / the field pass, which rebuilds
 * the mixture from the geometry the last `setParams` cached — no
 * regenerate, no GPU compute dispatch, just a CPU-side rebuild picked up by
 * next frame's uniform pack.
 */
import type { ReactNode } from 'react';
import {
  GALAXY_FIELD_MAX_COMPONENTS,
  RING_BLOBS_PER_RING,
  WARP_RING_COUNT,
} from '../../../../../src/data/galaxy/galaxyFieldMixture';
import { GENERATION_UBO } from '../../../../../src/services/gpu/galaxy/generationUboLayout';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './FieldSection.module.css';

// Same table the generator itself clamps armCount into (`packGenerationUniforms`) —
// an estimate, not a read of the live geometry, since the store only holds the
// SLIDER value, not what the last generate() rounded it to.
const MAX_ARMS = GENERATION_UBO.arrays.armTable.countVec4 / 4;
const OTHER_COMPONENTS = 8; // 4 inner disc + 2 bulge + 1 bar + 1 halo, unconditional
const WARPED_DISC_BLOBS = WARP_RING_COUNT * RING_BLOBS_PER_RING;

function FieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector((state) => state.fieldTuning);
  const galaxy = useAppSelector((state) => state.galaxy);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.field);
  const smoothFieldBlobs = tuning.discEnabled ? OTHER_COMPONENTS + WARPED_DISC_BLOBS : 0;
  const numArms = Math.min(Math.max(1, Math.round(galaxy.armCount ?? 2)), MAX_ARMS);
  const armBlobs = tuning.armsEnabled ? numArms * tuning.armBlobsPerArm : 0;
  const totalComponents = smoothFieldBlobs + armBlobs;
  const overflow = totalComponents > GALAXY_FIELD_MAX_COMPONENTS;

  return (
    <CollapsibleSection
      title="FLUX FIELD"
      open={open}
      onToggle={() => dispatch(sectionToggled('field'))}
      headerToggle={tuning.discEnabled}
      onHeaderToggleChange={(value) => dispatch(fieldTuningPatched({ discEnabled: value }))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Analytic exposure"
          value={render.analyticExposure}
          min={0}
          max={3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(renderPatched({ analyticExposure: v }))}
          info="Whole-field multiplier on the integrated mixture. 1.0 is parity: the mixture is calibrated to emit the same total light as the sprite population it stands in for, at whatever the sprite exposure and size sliders are set to."
        />
        <p className={overflow ? styles.readoutOverflow : styles.readout}>
          smooth field {smoothFieldBlobs} (base {OTHER_COMPONENTS} + warped outer disc{' '}
          {WARPED_DISC_BLOBS}) + arm blobs {armBlobs} = {totalComponents} components, each
          evaluated per pixel
          {overflow &&
            ` — OVER the ${GALAXY_FIELD_MAX_COMPONENTS} cap, packFieldUniforms is silently dropping the rest`}
        </p>
      </div>
    </CollapsibleSection>
  );
}

export default FieldSection;
