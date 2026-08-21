/**
 * HiiSection — the analytic field's HII-region tier
 * (`src/services/engine/galaxyGenerator/v2/hiiRegions.ts`): discrete
 * emission sprites with a limb-brightened shell, an embedded OB cluster
 * core, and a dust cavity they carve into the analytic dust lane. Own
 * section, own header pill (`fieldTuning.hii.enabled`).
 *
 * SHELLS, DIG and YOUNG STARS nest inside it (`variant="nested"`) rather
 * than as top-level siblings — flattening every slider alongside the
 * tier-shared ones read as one endless list. Texture scale/contrast stay in
 * the outer body: they're shared by all three nested groups.
 *
 * A slider's `bag` isn't always the group it visually sits in — SHELLS mixes
 * in `starFormation.sfActivity` alongside its own fields — so each spec
 * carries its own bag rather than the group inheriting one, dispatched
 * through the `bag`-keyed tables below (table dispatch, not a branch per
 * slider).
 */
import type { ReactNode } from 'react';
import type { GalaxyHiiDigTuning } from '../../../../../src/@types/galaxy/GalaxyHiiDigTuning';
import type { GalaxyHiiShellsTuning } from '../../../../../src/@types/galaxy/GalaxyHiiShellsTuning';
import type { GalaxyHiiTuning } from '../../../../../src/@types/galaxy/GalaxyHiiTuning';
import type { GalaxyStarFormationParams } from '../../../../../src/@types/galaxy/GalaxyStarFormationParams';
import type { GalaxyYoungStarsTuning } from '../../../../../src/@types/galaxy/GalaxyYoungStarsTuning';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import styles from './HiiSection.module.css';

type SliderFields = {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
};

type HiiSliderSpec =
  | (SliderFields & { readonly bag: 'hii'; readonly key: 'brightness' })
  | (SliderFields & {
      readonly bag: 'shells';
      readonly key: keyof Omit<GalaxyHiiShellsTuning, 'enabled'>;
    })
  | (SliderFields & { readonly bag: 'dig'; readonly key: keyof GalaxyHiiDigTuning })
  | (SliderFields & {
      readonly bag: 'youngStars';
      readonly key: keyof Omit<GalaxyYoungStarsTuning, 'enabled'>;
    })
  | (SliderFields & {
      readonly bag: 'starFormation';
      readonly key: keyof GalaxyStarFormationParams;
    });

const HII_BAG_PATH_PREFIX: Record<HiiSliderSpec['bag'], string> = {
  hii: 'fieldTuning.hii',
  shells: 'fieldTuning.hii.shells',
  dig: 'fieldTuning.hii.dig',
  youngStars: 'fieldTuning.hii.youngStars',
  starFormation: 'fieldTuning.starFormation',
};

// Tier-global: shared by SHELLS, DIG and YOUNG STARS alike, so these render
// in the outer body rather than under any one of the three nested groups.
const HII_CORE_SLIDERS: readonly HiiSliderSpec[] = [
  {
    bag: 'hii',
    key: 'brightness',
    label: 'Master brightness',
    min: 0,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Whole-field flux multiplier — multiplies EVERY tier's own gain (the Brightness sliders inside SHELLS, DIG and YOUNG STARS below), rather than being any one tier's own knob. 1 is the calibrated default; each tier's own slider then scales its share up or down from there.",
  },
  {
    bag: 'shells',
    key: 'textureScale',
    label: 'Texture scale',
    min: 0.25,
    max: 8,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Shared by every HII group (shells, DIG, young stars). Multiplies the noise sample's frequency relative to the dust volume's own tile size — 1 samples at the SAME scale dust erosion does. Range extended past 4 for the young-stars tier's bigger splats, which need a higher frequency to still read as grainy unresolved stars rather than a soft blur.",
  },
  {
    bag: 'shells',
    key: 'textureContrast',
    label: 'Texture contrast',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Shared by every HII group. Shapes the noise modulation about its own midpoint, mirroring the dust cloud's own contrast knob.",
  },
];

const HII_SHELLS_SLIDERS: readonly HiiSliderSpec[] = [
  {
    bag: 'shells',
    key: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "This tier's own gain, multiplied against the Master brightness above — 1 leaves it at whatever the master alone gives it.",
  },
  {
    bag: 'shells',
    key: 'radiusScale',
    label: 'Radius scale',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Multiplies the Strömgren radius each region is drawn at: bigger, softer shells above 1, smaller and more concentrated below. 1 is the law exactly.',
  },
  {
    bag: 'shells',
    key: 'shellThickness',
    label: 'Shell thickness',
    min: 0.02,
    max: 1,
    step: 0.02,
    format: (v) => v.toFixed(2),
    info: "Radial scatter of a region's shell sprites, as a fraction of its radius. Small values give a thin, sharply limb-brightened front.",
  },
  {
    bag: 'shells',
    key: 'clusterStrength',
    label: 'Cluster strength',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Brightness of the embedded OB cluster at each region's centre; 0 leaves a hollow shell.",
  },
  {
    bag: 'shells',
    key: 'cavityScale',
    label: 'Cavity scale',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Radius of the dust cavity a young event carves, as a fraction of its own HII radius. 0 leaves the dust undisturbed.',
  },
  {
    bag: 'shells',
    key: 'texture',
    label: 'Texture',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Breaks up the shell + embedded-cluster sprites' circular Gaussian footprint with the same noise volume the dust cloud erodes with. 0 leaves them untouched.",
  },
  {
    bag: 'starFormation',
    key: 'sfActivity',
    label: 'SF activity',
    min: 0,
    max: 2.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Fallback event-catalog rate — sizes the HII tier only when the ISM generator is 'none'. The fluid generator ignores it: its regions come from the sim's own events.",
  },
];

const HII_DIG_SLIDERS: readonly HiiSliderSpec[] = [
  {
    bag: 'dig',
    key: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "This tier's own gain, multiplied against the Master brightness above — distinct from Flux fraction below, which SPLITS flux out of the shell tier's own total rather than scaling DIG's resulting share.",
  },
  {
    bag: 'dig',
    key: 'fraction',
    label: 'Flux fraction',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Diffuse ionized gas (DIG) veil's fraction of this tier's total Hα — observationally 30-50% of a galaxy's Hα sits outside HII regions entirely, a faint haze tracing the arms around the knots. Needs an ISM map; 0 skips the veil.",
  },
  {
    bag: 'dig',
    key: 'complexes',
    label: 'Population',
    min: 0,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Scaler on the run's own recent star-formation activity — the veil's complex count is now DERIVED from how much SF the current run produced, not a fixed number. 1 is the neutral default; total blob count is the derived complex count x children.",
  },
  {
    bag: 'dig',
    key: 'childrenPerComplex',
    label: 'Children',
    min: 1,
    max: 12,
    step: 1,
    format: (v) => v.toFixed(0),
    info: 'Blobs scattered around each DIG complex seed.',
  },
  {
    bag: 'dig',
    key: 'armBias',
    label: 'Arm bias',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Fraction of DIG complexes seeded on an arm's lane (following the arm's own flux) rather than CDF-sampled from the ISM map's activity channel.",
  },
  {
    bag: 'dig',
    key: 'elongation',
    label: 'Elongation',
    min: 1,
    max: 8,
    step: 0.1,
    format: (v) => v.toFixed(1),
    info: "Aspect ratio of a complex's child scatter along vs. across its local flow direction, area-preserving so the complex stretches without also inflating.",
  },
  {
    bag: 'dig',
    key: 'coherence',
    label: 'Coherence',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "How strictly a complex's scatter axis follows its local flow direction — 1 follows it exactly, 0 rotates it to a fresh random direction per complex.",
  },
  {
    bag: 'dig',
    key: 'texture',
    label: 'Texture',
    min: 0,
    max: 1,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "This veil's own share of the HII tier's shared texture breakup — independent of the shell tier's own Texture knob above.",
  },
];

const HII_YOUNG_STARS_SLIDERS: readonly HiiSliderSpec[] = [
  {
    bag: 'youngStars',
    key: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 20,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "This tier's total flux — the ONE flux knob for the arm-ridge chain. 0 skips the tier.",
  },
  {
    bag: 'youngStars',
    key: 'width',
    label: 'Width',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Chain ribbon's across-arm sigma, as a fraction of the arm ridge's own measured width law. 1 is that law exactly.",
  },
  {
    bag: 'youngStars',
    key: 'edgeBias',
    label: 'Edge bias',
    min: 0,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Pushes the tier's fixed total flux outward along the arms. 0 = flat (surface brightness falls ~1/r outward), ~2 = outer arms dominate (the M74-reference look).",
  },
  {
    bag: 'youngStars',
    key: 'mapDepth',
    label: 'Clumping',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: "0 = a smooth ribbon along the ridge, 1 = fully modulated by the ISM map's stars tracer — the fluid-advected clumps the chain rides.",
  },
  {
    bag: 'youngStars',
    key: 'contrast',
    label: 'Contrast',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "Gamma shaping the stars-map read — flux-neutral, mean-normalized so it restructures the clump contrast without draining the tier's total brightness.",
  },
  {
    bag: 'youngStars',
    key: 'texture',
    label: 'Texture',
    min: 0,
    max: 2,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: "This tier's own share of the HII tier's shared texture breakup — independent of the shell tier's own Texture knob above.",
  },
];

function HiiSection(): ReactNode {
  const dispatch = useAppDispatch();
  const hii = useAppSelector((state) => state.fieldTuning.hii);
  const starFormation = useAppSelector((state) => state.fieldTuning.starFormation);
  const open = useAppSelector((state) => state.ui.openSections.hii);
  const shellsOpen = useAppSelector((state) => state.ui.openSections.hiiShells);
  const digOpen = useAppSelector((state) => state.ui.openSections.hiiDig);
  const youngStarsOpen = useAppSelector((state) => state.ui.openSections.hiiYoungStars);

  const patchHii = (patch: Partial<GalaxyHiiTuning>): void => {
    dispatch(fieldTuningPatched({ hii: { ...hii, ...patch } }));
  };

  const patchShells = (patch: Partial<GalaxyHiiShellsTuning>): void => {
    patchHii({ shells: { ...hii.shells, ...patch } });
  };

  const patchDig = (patch: Partial<GalaxyHiiDigTuning>): void => {
    patchHii({ dig: { ...hii.dig, ...patch } });
  };

  const patchYoungStars = (patch: Partial<GalaxyYoungStarsTuning>): void => {
    patchHii({ youngStars: { ...hii.youngStars, ...patch } });
  };

  const patchStarFormation = (patch: Partial<GalaxyStarFormationParams>): void => {
    dispatch(fieldTuningPatched({ starFormation: { ...starFormation, ...patch } }));
  };

  // One switch (not two) pairs each bag's current value with its own patch
  // dispatch, so `renderHiiSlider` below has a single generic body.
  const resolveHiiSlider = (
    spec: HiiSliderSpec,
  ): { value: number; patch: (value: number) => void } => {
    switch (spec.bag) {
      case 'hii':
        return {
          value: hii[spec.key],
          patch: (v) => patchHii({ [spec.key]: v } as Partial<GalaxyHiiTuning>),
        };
      case 'shells':
        return {
          value: hii.shells[spec.key],
          patch: (v) => patchShells({ [spec.key]: v } as Partial<GalaxyHiiShellsTuning>),
        };
      case 'dig':
        return {
          value: hii.dig[spec.key],
          patch: (v) => patchDig({ [spec.key]: v } as Partial<GalaxyHiiDigTuning>),
        };
      case 'youngStars':
        return {
          value: hii.youngStars[spec.key],
          patch: (v) => patchYoungStars({ [spec.key]: v } as Partial<GalaxyYoungStarsTuning>),
        };
      case 'starFormation':
        return {
          value: starFormation[spec.key],
          patch: (v) => patchStarFormation({ [spec.key]: v } as Partial<GalaxyStarFormationParams>),
        };
    }
  };

  const renderHiiSlider = (spec: HiiSliderSpec): ReactNode => {
    const { value, patch } = resolveHiiSlider(spec);
    return (
      <ParamSlider
        key={`${spec.bag}.${spec.key}`}
        label={spec.label}
        value={value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        format={spec.format}
        onChange={patch}
        path={`${HII_BAG_PATH_PREFIX[spec.bag]}.${spec.key}`}
        info={spec.info}
      />
    );
  };

  // DIG and YOUNG STARS copy from their OWN nested sections below — this
  // one offers only the core knobs its own sliders drive, same split
  // `ArmFieldSection` uses to keep `cloud` out of its own payload.
  const { dig: _dig, youngStars: _youngStars, ...core } = hii;

  return (
    <CollapsibleSection
      title="HII REGIONS"
      open={open}
      onToggle={() => dispatch(sectionToggled('hii'))}
      headerToggle={hii.enabled}
      onHeaderToggleChange={(value) => patchHii({ enabled: value })}
      copyPayload={{ fieldTuning: { hii: core } }}
    >
      <div className={styles.root}>{HII_CORE_SLIDERS.map(renderHiiSlider)}</div>
      <CollapsibleSection
        title="SHELLS"
        open={shellsOpen}
        onToggle={() => dispatch(sectionToggled('hiiShells'))}
        headerToggle={hii.shells.enabled}
        onHeaderToggleChange={(value) => patchShells({ enabled: value })}
        variant="nested"
      >
        <div className={styles.root}>{HII_SHELLS_SLIDERS.map(renderHiiSlider)}</div>
      </CollapsibleSection>
      <CollapsibleSection
        title="DIG"
        open={digOpen}
        onToggle={() => dispatch(sectionToggled('hiiDig'))}
        copyPayload={{ fieldTuning: { hii: { dig: hii.dig } } }}
        variant="nested"
      >
        <div className={styles.root}>{HII_DIG_SLIDERS.map(renderHiiSlider)}</div>
      </CollapsibleSection>
      <CollapsibleSection
        title="YOUNG STARS"
        open={youngStarsOpen}
        onToggle={() => dispatch(sectionToggled('hiiYoungStars'))}
        headerToggle={hii.youngStars.enabled}
        onHeaderToggleChange={(value) => patchYoungStars({ enabled: value })}
        copyPayload={{ fieldTuning: { hii: { youngStars: hii.youngStars } } }}
        variant="nested"
      >
        <div className={styles.root}>{HII_YOUNG_STARS_SLIDERS.map(renderHiiSlider)}</div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default HiiSection;
