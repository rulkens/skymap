/**
 * SfMapSection — the SSPSF cellular automaton (`GalaxyFieldTuning.sfMap`,
 * `src/@types/galaxy/GalaxySfMapParams.ts`). Nested under `fieldTuning.sfMap`
 * rather than a flat field, same spreading-patch idiom as `DustSection`'s
 * `patchDust`. Nobody has tuned this yet, so every range here is
 * deliberately wide — see the field docblocks for what each knob does and
 * `defaultGalaxySfMapParams.ts` for why `spread` alone gets a fine step.
 *
 * The COUPLING readout at the bottom is permanent, not a one-off debug
 * print: "sliders don't move the dust" has three structurally different
 * causes (readback never landed, automaton has no measurable structure,
 * or the coupling works but the measured orientation already agrees with
 * the arm tangent), and only these three numbers tell them apart.
 */
import type { ReactNode } from 'react';
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
  const dust = useAppSelector((state) => state.fieldTuning.dust);
  const open = useAppSelector((state) => state.ui.openSections.sfMap);

  const patchSfMap = (patch: Partial<GalaxySfMapParams>): void => {
    dispatch(fieldTuningPatched({ sfMap: { ...sfMap, ...patch } }));
  };

  return (
    <CollapsibleSection
      title="SF MAP"
      open={open}
      onToggle={() => dispatch(sectionToggled('sfMap'))}
      headerToggle={sfMap.enabled}
      onHeaderToggleChange={(value) => patchSfMap({ enabled: value })}
      // `dust.sfMapSeeding` rides along because this section's checkbox writes
      // it, even though it lives on the dust tier — see that control's comment.
      copyPayload={{ fieldTuning: { sfMap, dust: { sfMapSeeding: dust.sfMapSeeding } } }}
    >
      <div className={styles.root}>
        <ParamSlider
          label="Steps"
          value={sfMap.steps}
          min={1}
          max={200}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ steps: Math.round(v) })}
          path="fieldTuning.sfMap.steps"
          info="Automaton iterations per rebuild. Structure coarsens with more steps; the shear winds it. Rebuild latency is linear in this — the dominant cost of a slider drag."
        />
        <ParamSlider
          label="Base ignition"
          value={sfMap.baseIgnition}
          min={0}
          max={0.002}
          step={0.00005}
          format={(v) => v.toFixed(5)}
          onChange={(v) => patchSfMap({ baseIgnition: v })}
          path="fieldTuning.sfMap.baseIgnition"
          info="Spontaneous ignition probability per cell per step, independent of neighbours — the seed that keeps a quiet disc from dying out. Seeds should be RARE: propagation does the work, and the whole grid rolls this every step."
        />
        <ParamSlider
          label="Spread"
          value={sfMap.spread}
          min={0}
          max={0.5}
          step={0.002}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ spread: v })}
          path="fieldTuning.sfMap.spread"
          info="Added ignition probability per already-ignited neighbour. Two thresholds, and the higher one is what governs whether SPURS form: 1/8 = 0.125 is where a cell with all eight neighbours lit becomes critical, but the cells behind a front are refractory and gas-depleted, so only its leading edge propagates — with ~3 live neighbours there, fronts need ~1/3 to survive and grow. Below that the disc only ever shows short-lived isolated blobs."
        />
        <ParamSlider
          label="Refractory steps"
          value={sfMap.refractorySteps}
          min={1}
          max={30}
          step={1}
          format={(v) => String(Math.round(v))}
          onChange={(v) => patchSfMap({ refractorySteps: Math.round(v) })}
          path="fieldTuning.sfMap.refractorySteps"
          info="Steps a cell stays spent before its gas can ignite again. Sets the width of the trailing wake behind a propagating front."
        />
        <ParamSlider
          label="Gas regen"
          value={sfMap.gasRegen}
          min={0}
          max={0.1}
          step={0.002}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ gasRegen: v })}
          path="fieldTuning.sfMap.gasRegen"
          info="Gas recovered per step as a fraction of full — the star/gas feedback the original stars-only model lacked. Recovery takes 1/gasRegen steps, so this is the CONTRAST knob: it sets how long a burnt void stays a void rather than simmering back."
        />
        <ParamSlider
          label="Activity decay"
          value={sfMap.activityDecay}
          min={0.9}
          max={1}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ activityDecay: v })}
          path="fieldTuning.sfMap.activityDecay"
          info="Per-step multiplier on the trailing 'old activity' trace the overlay's structure is mostly made of. At 1.0 the channel integrates the WHOLE run, everywhere a front ever passed; below that it forgets with half-life ln(0.5)/ln(decay) steps. Raising this toward 1 without lowering gain saturates the channel to flat white — and flat white reads as 'no structure' exactly like flat black does."
        />
        <ParamSlider
          label="Activity gain"
          value={sfMap.activityGain}
          min={0.005}
          max={0.5}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ activityGain: v })}
          path="fieldTuning.sfMap.activityGain"
          info="Added to the activity trace on each ignition. Its steady state at firing period T is gain/(1 - decay^T), so this is NOT independent of decay: a sparse regime (long T) needs a much bigger gain than a busy one just to stay visible, and too much saturates the channel flat instead."
        />
        <ParamSlider
          label="Arm forcing"
          value={sfMap.armForcing}
          min={0}
          max={0.1}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ armForcing: v })}
          path="fieldTuning.sfMap.armForcing"
          info="How much the spiral ridge raises local ignition probability, per step. 0 makes the automaton blind to the arms and the output goes purely flocculent. Past ~0.06 the arms IGNITE rather than bias — a forced cell then fires as often as its refractory window allows, whatever spread does."
        />
        <ParamSlider
          label="Arm flux ref"
          value={sfMap.armFluxRef}
          min={0.05}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSfMap({ armFluxRef: v })}
          path="fieldTuning.sfMap.armFluxRef"
          info="Shear magnitude (texels/step) at which arm forcing saturates to full strength. Forcing weights by |shear|/armFluxRef, which sends corotation (shear = 0) to a DEFICIT instead of the residence-time ring the raw forcing term produces there — lower this to widen the deficit band, raise it to narrow it."
        />
        <ParamSlider
          label="Dust floor fraction"
          value={sfMap.dustFloorFraction}
          min={0}
          max={1}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => patchSfMap({ dustFloorFraction: v })}
          path="fieldTuning.sfMap.dustFloorFraction"
          info="On ignition a cell keeps this fraction of its own dust; the rest sweeps onto its 8 neighbours (the snowplough rule). Lower carves darker cavities behind an advancing front. Colliding fronts pile dust past ambient into the rim by design — that overshoot is never clamped."
        />
        <ParamSlider
          label="Corotation radius"
          value={sfMap.corotationRadius}
          min={1}
          max={20}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(v) => patchSfMap({ corotationRadius: v })}
          path="fieldTuning.sfMap.corotationRadius"
          info="Generator units. Sets the pattern speed the shear is measured against — shear vanishes at corotation and reverses across it."
        />
        <ParamSlider
          label="Shear rate"
          value={sfMap.shearRate}
          min={0}
          max={0.5}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(v) => patchSfMap({ shearRate: v })}
          path="fieldTuning.sfMap.shearRate"
          info="Angular offset scale per step, in radians at unit (1/r - 1/corotationRadius). Total winding is shearRate * steps, so dropping steps to 100 cut the wind by 3x — expect to raise this to get the same pitch back."
        />
        {/* Lives on `fieldTuning.dust`, not `sfMap`, since it gates the DUST
            tier's consumption of this automaton's output rather than a
            parameter of the automaton itself — shown here anyway, beside
            the map it reads. */}
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
    </CollapsibleSection>
  );
}

export default SfMapSection;
