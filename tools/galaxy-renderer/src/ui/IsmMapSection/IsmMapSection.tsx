/**
 * SfMapSection — the shared SF-map switch: `GalaxyFieldTuning.sfMap.generator`
 * (none | automaton | fluid) is the ONLY control here — the old separate
 * `enabled` toggle and "seed dust from gas" checkbox both folded into it,
 * since dust seeding is just "a generator is running". AUTOMATON and FLUID
 * below are mutually exclusive: only the active generator's panel renders.
 *
 * The COUPLING readout is permanent, not a one-off debug print — "sliders
 * don't move the dust" has three structurally different causes (readback
 * never landed, the generator has no measurable structure, or the coupling
 * already agrees with the arm tangent) — shown whenever a generator is active.
 */
import type { ReactNode } from 'react';
import type { GalaxySfMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapAutomatonParams';
import type { GalaxySfMapFluidParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapFluidParams';
import type { GalaxySfMapGeneratorKind } from '../../../../../src/@types/galaxy/GalaxyIsmMapGeneratorKind';
import type { GalaxySfMapParams } from '../../../../../src/@types/galaxy/GalaxyIsmMapParams';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import SliderGroup from '../SliderGroup/SliderGroup';
import styles from './SfMapSection.module.css';

export type SfMapSectionProps = {
  /** Null until the engine's first report — see `OrientationDiagnostics`'s own doc. */
  readonly diagnostics: OrientationDiagnostics | null;
};

function SfMapSection({ diagnostics }: SfMapSectionProps): ReactNode {
  const dispatch = useAppDispatch();
  const sfMap = useAppSelector((state) => state.fieldTuning.sfMap);
  const automaton = useAppSelector((state) => state.fieldTuning.sfMapAutomaton);
  const fluid = useAppSelector((state) => state.fieldTuning.sfMapFluid);
  const open = useAppSelector((state) => state.ui.openSections.sfMap);
  const automatonOpen = useAppSelector((state) => state.ui.openSections.sfMapAutomaton);
  const fluidOpen = useAppSelector((state) => state.ui.openSections.sfMapFluid);

  const patchSfMap = (patch: Partial<GalaxySfMapParams>): void => {
    dispatch(fieldTuningPatched({ sfMap: { ...sfMap, ...patch } }));
  };
  const patchAutomaton = (patch: Partial<GalaxySfMapAutomatonParams>): void => {
    dispatch(fieldTuningPatched({ sfMapAutomaton: { ...automaton, ...patch } }));
  };
  const patchFluid = (patch: Partial<GalaxySfMapFluidParams>): void => {
    dispatch(fieldTuningPatched({ sfMapFluid: { ...fluid, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="SF MAP"
      open={open}
      onToggle={() => dispatch(sectionToggled('sfMap'))}
      copyPayload={{ fieldTuning: { sfMap } }}
    >
      <div className={styles.root}>
        <label className={styles.toggleRow}>
          <span>Generator</span>
          <select
            className={styles.select}
            value={sfMap.generator}
            onChange={(e) => patchSfMap({ generator: e.target.value as GalaxySfMapGeneratorKind })}
          >
            <option value="none">No simulation</option>
            <option value="automaton">Automaton (SSPSF)</option>
            <option value="fluid">Fluid (advection)</option>
          </select>
        </label>
        {sfMap.generator !== 'none' && (
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
      {sfMap.generator === 'automaton' && (
        <CollapsibleSection
          title="AUTOMATON"
          open={automatonOpen}
          onToggle={() => dispatch(sectionToggled('sfMapAutomaton'))}
          copyPayload={{ fieldTuning: { sfMapAutomaton: automaton } }}
          nested
        >
          <div className={styles.root}>
            <ParamSlider
              label="Steps"
              value={automaton.steps}
              min={1}
              max={200}
              step={1}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchAutomaton({ steps: Math.round(v) })}
              path="fieldTuning.sfMapAutomaton.steps"
              info="Automaton iterations per rebuild. Structure coarsens with more steps; the shear winds it. Rebuild latency is linear in this — the dominant cost of a slider drag."
            />
            <ParamSlider
              label="Base ignition"
              value={automaton.baseIgnition}
              min={0}
              max={0.002}
              step={0.00005}
              format={(v) => v.toFixed(5)}
              onChange={(v) => patchAutomaton({ baseIgnition: v })}
              path="fieldTuning.sfMapAutomaton.baseIgnition"
              info="Spontaneous ignition probability per cell per step, independent of neighbours — the seed that keeps a quiet disc from dying out. Seeds should be RARE: propagation does the work, and the whole grid rolls this every step."
            />
            <ParamSlider
              label="Spread"
              value={automaton.spread}
              min={0}
              max={0.5}
              step={0.002}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ spread: v })}
              path="fieldTuning.sfMapAutomaton.spread"
              info="Added ignition probability per already-ignited neighbour. Two thresholds, and the higher one is what governs whether SPURS form: 1/8 = 0.125 is where a cell with all eight neighbours lit becomes critical, but the cells behind a front are refractory and gas-depleted, so only its leading edge propagates — with ~3 live neighbours there, fronts need ~1/3 to survive and grow. Below that the disc only ever shows short-lived isolated blobs."
            />
            <ParamSlider
              label="Refractory steps"
              value={automaton.refractorySteps}
              min={1}
              max={30}
              step={1}
              format={(v) => String(Math.round(v))}
              onChange={(v) => patchAutomaton({ refractorySteps: Math.round(v) })}
              path="fieldTuning.sfMapAutomaton.refractorySteps"
              info="Steps a cell stays spent before its gas can ignite again. Sets the width of the trailing wake behind a propagating front."
            />
            <ParamSlider
              label="Gas regen"
              value={automaton.gasRegen}
              min={0}
              max={0.1}
              step={0.002}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ gasRegen: v })}
              path="fieldTuning.sfMapAutomaton.gasRegen"
              info="Gas recovered per step as a fraction of full — the star/gas feedback the original stars-only model lacked. Recovery takes 1/gasRegen steps, so this is the CONTRAST knob: it sets how long a burnt void stays a void rather than simmering back."
            />
            <ParamSlider
              label="Activity decay"
              value={automaton.activityDecay}
              min={0.9}
              max={1}
              step={0.001}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ activityDecay: v })}
              path="fieldTuning.sfMapAutomaton.activityDecay"
              info="Per-step multiplier on the trailing 'old activity' trace the overlay's structure is mostly made of. At 1.0 the channel integrates the WHOLE run, everywhere a front ever passed; below that it forgets with half-life ln(0.5)/ln(decay) steps. Raising this toward 1 without lowering gain saturates the channel to flat white — and flat white reads as 'no structure' exactly like flat black does."
            />
            <ParamSlider
              label="Activity gain"
              value={automaton.activityGain}
              min={0.005}
              max={0.5}
              step={0.005}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ activityGain: v })}
              path="fieldTuning.sfMapAutomaton.activityGain"
              info="Added to the activity trace on each ignition. Its steady state at firing period T is gain/(1 - decay^T), so this is NOT independent of decay: a sparse regime (long T) needs a much bigger gain than a busy one just to stay visible, and too much saturates the channel flat instead."
            />
            <ParamSlider
              label="Arm forcing"
              value={automaton.armForcing}
              min={0}
              max={0.1}
              step={0.001}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ armForcing: v })}
              path="fieldTuning.sfMapAutomaton.armForcing"
              info="How much the spiral ridge raises local ignition probability, per step. 0 makes the automaton blind to the arms and the output goes purely flocculent. Past ~0.06 the arms IGNITE rather than bias — a forced cell then fires as often as its refractory window allows, whatever spread does."
            />
            <ParamSlider
              label="Arm flux ref"
              value={automaton.armFluxRef}
              min={0.05}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => patchAutomaton({ armFluxRef: v })}
              path="fieldTuning.sfMapAutomaton.armFluxRef"
              info="Shear magnitude (texels/step) at which arm forcing saturates to full strength. Forcing weights by |shear|/armFluxRef, which sends corotation (shear = 0) to a DEFICIT instead of the residence-time ring the raw forcing term produces there — lower this to widen the deficit band, raise it to narrow it."
            />
            <ParamSlider
              label="Dust floor fraction"
              value={automaton.dustFloorFraction}
              min={0}
              max={1}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(v) => patchAutomaton({ dustFloorFraction: v })}
              path="fieldTuning.sfMapAutomaton.dustFloorFraction"
              info="On ignition a cell keeps this fraction of its own dust; the rest sweeps onto its 8 neighbours (the snowplough rule). Lower carves darker cavities behind an advancing front. Colliding fronts pile dust past ambient into the rim by design — that overshoot is never clamped."
            />
            <ParamSlider
              label="Corotation radius"
              value={automaton.corotationRadius}
              min={1}
              max={20}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(v) => patchAutomaton({ corotationRadius: v })}
              path="fieldTuning.sfMapAutomaton.corotationRadius"
              info="Generator units. Sets the pattern speed the shear is measured against — shear vanishes at corotation and reverses across it."
            />
            <ParamSlider
              label="Shear rate"
              value={automaton.shearRate}
              min={0}
              max={0.5}
              step={0.005}
              format={(v) => v.toFixed(3)}
              onChange={(v) => patchAutomaton({ shearRate: v })}
              path="fieldTuning.sfMapAutomaton.shearRate"
              info="Angular offset scale per step, in radians at unit (1/r - 1/corotationRadius). Total winding is shearRate * steps, so dropping steps to 100 cut the wind by 3x — expect to raise this to get the same pitch back."
            />
          </div>
        </CollapsibleSection>
      )}
      {sfMap.generator === 'fluid' && (
        <CollapsibleSection
          title="FLUID"
          open={fluidOpen}
          onToggle={() => dispatch(sectionToggled('sfMapFluid'))}
          copyPayload={{ fieldTuning: { sfMapFluid: fluid } }}
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
                path="fieldTuning.sfMapFluid.steps"
                info="Advection iterations per rebuild — this generator's own step budget, parallel to the automaton's. Rebuild latency is linear in this."
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
                path="fieldTuning.sfMapFluid.shearStrength"
                info="Differential-rotation shear amplitude, same (1/r - 1/corotationRadius) formula the automaton's shearRate uses — this generator's own copy, not wired to it."
              />
              <ParamSlider
                label="Corotation radius"
                value={fluid.corotationRadius}
                min={1}
                max={20}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ corotationRadius: v })}
                path="fieldTuning.sfMapFluid.corotationRadius"
                info="Pattern-speed radius the shear vanishes at — this generator's own copy, not the automaton's."
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
                path="fieldTuning.sfMapFluid.gasScaleLength"
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
                path="fieldTuning.sfMapFluid.gasFloor"
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
                path="fieldTuning.sfMapFluid.gasRegen"
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
                path="fieldTuning.sfMapFluid.diffusion"
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
                path="fieldTuning.sfMapFluid.armGather"
                info="Velocity pointing up the arm-forcing field's gradient, toward a ridge — the same baked field the automaton samples, read here as a texture. Damped as local dust piles up so it can't run away over a full rebuild. Above ~15 gather speed exceeds a texel/step at ridge gradients and spikes."
              />
              <ParamSlider
                label="Arm drag"
                value={fluid.armDrag}
                min={0}
                max={4}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ armDrag: v })}
                path="fieldTuning.sfMapFluid.armDrag"
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
                path="fieldTuning.sfMapFluid.laneBias"
                info="Directional gather: full strength where the drift carries gas toward the ridge (the upstream flank arm drag stalls), scaled down by (1 - laneBias) on the downstream flank — keeps the drag lane one-sided instead of the gather washing it back out."
              />
              <ParamSlider
                label="Gather offset"
                value={fluid.gatherOffset}
                min={-24}
                max={24}
                step={0.5}
                format={(v) => v.toFixed(1)}
                onChange={(v) => patchFluid({ gatherOffset: v })}
                path="fieldTuning.sfMapFluid.gatherOffset"
                info="Shifts arm gather's own forcing sample off the crest by this many az texels, upstream (positive) or downstream (negative) of the flank the drift carries gas from — signed consistently on both sides of corotation. 0 (default) gathers toward the crest itself. Range covers roughly the ridge's own half-FWHM (~17-24 texels across this app's Milky Way preset's grid, per galaxySfMapArmForcing.ts's armCrossSigma)."
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
                path="fieldTuning.sfMapFluid.eventRate"
                info="Events spawned per step, on average — total events over a run is ~eventRate x steps (capped at SF_MAP_FLUID_MAX_EVENTS). Each event drives an outward kernel-velocity impulse."
              />
              <ParamSlider
                label="Impulse strength"
                value={fluid.impulseStrength}
                min={0}
                max={5}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ impulseStrength: v })}
                path="fieldTuning.sfMapFluid.impulseStrength"
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
                path="fieldTuning.sfMapFluid.impulseDuration"
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
                path="fieldTuning.sfMapFluid.radiusScale"
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
                path="fieldTuning.sfMapFluid.emaRate"
                info="Blend rate of the per-texel activity trace toward this step's event intensity (z' = mix(z, eventStamp, emaRate)) — an EMA, not the automaton's decay+gain pair."
              />
              <ParamSlider
                label="Event arm bias"
                value={fluid.eventArmBias}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                onChange={(v) => patchFluid({ eventArmBias: v })}
                path="fieldTuning.sfMapFluid.eventArmBias"
                info="How hard event placement is confined to the arms: the CDF floor off the ridge is ARM_BIAS_FLOOR * (1 - eventArmBias). 0 (default) is today's fixed bias — events can land anywhere, weighted toward the arms. 1 zeroes the floor entirely, gating events strictly onto texels with nonzero arm forcing."
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
                path="fieldTuning.sfMapFluid.curlStrength"
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
                path="fieldTuning.sfMapFluid.curlScale"
                info="Curl-noise spatial frequency, in texels^-1 — higher values give smaller stirring cells."
              />
            </SliderGroup>
          </div>
        </CollapsibleSection>
      )}
    </CollapsibleSection>
  );
}

export default SfMapSection;
