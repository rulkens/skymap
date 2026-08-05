/**
 * SfMapSection — the shared SF-map switch (`GalaxyFieldTuning.sfMap`:
 * enabled + which generator) plus its two independent pipelines, nested
 * underneath: the SSPSF cellular automaton (`GalaxySfMapAutomatonParams`,
 * `src/@types/galaxy/GalaxySfMapAutomatonParams.ts`) and the fluid
 * alternative (`GalaxySfMapFluidParams`). Nobody has tuned either yet, so
 * every range here is deliberately wide — see the field docblocks for what
 * each knob does.
 *
 * The COUPLING readout at the bottom is permanent, not a one-off debug
 * print: "sliders don't move the dust" has three structurally different
 * causes (readback never landed, the active generator has no measurable
 * structure, or the coupling works but the measured orientation already
 * agrees with the arm tangent), and only these three numbers tell them apart.
 */
import type { ReactNode } from 'react';
import type { GalaxyDustTuning } from '../../../../../src/@types/galaxy/GalaxyDustTuning';
import type { GalaxySfMapAutomatonParams } from '../../../../../src/@types/galaxy/GalaxySfMapAutomatonParams';
import type { GalaxySfMapFluidParams } from '../../../../../src/@types/galaxy/GalaxySfMapFluidParams';
import type { GalaxySfMapGeneratorKind } from '../../../../../src/@types/galaxy/GalaxySfMapGeneratorKind';
import type { GalaxySfMapParams } from '../../../../../src/@types/galaxy/GalaxySfMapParams';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { fieldTuningPatched } from '../../state/slices/fieldTuningSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
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
  const dust = useAppSelector((state) => state.fieldTuning.dust);
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
  const patchDust = (patch: Partial<GalaxyDustTuning>): void => {
    dispatch(fieldTuningPatched({ dust: { ...dust, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="SF MAP"
      open={open}
      onToggle={() => dispatch(sectionToggled('sfMap'))}
      headerToggle={sfMap.enabled}
      onHeaderToggleChange={(value) => patchSfMap({ enabled: value })}
      // `dust.sfMapSeeding`/`dust.sweptMix` ride along because this section's
      // own controls write them, even though both live on the dust tier —
      // see those controls' comments. The generator param blocks copy from
      // their OWN nested sections below, same split `HiiSection` uses for
      // `dig`/`associations`.
      copyPayload={{
        fieldTuning: { sfMap, dust: { sfMapSeeding: dust.sfMapSeeding, sweptMix: dust.sweptMix } },
      }}
    >
      <div className={styles.root}>
        <label className={styles.toggleRow}>
          <span>Generator</span>
          <select
            className={styles.select}
            value={sfMap.generator}
            onChange={(e) =>
              patchSfMap({ generator: e.target.value as GalaxySfMapGeneratorKind })
            }
          >
            <option value="automaton">Automaton (SSPSF)</option>
            <option value="fluid">Fluid (advection)</option>
          </select>
        </label>
        {/* Lives on `fieldTuning.dust`, not `sfMap`, since it gates the DUST
            tier's consumption of the active generator's output rather than a
            parameter of either generator — shown here anyway, beside the
            map it reads. */}
        <label className={styles.toggleRow}>
          <span>Seed dust from gas</span>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={dust.sfMapSeeding}
            onChange={(e) =>
              dispatch(
                fieldTuningPatched({
                  dust: { ...dust, sfMapSeeding: e.target.checked },
                }),
              )
            }
          />
        </label>
        <ParamSlider
          label="Swept mix"
          value={dust.sweptMix}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchDust({ sweptMix: v })}
          path="fieldTuning.dust.sweptMix"
          info="0 = today's placement density (gas x accumulated activity, time-integrates the swept AREA). 1 = the conserved swept-dust channel alone — a short-memory front tracer, so walls read as thin bright rims around dark cavities instead of a broad smear. Lives on the dust tier (like 'Seed dust from gas' above) but shown here beside the map both consumers read."
        />

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
      </div>
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
      <CollapsibleSection
        title="FLUID"
        open={fluidOpen}
        onToggle={() => dispatch(sectionToggled('sfMapFluid'))}
        copyPayload={{ fieldTuning: { sfMapFluid: fluid } }}
        nested
      >
        <div className={styles.root}>
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
          <ParamSlider
            label="Gas regen"
            value={fluid.gasRegen}
            min={0}
            max={0.2}
            step={0.002}
            format={(v) => v.toFixed(3)}
            onChange={(v) => patchFluid({ gasRegen: v })}
            path="fieldTuning.sfMapFluid.gasRegen"
            info="Gas relaxation rate toward 1.0 per step, applied after advection — this generator's own contrast knob."
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
            info="Blend rate of the per-texel oldActivity trace toward this step's event intensity (w' = mix(w, eventStamp, emaRate)) — an EMA, not the automaton's decay+gain pair."
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default SfMapSection;
