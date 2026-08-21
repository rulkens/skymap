/**
 * DustSection — the dust disc's own knobs (`GalaxyFieldTuning.dust`):
 * face-on optical depth, the CCM89 extinction law's R_V, and the
 * scale-length and thickness ratios to the stellar disc, plus the tier's own
 * master toggle. Nested under `fieldTuning.dust` rather than a flat field, so
 * it can't ride the generic `renderGalaxySlider` path (see `GalaxySliderKey`'s
 * exclusion in `ControlsPanel.tsx`) — each slider spreads the current dust
 * object by hand instead. Same fold/pill idiom as `ArmFieldSection`:
 * `ui.openSections.analyticDust` for the fold, `dust.enabled` for the header
 * pill.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustParams } from '../../../../../src/@types/galaxy/GalaxyDustParams';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import styles from './DustSection.module.css';

// `cloud` is DUST CLOUD's own section and copies from there — excluded from
// the slider key type as well as `smoothDust` below.
type DustSliderKey = Exclude<keyof GalaxyDustParams, 'cloud' | 'enabled'>;

type DustSliderSpec = {
  readonly key: DustSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

const DUST_SLIDERS: readonly DustSliderSpec[] = [
  {
    key: 'tau',
    label: 'Face-on optical depth',
    min: 0,
    max: 8,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Central face-on tau_V; measured 0.5-1 for spirals (Xilouris et al. 1999, De Geyter et al. 2014). The range above that is deliberate exploration headroom, not a measured span.',
  },
  {
    key: 'rV',
    label: 'Extinction R_V',
    min: 1.5,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: 'Total-to-selective extinction A_V/E(B-V); sets how much bluer light dims relative to red. Milky Way diffuse ISM 3.1 (greyer above, more reddening below).',
  },
  {
    key: 'redness',
    label: 'Redness',
    min: 0,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Physical at 1; stretches blue-vs-red extinction contrast about green without changing overall dimming.',
  },
  {
    key: 'scaleLenRatio',
    label: 'Scale length × disc',
    min: 0.8,
    max: 2.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Dust/stellar radial scale-length ratio — the dust disc is more extended than the light it reddens. Measured 1.4-1.75 (Xilouris et al. 1999). With ISM-map seeding on, this sets the total column and how far the dust slices reach, not where the clouds land.',
  },
  {
    key: 'heightRatio',
    label: 'Layer thickness × disc',
    min: 0.15,
    max: 1.0,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Dust/stellar vertical sigma ratio — the dust layer is thinner than the stellar disc it sits in. Measured 0.25-0.75 across spirals; the Milky Way's own is ~0.35.",
  },
];

function DustSection(): ReactNode {
  const dispatch = useAppDispatch();
  const dust = useAppSelector((state) => state.fieldTuning.dust);
  const open = useAppSelector((state) => state.ui.openSections.analyticDust);

  const patchDust = (patch: Partial<GalaxyDustParams>): void => {
    dispatch(fieldTuningPatched({ dust: { ...dust, ...patch } }));
  };

  // `cloud` is DUST CLOUD's own section and copies from there.
  const { cloud: _cloud, ...smoothDust } = dust;

  const renderDustSlider = (spec: DustSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={dust[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => patchDust({ [spec.key]: v })}
      path={`fieldTuning.dust.${spec.key}`}
      info={spec.info}
    />
  );

  return (
    <CollapsibleSection
      title="DUST"
      open={open}
      onToggle={() => dispatch(sectionToggled('analyticDust'))}
      headerToggle={dust.enabled}
      onHeaderToggleChange={(value) => patchDust({ enabled: value })}
      copyPayload={{ fieldTuning: { dust: smoothDust } }}
    >
      <div className={styles.root}>{DUST_SLIDERS.map(renderDustSlider)}</div>
    </CollapsibleSection>
  );
}

export default DustSection;
