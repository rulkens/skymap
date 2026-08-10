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
import ArmCloudSection from '../ArmCloudSection/ArmCloudSection';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import SpursSection from '../SpursSection/SpursSection';
import styles from './ArmFieldSection.module.css';

// `cloud`/`spurs` are the nested ARM CLOUD / SPURS sections' own bags and
// copy from there — excluded from the slider key type as well as `ridge` below.
type ArmFieldSliderKey = Exclude<keyof GalaxyArmTuning, 'cloud' | 'spurs' | 'enabled'>;

type ArmFieldSliderSpec = {
  readonly key: ArmFieldSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

const ARM_FIELD_SLIDERS: readonly ArmFieldSliderSpec[] = [
  {
    key: 'widthScale',
    label: 'Width × measured law',
    min: 0.5,
    max: 2.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "1.0 is the Milky Way's measured maser-arm width. Higher = wider arms, more overlap; old stellar arms are plausibly broader, so above 1 is physical.",
  },
  {
    key: 'contrast',
    label: 'Arm contrast K',
    min: 1.05,
    max: 4,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: "Arm/interarm surface-brightness ratio in old stellar light: the Milky Way measures ~1.3, strong grand designs ~2. Each arm's age scales it — old arms carry the full contrast, young ones fade toward 1. The light comes out of the disc, so raising it never brightens the galaxy.",
  },
  {
    key: 'excessScaleRatio',
    label: 'Light scale × disc',
    min: 1,
    max: 4,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}x`,
    info: "How fast the arms' light falls off, as a multiple of the disc's own scale length. BRIGHTNESS only — it cannot move where an arm ends; the 'Arm edge falloff' generation knob does that. 1 holds contrast K flat with radius; above 1 the arms outrun the disc and the outer arm brightens. Governs the ridge chain and the sprite cloud together.",
  },
  {
    key: 'blobSharpness',
    label: 'Blob sharpness',
    min: 1,
    max: 12,
    step: 0.5,
    format: (v) => v.toFixed(1),
    info: "Debug only: shrinks every blob's three sigmas together at constant flux, so the ridge breaks into countable blobs whose tilt shows the surface frame they were placed on. 1 is the real field.",
  },
];

function ArmFieldSection(): ReactNode {
  const dispatch = useAppDispatch();
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armField);

  const patchArms = (patch: Partial<GalaxyArmTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, ...patch } }));
  };

  // `cloud`/`spurs` are the nested ARM CLOUD / SPURS sections' own bags and
  // copy from there — this one offers only the ridge knobs its own sliders
  // drive.
  const { cloud: _cloud, spurs: _spurs, ...ridge } = arms;

  const renderArmFieldSlider = (spec: ArmFieldSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={arms[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => patchArms({ [spec.key]: v })}
      path={`fieldTuning.arms.${spec.key}`}
      info={spec.info}
    />
  );

  return (
    <CollapsibleSection
      title="ARM OVERDENSITIES"
      open={open}
      onToggle={() => dispatch(sectionToggled('armField'))}
      headerToggle={arms.enabled}
      onHeaderToggleChange={(value) => patchArms({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: ridge } }}
    >
      <div className={styles.root}>{ARM_FIELD_SLIDERS.map(renderArmFieldSlider)}</div>
      <ArmCloudSection />
      <SpursSection />
    </CollapsibleSection>
  );
}

export default ArmFieldSection;
