/**
 * IsmMapSection — the shared ISM-map switch: `GalaxyFieldTuning.ismMap.generator`
 * (none | fluid) is the ONLY control here — the old separate `enabled`
 * toggle and "seed dust from gas" checkbox both folded into it, since dust
 * seeding is just "the generator is running".
 *
 * The COUPLING readout is permanent, not a one-off debug print — "sliders
 * don't move the dust" has three structurally different causes (readback
 * never landed, the generator has no measurable structure, or the coupling
 * already agrees with the arm tangent) — shown whenever the generator is active.
 */
import type { ReactNode } from 'react';
import type { GalaxyIsmMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';
import type { GalaxyIsmMapGeneratorKind } from '../../../../../src/@types/galaxy/GalaxyIsmMapGeneratorKind';
import type { GalaxyIsmMapParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapParams';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import SliderGroup from '../SliderGroup/SliderGroup';
import styles from './IsmMapSection.module.css';

type FluidSliderKey = keyof GalaxyIsmMapFluidParams;

type FluidSliderSpec = {
  readonly key: FluidSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
  /** `steps`/`impulseDuration` are step counts; the rest read fractionally. */
  readonly round?: boolean;
};

type FluidSliderGroupSpec = {
  readonly title: string;
  readonly sliders: readonly FluidSliderSpec[];
};

const roundedSteps = (v: number): string => String(Math.round(v));

// Mirrors the FLUID panel's own six `SliderGroup` clusters — one entry here
// per cluster, in on-screen order.
const FLUID_SLIDER_GROUPS: readonly FluidSliderGroupSpec[] = [
  {
    title: 'Simulation',
    sliders: [
      {
        key: 'steps',
        label: 'Steps',
        min: 1,
        max: 400,
        step: 1,
        format: roundedSteps,
        round: true,
        info: 'Advection iterations per rebuild. Rebuild latency is linear in this.',
      },
    ],
  },
  {
    title: 'Disc & rotation',
    sliders: [
      {
        key: 'shearStrength',
        label: 'Shear strength',
        min: 0,
        max: 0.5,
        step: 0.005,
        format: (v) => v.toFixed(3),
        info: 'Differential-rotation shear amplitude, (1/r - 1/corotationRadius) formula.',
      },
      {
        key: 'corotationRadius',
        label: 'Corotation radius',
        min: 1,
        max: 20,
        step: 0.1,
        format: (v) => v.toFixed(1),
        info: 'Pattern-speed radius the shear vanishes at.',
      },
    ],
  },
  {
    title: 'Gas supply',
    sliders: [
      {
        key: 'gasScaleLength',
        label: 'Gas scale length',
        min: 0.5,
        max: 20,
        step: 0.25,
        format: (v) => v.toFixed(2),
        info: "Exponential decline length of the radial gas profile gasRegen relaxes toward, in grid-radius units (same as rMin/rMax/corotationRadius). Range spans roughly 0.5 to 1.5x this app's own Milky Way preset's typical rMax (~13). Inert while gas floor is 1.",
      },
      {
        key: 'gasFloor',
        label: 'Gas floor',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
        info: 'Flat HI floor the radial gas profile approaches at large r, as a fraction of the disc-centre value. 1 (default) makes the profile identically 1.0 everywhere — byte-identical to this calibration before the profile existed. Lower to let gas thin toward the outer disc.',
      },
      {
        key: 'gasRegen',
        label: 'Gas regen',
        min: 0,
        max: 0.2,
        step: 0.002,
        format: (v) => v.toFixed(3),
        info: "Gas relaxation rate toward gasProfile(r) per step, applied after advection — this generator's own contrast knob. At the default gas floor (1) the profile is flat 1.0 everywhere, so this reads as before.",
      },
      {
        key: 'diffusion',
        label: 'Diffusion',
        min: 0,
        max: 0.2,
        step: 0.005,
        format: (v) => v.toFixed(3),
        info: "Explicit diffusion coefficient for gas/dust density (texel²/step) — the repulsion arm gather's attraction otherwise has nothing to balance, which without it collapses gas onto a 1-2 texel line at each arm crest. Stable only up to 0.25; this range stays well under that bound.",
      },
    ],
  },
  {
    title: 'Arm response',
    sliders: [
      {
        key: 'armGather',
        label: 'Arm gather',
        min: 0,
        max: 15,
        step: 0.1,
        format: (v) => v.toFixed(1),
        info: "Velocity pointing up the arm-forcing field's gradient, toward a ridge — the same baked field, read here as a texture. Damped as local dust piles up so it can't run away over a full rebuild. Above ~15 gather speed exceeds a texel/step at ridge gradients and spikes.",
      },
      {
        key: 'armDrag',
        label: 'Arm drag',
        min: 0,
        max: 4,
        step: 0.05,
        format: (v) => v.toFixed(2),
        info: 'Drags the shear (only) by local arm forcing, so drift stalls inside the arm — density piles up on the upstream edge via the existing convergence term, a soft release downstream, sides flipping at corotation. Forcing peaks at 1 at a ridge crest, so armDrag >= 1 gives full stall there.',
      },
      {
        key: 'laneBias',
        label: 'Lane bias',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
        info: 'Directional gather: full strength where the drift carries gas toward the ridge (the upstream flank arm drag stalls), scaled down by (1 - laneBias) on the downstream flank — keeps the drag lane one-sided instead of the gather washing it back out.',
      },
      {
        key: 'gatherOffset',
        label: 'Gather offset',
        min: -60,
        max: 60,
        step: 0.5,
        format: (v) => v.toFixed(1),
        info: "Shifts arm gather's own forcing sample off the crest by this many az texels, upstream (positive) or downstream (negative) of the flank the drift carries gas from — signed consistently on both sides of corotation. 0 (default) gathers toward the crest itself. The ridge's own half-FWHM is ~17-24 texels across this app's Milky Way preset's grid (galaxyIsmMapArmForcing.ts's armCrossSigma); the range deliberately reaches well past it so the gather target can sit fully off-arm.",
      },
    ],
  },
  {
    title: 'SF events',
    sliders: [
      {
        key: 'eventRate',
        label: 'Event rate',
        min: 0,
        max: 20,
        step: 0.5,
        format: (v) => v.toFixed(1),
        info: 'Events spawned per step, on average — total events over a run is ~eventRate x steps (capped at ISM_MAP_FLUID_MAX_EVENTS). Each event drives an outward kernel-velocity impulse.',
      },
      {
        key: 'impulseStrength',
        label: 'Impulse strength',
        min: 0,
        max: 5,
        step: 0.05,
        format: (v) => v.toFixed(2),
        info: 'Outward kernel-velocity amplitude an event starts at, in texels/step; decays to 0 over impulseDuration. The knob that carves walls/cavities.',
      },
      {
        key: 'impulseDuration',
        label: 'Impulse duration',
        min: 1,
        max: 100,
        step: 1,
        format: roundedSteps,
        round: true,
        info: "Steps an event stays active after birth — sets both the wall's growth window and how many events overlap at once.",
      },
      {
        key: 'radiusScale',
        label: 'Radius scale',
        min: 0.5,
        max: 15,
        step: 0.25,
        format: (v) => v.toFixed(2),
        info: "Base kernel radius in ring-texel-equivalent units; grows with an event's own age (age^0.6, snowplough-ish) up to this scale.",
      },
      {
        key: 'emaRate',
        label: 'EMA rate',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
        info: "Blend rate of the per-texel activity trace toward this step's event intensity (z' = mix(z, eventStamp, emaRate)) — an EMA.",
      },
      {
        key: 'eventArmBias',
        label: 'Event arm bias',
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => v.toFixed(2),
        info: "How hard event placement is confined to the arms: the CDF floor off the ridge is ARM_BIAS_FLOOR * (1 - eventArmBias). 0 (default) is today's fixed bias — events can land anywhere, weighted toward the arms. 1 zeroes the floor entirely, gating events strictly onto texels with nonzero arm forcing.",
      },
      {
        key: 'starsDeposit',
        label: 'Stars deposit',
        min: 0,
        max: 4,
        step: 0.05,
        format: (v) => v.toFixed(2),
        info: "Young-stars tracer mass deposited per step at texels an event stamps, proportional to that texel's own local gas — SF converts gas to stars. The young-stars chain tier's placement field reads this channel, so raising it clumps chains harder onto fresh event sites.",
      },
      {
        key: 'starsDecay',
        label: 'Stars decay',
        min: 0.9,
        max: 1,
        step: 0.001,
        format: (v) => v.toFixed(3),
        info: "Per-step retention of the advected stars tracer — this run's own dial on the measured ~40-100 Myr structural dissolution clock young stellar associations show. Lower dissolves chains faster behind the advancing front; 1 would never forget a deposit at all.",
      },
    ],
  },
  {
    title: 'Turbulence',
    sliders: [
      {
        key: 'curlStrength',
        label: 'Curl strength',
        min: 0,
        max: 3,
        step: 0.05,
        format: (v) => v.toFixed(2),
        info: 'Curl-noise (divergence-free) velocity amplitude, in texels/step — the turbulent stirring term on top of shear and event impulses.',
      },
      {
        key: 'curlScale',
        label: 'Curl scale',
        min: 0.005,
        max: 0.3,
        step: 0.005,
        format: (v) => v.toFixed(3),
        info: 'Curl-noise spatial frequency, in texels^-1 — higher values give smaller stirring cells.',
      },
    ],
  },
];

export type IsmMapSectionProps = {
  /** Null until the engine's first report — see `OrientationDiagnostics`'s own doc. */
  readonly diagnostics: OrientationDiagnostics | null;
};

function IsmMapSection({ diagnostics }: IsmMapSectionProps): ReactNode {
  const dispatch = useAppDispatch();
  const ismMap = useAppSelector((state) => state.fieldTuning.ismMap);
  const fluid = useAppSelector((state) => state.fieldTuning.ismMapFluid);
  const open = useAppSelector((state) => state.ui.openSections.ismMap);
  const fluidOpen = useAppSelector((state) => state.ui.openSections.ismMapFluid);

  const patchIsmMap = (patch: Partial<GalaxyIsmMapParams>): void => {
    dispatch(fieldTuningPatched({ ismMap: { ...ismMap, ...patch } }));
  };
  const patchFluid = (patch: Partial<GalaxyIsmMapFluidParams>): void => {
    dispatch(fieldTuningPatched({ ismMapFluid: { ...fluid, ...patch } }));
  };

  const renderFluidSlider = (spec: FluidSliderSpec): ReactNode => (
    <ParamSlider
      key={spec.key}
      label={spec.label}
      value={fluid[spec.key]}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      format={spec.format}
      onChange={(v) => patchFluid({ [spec.key]: spec.round ? Math.round(v) : v })}
      path={`fieldTuning.ismMapFluid.${spec.key}`}
      info={spec.info}
    />
  );

  return (
    <CollapsibleSection
      title="INTERSTELLAR MEDIUM (ISM)"
      open={open}
      onToggle={() => dispatch(sectionToggled('ismMap'))}
      copyPayload={{ fieldTuning: { ismMap } }}
    >
      <div className={styles.root}>
        <label className={styles.toggleRow}>
          <span>Generator</span>
          <select
            className={styles.select}
            value={ismMap.generator}
            onChange={(e) =>
              patchIsmMap({ generator: e.target.value as GalaxyIsmMapGeneratorKind })
            }
          >
            <option value="none">No simulation</option>
            <option value="fluid">Fluid (advection)</option>
          </select>
        </label>
        {ismMap.generator !== 'none' && (
          <div className={styles.readout}>
            <div className={styles.readoutHeader}>orientation coupling · live</div>
            <div className={styles.row}>
              <span className={styles.slot}>readback landed</span>
              <span className={styles.value}>
                {diagnostics
                  ? diagnostics.hasData
                    ? `yes (gen ${diagnostics.generation})`
                    : 'no'
                  : '—'}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.slot}>coherence mean / max</span>
              <span className={styles.value}>
                {diagnostics
                  ? `${diagnostics.meanCoherence.toFixed(3)} / ${diagnostics.maxCoherence.toFixed(3)}`
                  : '—'}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.slot}>delta applied mean / max</span>
              <span className={styles.value}>
                {diagnostics
                  ? `${diagnostics.meanDeltaDeg.toFixed(2)}° / ${diagnostics.maxDeltaDeg.toFixed(2)}°`
                  : '—'}
              </span>
            </div>
          </div>
        )}
      </div>
      {ismMap.generator === 'fluid' && (
        <CollapsibleSection
          title="FLUID"
          open={fluidOpen}
          onToggle={() => dispatch(sectionToggled('ismMapFluid'))}
          copyPayload={{ fieldTuning: { ismMapFluid: fluid } }}
          variant="nested"
        >
          <div className={styles.root}>
            {FLUID_SLIDER_GROUPS.map((group) => (
              <SliderGroup key={group.title} title={group.title}>
                {group.sliders.map(renderFluidSlider)}
              </SliderGroup>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </CollapsibleSection>
  );
}

export default IsmMapSection;
