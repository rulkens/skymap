/**
 * FieldSection — live sliders for the analytic field's warped outer disc
 * rings (`pushDiscRings` in `src/data/galaxy/galaxyFieldMixture.ts`), so a
 * ring's shape can be eyeballed without editing constants and refreshing.
 *
 * Values live in the `fieldTuning` slice; `engineBridge` forwards every
 * change to `engine.setFieldTuning`, which rebuilds the mixture from the
 * geometry the last `setParams` cached — no regenerate, no GPU compute
 * dispatch, just a CPU-side rebuild picked up by next frame's uniform pack.
 */
import type { ReactNode } from 'react';
import {
  GALAXY_FIELD_MAX_COMPONENTS,
  RING_BLOBS_PER_RING,
} from '../../../../../src/data/galaxy/galaxyFieldMixture';
import { GENERATION_UBO } from '../../../../../src/services/gpu/galaxy/generationUboLayout';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './FieldSection.module.css';

// Same table the generator itself clamps armCount into (`packGenerationUniforms`) —
// an estimate, not a read of the live geometry, since the store only holds the
// SLIDER value, not what the last generate() rounded it to.
const MAX_ARMS = GENERATION_UBO.arrays.armTable.countVec4 / 4;
const OTHER_COMPONENTS = 8; // 4 inner disc + 2 bulge + 1 bar + 1 halo, unconditional

function FieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const tuning = useAppSelector((state) => state.fieldTuning);
  const galaxy = useAppSelector((state) => state.galaxy);
  const open = useAppSelector((state) => state.ui.openSections.ringTuning);
  const ringBlobs = Math.max(1, Math.round(tuning.ringCount)) * RING_BLOBS_PER_RING;
  const numArms = Math.min(Math.max(1, Math.round(galaxy.armCount ?? 2)), MAX_ARMS);
  const armBlobs = tuning.armsEnabled ? numArms * tuning.armBlobsPerArm : 0;
  const totalComponents = ringBlobs + armBlobs + OTHER_COMPONENTS;
  const overflow = totalComponents > GALAXY_FIELD_MAX_COMPONENTS;

  return (
    <CollapsibleSection
      title="OUTER DISC RINGS (LIVE)"
      open={open}
      onToggle={() => dispatch(sectionToggled('ringTuning'))}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Ring count"
          value={tuning.ringCount}
          min={1}
          max={12}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringCount: v }))}
          info="Two rings can only bracket the warp with two straight segments. More rings, each still a valid linearisation about its own centre, follow the real bend more closely. Cost is rings x blobs, every one evaluated per pixel."
        />
        <ParamSlider
          label="Blob sharpness"
          value={tuning.ringBlobSharpness}
          min={1}
          max={12}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringBlobSharpness: v }))}
          info="Debug only: shrinks every blob's three sigmas together at constant flux, so the ring breaks into countable blobs whose tilt shows the surface frame they were placed on. 1 is the real field."
        />
        <p className={overflow ? styles.readoutOverflow : styles.readout}>
          {ringBlobs} ring blobs ({Math.max(1, Math.round(tuning.ringCount))} x{' '}
          {RING_BLOBS_PER_RING}) + {armBlobs} arm blobs ({numArms} x {tuning.armBlobsPerArm}) +{' '}
          {OTHER_COMPONENTS} other = {totalComponents} components, each evaluated per pixel
          {overflow &&
            ` — OVER the ${GALAXY_FIELD_MAX_COMPONENTS} cap, packFieldUniforms is silently dropping the rest`}
        </p>
      </div>
    </CollapsibleSection>
  );
}

export default FieldSection;
