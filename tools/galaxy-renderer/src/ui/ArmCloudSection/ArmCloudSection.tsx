/**
 * ArmCloudSection — the arm ridge's stochastic sprite twin
 * (`src/services/engine/galaxyGenerator/v2/armParticleCloud.ts`): thousands of small Gaussian
 * sprites scattered along the same log-spiral ridge `ArmFieldSection`'s
 * deterministic blobs sit on. Its own section, own header pill
 * (`fieldTuning.arms.cloud.enabled`), same idiom as `DustCloudSection` — the
 * cloud is a sub-tier of the arm excess, not a settings drawer folded into
 * the ridge's own section.
 */
import type { ReactNode } from 'react';
import type { GalaxyArmCloudTuning } from '../../../../../src/@types/galaxy/GalaxyArmCloudTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import styles from './ArmCloudSection.module.css';

type ArmCloudSliderKey = Exclude<keyof GalaxyArmCloudTuning, 'enabled'>;

type ArmCloudSliderSpec = {
  readonly key: ArmCloudSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

const ARM_CLOUD_SLIDERS: readonly ArmCloudSliderSpec[] = [
  {
    key: 'share',
    label: 'Cloud share',
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: 'Fraction of the arm excess carried by stochastic sprites instead of the deterministic ridge chain. The two totals always sum to the same excess.',
  },
  {
    key: 'coverage',
    label: 'Coverage',
    min: 0.2,
    max: 12,
    step: 0.1,
    format: (v) => v.toFixed(2),
    info: 'Sprite count is DERIVED from arm length, width and pitch, not a fixed budget — this scales that derived count. 1 is one sprite-footprint per unit arm area. Clumpiness piles the sprites into complexes, so with it above 0 the setting that actually FILLS an arm is several times higher.',
  },
  {
    key: 'radialBias',
    label: 'Radial bias',
    min: 0,
    max: 3,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: "Pushes sprites outward along the arm — 0 spends them by coverage demand, which crowds the inner arm where they are small and lost under the bulge. Brightness-neutral: the extra outer sprites split the same light and stay dim. At the top of the slider that neutrality frays and the tier's light creeps back inward.",
  },
  {
    key: 'clumpiness',
    label: 'Clumpiness',
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: 'Hierarchical clustering amplitude — 0 = Poisson-scattered along the ridge, 1 = strongly hierarchical complexes.',
  },
  {
    key: 'sizeScale',
    label: 'Size scale',
    min: 0.2,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — so this scales with the arm's own flare rather than an absolute parsec span.",
  },
  {
    key: 'elongation',
    label: 'Elongation',
    min: 1,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: "sigma_along / sigma_across — how stretched each sprite is along the arm's own flow.",
  },
];

function ArmCloudSection(): ReactNode {
  const dispatch = useAppDispatch();
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armCloud);
  const cloud = arms.cloud;

  const patchCloud = (patch: Partial<GalaxyArmCloudTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, cloud: { ...cloud, ...patch } } }));
  };

  const renderArmCloudSlider = (spec: ArmCloudSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={cloud[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => patchCloud({ [spec.key]: v })}
      path={`fieldTuning.arms.cloud.${spec.key}`}
      info={spec.info}
    />
  );

  return (
    <CollapsibleSection
      title="ARM CLOUD"
      open={open}
      onToggle={() => dispatch(sectionToggled('armCloud'))}
      headerToggle={cloud.enabled}
      onHeaderToggleChange={(value) => patchCloud({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: { cloud } } }}
    >
      <div className={styles.root}>{ARM_CLOUD_SLIDERS.map(renderArmCloudSlider)}</div>
    </CollapsibleSection>
  );
}

export default ArmCloudSection;
