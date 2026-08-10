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
          nested
        >
          <div className={styles.root}>
            <SliderGroup title="Simulation">
              <ParamSlider
                label="Steps"
                value={fluid.steps}
                min={1}
                max={400}
                step={1}
                format={(v) => String(Math.round(v))}
                onChange={(v) => patchFluid({ steps: Math.round(v) })}
                path="fieldTuning.ismMapFluid.steps"
                info="Advection iterations per rebuild. Rebuild latency is linear in this."
              />
            </SliderGroup>
            <SliderGroup title="Disc & rotation">
              <ParamSlider
                label="Shear strength"
                value={fluid.shearStrength}
                min={0}
                max={0.5}
                step={0.005}
                format={(v) => v.toFixed(3)}
                onChange={(v) => patchFluid({ shearStrength: v })}
                path="fieldTuning.ismMapFluid.shearStrength"
                info="Differential-rotation shear amplitude, (1/r - 1/corotationRadius) formula."
              />
              <ParamSlider
                label="Corotation radius"
                value={fluid.corotationRadius}
                min={1}
                max={20}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ corotationRadius: v })}
                path="fieldTuning.ismMapFluid.corotationRadius"
                info="Pattern-speed radius the shear vanishes at."
              />
            </SliderGroup>
            <SliderGroup title="Gas supply">
              <ParamSlider
                label="Gas scale length"
                value={fluid.gasScaleLength}
                min={0.5}
                max={20}
                step={0.25}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ gasScaleLength: v })}
                path="fieldTuning.ismMapFluid.gasScaleLength"
                info="Exponential decline length of the radial gas profile gasRegen relaxes toward, in grid-radius units (same as rMin/rMax/corotationRadius). Range spans roughly 0.5 to 1.5x this app's own Milky Way preset's typical rMax (~13). Inert while gas floor is 1."
              />
              <ParamSlider
                label="Gas floor"
                value={fluid.gasFloor}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ gasFloor: v })}
                path="fieldTuning.ismMapFluid.gasFloor"
                info="Flat HI floor the radial gas profile approaches at large r, as a fraction of the disc-centre value. 1 (default) makes the profile identically 1.0 everywhere — byte-identical to this calibration before the profile existed. Lower to let gas thin toward the outer disc."
              />
              <ParamSlider
                label="Gas regen"
                value={fluid.gasRegen}
                min={0}
                max={0.2}
                step={0.002}
                format={(v) => v.toFixed(3)}
                onChange={(v) => patchFluid({ gasRegen: v })}
                path="fieldTuning.ismMapFluid.gasRegen"
                info="Gas relaxation rate toward gasProfile(r) per step, applied after advection — this generator's own contrast knob. At the default gas floor (1) the profile is flat 1.0 everywhere, so this reads as before."
              />
              <ParamSlider
                label="Diffusion"
                value={fluid.diffusion}
                min={0}
                max={0.2}
                step={0.005}
                format={(v) => v.toFixed(3)}
                onChange={(v) => patchFluid({ diffusion: v })}
                path="fieldTuning.ismMapFluid.diffusion"
                info="Explicit diffusion coefficient for gas/dust density (texel²/step) — the repulsion arm gather's attraction otherwise has nothing to balance, which without it collapses gas onto a 1-2 texel line at each arm crest. Stable only up to 0.25; this range stays well under that bound."
              />
            </SliderGroup>
            <SliderGroup title="Arm response">
              <ParamSlider
                label="Arm gather"
                value={fluid.armGather}
                min={0}
                max={15}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ armGather: v })}
                path="fieldTuning.ismMapFluid.armGather"
                info="Velocity pointing up the arm-forcing field's gradient, toward a ridge — the same baked field, read here as a texture. Damped as local dust piles up so it can't run away over a full rebuild. Above ~15 gather speed exceeds a texel/step at ridge gradients and spikes."
              />
              <ParamSlider
                label="Arm drag"
                value={fluid.armDrag}
                min={0}
                max={4}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ armDrag: v })}
                path="fieldTuning.ismMapFluid.armDrag"
                info="Drags the shear (only) by local arm forcing, so drift stalls inside the arm — density piles up on the upstream edge via the existing convergence term, a soft release downstream, sides flipping at corotation. Forcing peaks at 1 at a ridge crest, so armDrag >= 1 gives full stall there."
              />
              <ParamSlider
                label="Lane bias"
                value={fluid.laneBias}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ laneBias: v })}
                path="fieldTuning.ismMapFluid.laneBias"
                info="Directional gather: full strength where the drift carries gas toward the ridge (the upstream flank arm drag stalls), scaled down by (1 - laneBias) on the downstream flank — keeps the drag lane one-sided instead of the gather washing it back out."
              />
              <ParamSlider
                label="Gather offset"
                value={fluid.gatherOffset}
                min={-60}
                max={60}
                step={0.5}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ gatherOffset: v })}
                path="fieldTuning.ismMapFluid.gatherOffset"
                info="Shifts arm gather's own forcing sample off the crest by this many az texels, upstream (positive) or downstream (negative) of the flank the drift carries gas from — signed consistently on both sides of corotation. 0 (default) gathers toward the crest itself. The ridge's own half-FWHM is ~17-24 texels across this app's Milky Way preset's grid (galaxyIsmMapArmForcing.ts's armCrossSigma); the range deliberately reaches well past it so the gather target can sit fully off-arm."
              />
            </SliderGroup>
            <SliderGroup title="SF events">
              <ParamSlider
                label="Event rate"
                value={fluid.eventRate}
                min={0}
                max={20}
                step={0.5}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ eventRate: v })}
                path="fieldTuning.ismMapFluid.eventRate"
                info="Events spawned per step, on average — total events over a run is ~eventRate x steps (capped at ISM_MAP_FLUID_MAX_EVENTS). Each event drives an outward kernel-velocity impulse."
              />
              <ParamSlider
                label="Impulse strength"
                value={fluid.impulseStrength}
                min={0}
                max={5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ impulseStrength: v })}
                path="fieldTuning.ismMapFluid.impulseStrength"
                info="Outward kernel-velocity amplitude an event starts at, in texels/step; decays to 0 over impulseDuration. The knob that carves walls/cavities."
              />
              <ParamSlider
                label="Impulse duration"
                value={fluid.impulseDuration}
                min={1}
                max={100}
                step={1}
                format={(v) => String(Math.round(v))}
                onChange={(v) => patchFluid({ impulseDuration: Math.round(v) })}
                path="fieldTuning.ismMapFluid.impulseDuration"
                info="Steps an event stays active after birth — sets both the wall's growth window and how many events overlap at once."
              />
              <ParamSlider
                label="Radius scale"
                value={fluid.radiusScale}
                min={0.5}
                max={15}
                step={0.25}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ radiusScale: v })}
                path="fieldTuning.ismMapFluid.radiusScale"
                info="Base kernel radius in ring-texel-equivalent units; grows with an event's own age (age^0.6, snowplough-ish) up to this scale."
              />
              <ParamSlider
                label="EMA rate"
                value={fluid.emaRate}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ emaRate: v })}
                path="fieldTuning.ismMapFluid.emaRate"
                info="Blend rate of the per-texel activity trace toward this step's event intensity (z' = mix(z, eventStamp, emaRate)) — an EMA."
              />
              <ParamSlider
                label="Event arm bias"
                value={fluid.eventArmBias}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ eventArmBias: v })}
                path="fieldTuning.ismMapFluid.eventArmBias"
                info="How hard event placement is confined to the arms: the CDF floor off the ridge is ARM_BIAS_FLOOR * (1 - eventArmBias). 0 (default) is today's fixed bias — events can land anywhere, weighted toward the arms. 1 zeroes the floor entirely, gating events strictly onto texels with nonzero arm forcing."
              />
              <ParamSlider
                label="Stars deposit"
                value={fluid.starsDeposit}
                min={0}
                max={4}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ starsDeposit: v })}
                path="fieldTuning.ismMapFluid.starsDeposit"
                info="Young-stars tracer mass deposited per step at texels an event stamps, proportional to that texel's own local gas — SF converts gas to stars. The young-stars chain tier's placement field reads this channel, so raising it clumps chains harder onto fresh event sites."
              />
              <ParamSlider
                label="Stars decay"
                value={fluid.starsDecay}
                min={0.9}
                max={1}
                step={0.001}
                format={(v) => v.toFixed(3)}
                onChange={(v) => patchFluid({ starsDecay: v })}
                path="fieldTuning.ismMapFluid.starsDecay"
                info="Per-step retention of the advected stars tracer — this run's own dial on the measured ~40-100 Myr structural dissolution clock young stellar associations show. Lower dissolves chains faster behind the advancing front; 1 would never forget a deposit at all."
              />
            </SliderGroup>
            <SliderGroup title="Turbulence">
              <ParamSlider
                label="Curl strength"
                value={fluid.curlStrength}
                min={0}
                max={3}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ curlStrength: v })}
                path="fieldTuning.ismMapFluid.curlStrength"
                info="Curl-noise (divergence-free) velocity amplitude, in texels/step — the turbulent stirring term on top of shear and event impulses."
              />
              <ParamSlider
                label="Curl scale"
                value={fluid.curlScale}
                min={0.005}
                max={0.3}
                step={0.005}
                format={(v) => v.toFixed(3)}
                onChange={(v) => patchFluid({ curlScale: v })}
                path="fieldTuning.ismMapFluid.curlScale"
                info="Curl-noise spatial frequency, in texels^-1 — higher values give smaller stirring cells."
              />
            </SliderGroup>
          </div>
        </CollapsibleSection>
      )}
    </CollapsibleSection>
  );
}

export default IsmMapSection;
