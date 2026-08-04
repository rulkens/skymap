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
 *
 * Arm blob count is no longer a slider value the readout can echo — it's
 * derived per arm from ridge curvature and budget-clamped against
 * `GALAXY_FIELD_MAX_COMPONENTS` (`deriveArmBlobCount` in
 * `galaxyFieldMixture.ts`), so cap overflow is structurally impossible and
 * this readout states only the static, still-honest smooth-field part.
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
  const tuning = useAppSelector((state) => state.fieldTuning);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.field);
  const smoothFieldBlobs = tuning.disc.enabled ? OTHER_COMPONENTS + WARPED_DISC_BLOBS : 0;

  return (
    <CollapsibleSection
      title="FLUX FIELD"
      open={open}
      onToggle={() => dispatch(sectionToggled('field'))}
      headerToggle={tuning.disc.enabled}
      onHeaderToggleChange={(value) =>
        dispatch(fieldTuningPatched({ disc: { ...tuning.disc, enabled: value } }))
      }
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
