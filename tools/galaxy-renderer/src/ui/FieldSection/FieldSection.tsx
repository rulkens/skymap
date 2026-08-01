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
import { GALAXY_FIELD_MAX_COMPONENTS } from '../../../../../src/data/galaxy/galaxyFieldMixture';
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
  const ringBlobs = Math.max(1, Math.round(tuning.ringCount)) * tuning.ringBlobsPerRing;
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
          info="Two rings can only bracket the warp with two straight segments. More rings, each still a valid linearisation about its own centre, follow the real bend more closely. Cost is rings x blobs, every one evaluated per pixel — 12 x 48 is deliberately past the point where it stays interactive."
        />
        <ParamSlider
          label="Inner ring radius"
          value={tuning.ringInnerRadiusFrac}
          min={0.55}
          max={0.95}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringInnerRadiusFrac: v }))}
        />
        <ParamSlider
          label="Outer ring radius"
          value={tuning.ringOuterRadiusFrac}
          min={0.8}
          max={1.3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringOuterRadiusFrac: v }))}
        />
        <ParamSlider
          label="Blobs per ring"
          value={tuning.ringBlobsPerRing}
          min={6}
          max={48}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringBlobsPerRing: v }))}
          info="Each blob stands in for an arc of the ring; too few and the ring reads as a pointed star instead of smooth."
        />
        <ParamSlider
          label="Radial sigma"
          value={tuning.ringRadialSigmaFrac}
          min={0.04}
          max={0.35}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringRadialSigmaFrac: v }))}
        />
        <ParamSlider
          label="Azimuthal overlap"
          value={tuning.ringAzimuthalOverlap}
          min={0.3}
          max={1.2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringAzimuthalOverlap: v }))}
          info="How much a blob's azimuthal Gaussian overlaps its neighbours' — too low beads the ring, too high smears it into a solid annulus."
        />
        <ParamSlider
          label="Flux falloff"
          value={tuning.ringFluxFalloff}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => dispatch(fieldTuningPatched({ ringFluxFalloff: v }))}
          info="Each ring's flux as a fraction of the previous (inner) ring's — 1.0 splits flux evenly across every ring, lower makes the inner rings dominate."
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
          {tuning.ringBlobsPerRing}) + {armBlobs} arm blobs ({numArms} x {tuning.armBlobsPerArm}) +{' '}
          {OTHER_COMPONENTS} other = {totalComponents} components, each evaluated per pixel
          {overflow &&
            ` — OVER the ${GALAXY_FIELD_MAX_COMPONENTS} cap, packFieldUniforms is silently dropping the rest`}
        </p>
      </div>
    </CollapsibleSection>
  );
}

export default FieldSection;
