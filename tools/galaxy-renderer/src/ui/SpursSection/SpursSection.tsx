/**
 * SpursSection — interarm spurs/feathers
 * (`src/services/engine/galaxyGenerator/v2/armSpurGeometry.ts` +
 * `armSpurParticleCloud.ts`): short sprite feathers rooted along each arm at
 * quasi-regular intervals, filling the interarm gap the ridge chain and the
 * arm cloud both leave empty at larger radii. Own section, own header pill
 * (`fieldTuning.arms.spurs.enabled`), the `ArmCloudSection` idiom — a sub-tier
 * of the arm excess, not a settings drawer folded into ARM CLOUD's own body.
 */
import type { ReactNode } from 'react';
import type { GalaxyArmSpurTuning } from '../../../../../src/@types/galaxy/GalaxyArmSpurTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import styles from './SpursSection.module.css';

type SpurSliderKey = Exclude<keyof GalaxyArmSpurTuning, 'enabled'>;

type SpurSliderSpec = {
  readonly key: SpurSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

const SPUR_SLIDERS: readonly SpurSliderSpec[] = [
  {
    key: 'share',
    label: 'Share',
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: "Fraction of the arm excess carried by spur sprites instead of the ridge chain. Clamped jointly with Cloud share so the two tiers never draw more than the ridge's total excess between them.",
  },
  {
    key: 'spacing',
    label: 'Spacing',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Multiplier on the root-to-root spacing law (La Vigne, Vogel & Ostriker 2006's 300-800 pc feather spacing, re-expressed in disc-scale-length units and growing with radius). 1 is that law exactly.",
  },
  {
    key: 'pitchRatio',
    label: 'Pitch ratio',
    min: 1,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "A spur's pitch is the parent arm's own pitch times this — feathers wind tighter than the arm they branch from (Kim & Ostriker 2002/2006's spiral-shock instability). 1 would trace the parent arm itself.",
  },
  {
    key: 'lengthFrac',
    label: 'Length frac',
    min: 0.1,
    max: 1.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "A spur's own fade radius, as a fraction of the local root spacing beyond its root. Short is a stub feather; toward the top it approaches bridging the whole interarm gap.",
  },
  {
    key: 'jitter',
    label: 'Jitter',
    min: 0,
    max: 0.6,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: 'Fractional jitter on the root-to-root spacing draw — 0 is a perfectly regular comb, the default ~0.3 is a quasi-regular one.',
  },
  {
    key: 'sizeScale',
    label: 'Size scale',
    min: 0.2,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Multiplier on each sprite's size draw, itself a fraction of the LOCAL arm width — mirrors Arm cloud's own Size scale.",
  },
  {
    key: 'elongation',
    label: 'Elongation',
    min: 1,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: 'sigma_along / sigma_across — how stretched each sprite is along its own spur.',
  },
  {
    key: 'gasWeight',
    label: 'Gas weight',
    min: 0,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: "How strongly a spur forces the ISM map's gas, against its parent arm's own forcing (0 = spurs don't feed the map, 1 = as strongly as the arm they branch from). Feeds dust, star-formation events and HII placement along the spurs, not just their sprites.",
  },
];

function SpursSection(): ReactNode {
  const dispatch = useAppDispatch();
  const arms = useAppSelector((state) => state.fieldTuning.arms);
  const open = useAppSelector((state) => state.ui.openSections.armSpurs);
  const spurs = arms.spurs;

  const patchSpurs = (patch: Partial<GalaxyArmSpurTuning>): void => {
    dispatch(fieldTuningPatched({ arms: { ...arms, spurs: { ...spurs, ...patch } } }));
  };

  const renderSpurSlider = (spec: SpurSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={spurs[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => patchSpurs({ [spec.key]: v })}
      path={`fieldTuning.arms.spurs.${spec.key}`}
      info={spec.info}
    />
  );

  return (
    <CollapsibleSection
      title="SPURS"
      open={open}
      onToggle={() => dispatch(sectionToggled('armSpurs'))}
      headerToggle={spurs.enabled}
      onHeaderToggleChange={(value) => patchSpurs({ enabled: value })}
      copyPayload={{ fieldTuning: { arms: { spurs } } }}
    >
      <div className={styles.root}>{SPUR_SLIDERS.map(renderSpurSlider)}</div>
    </CollapsibleSection>
  );
}

export default SpursSection;
