/**
 * FieldSection — the FLUX FIELD group: the analytic field's exposure and its
 * base/warped-disc toggle (the header pill; arms live in `ArmFieldSection`).
 * Ring layout is frozen in `galaxyFieldMixture.ts` (`pushWarpedOuterDisc`),
 * not a separately tunable part, so this section owns exposure and the part
 * toggle only, never ring shape.
 *
 * `engineBridge` forwards changes to `engine.setFieldTuning`, a CPU-side
 * rebuild from the geometry the last `setParams` cached — no GPU dispatch.
 * Arm blob count is derived per arm and budget-clamped
 * (`deriveArmBlobCount`), so this readout states only the static part.
 */
import type { ReactNode } from 'react';
import {
  RING_BLOBS_PER_RING,
  WARP_RING_COUNT,
} from '../../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './FieldSection.module.css';

const OTHER_COMPONENTS = 8; // 4 inner disc + 2 bulge + 1 bar + 1 halo, unconditional
const WARPED_DISC_BLOBS = WARP_RING_COUNT * RING_BLOBS_PER_RING;

function FieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const disc = useAppSelector((state) => state.fieldTuning.disc);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.field);
  const smoothFieldBlobs = disc.enabled ? OTHER_COMPONENTS + WARPED_DISC_BLOBS : 0;

  return (
    <CollapsibleSection
      title="FLUX FIELD"
      open={open}
      onToggle={() => dispatch(sectionToggled('field'))}
      headerToggle={disc.enabled}
      onHeaderToggleChange={(value) =>
        dispatch(fieldTuningPatched({ disc: { ...disc, enabled: value } }))
      }
      copyPayload={{ fieldTuning: { disc }, render: { analyticExposure: render.analyticExposure } }}
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
          path="render.analyticExposure"
          info="Whole-field multiplier on the integrated mixture, independent of the star pass's own exposure and size sliders. 1.0 is the calibration point tuned by eye against the reference gallery, not a parity point with the sprite field."
        />
        <p className={styles.readout}>
          smooth field {smoothFieldBlobs} (base {OTHER_COMPONENTS} + warped outer disc{' '}
          {WARPED_DISC_BLOBS}) + arms (blob count derived from pitch/width, budget-capped), each
          evaluated per pixel
        </p>
      </div>
    </CollapsibleSection>
  );
}

export default FieldSection;
