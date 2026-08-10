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

type FieldSliderKey = 'analyticExposure';

type FieldSliderSpec = {
  readonly key: FieldSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

// Single-entry table for consistency with every other section — the whole
// panel reads sliders off `<Section>_SLIDERS`, not a mix of tables and hand-rolled JSX.
const FIELD_SLIDERS: readonly FieldSliderSpec[] = [
  {
    key: 'analyticExposure',
    label: 'Analytic exposure',
    min: 0,
    max: 3,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: "Whole-field multiplier on the integrated mixture, independent of the star pass's own exposure and size sliders. 1.0 is the calibration point tuned by eye against the reference gallery, not a parity point with the sprite field.",
  },
];

function FieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const disc = useAppSelector((state) => state.fieldTuning.disc);
  const render = useAppSelector((state) => state.render);
  const open = useAppSelector((state) => state.ui.openSections.field);
  const smoothFieldBlobs = disc.enabled ? OTHER_COMPONENTS + WARPED_DISC_BLOBS : 0;

  const renderFieldSlider = (spec: FieldSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={render[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => dispatch(renderPatched({ [spec.key]: v }))}
      path={`render.${spec.key}`}
      info={spec.info}
    />
  );

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
        {FIELD_SLIDERS.map(renderFieldSlider)}
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
