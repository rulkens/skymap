/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — Viewport watches them and rebuilds the harness.
 */
import { useState, type ReactNode } from 'react';
import type { McpmParams } from '../../@types/McpmParams';
import type { ViewSlice } from '../../@types/ViewSlice';
import CollapsibleSection from '../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import SliderGroup from '../../../../src/components/common/SliderGroup/SliderGroup';
import { useStore } from '../state/useStore';
import { setCatalogTier, setWeightMode } from '../state/slices/catalogSlice';
import {
  requestClearTrace,
  requestReset,
  setAgentCount,
  setInitMode,
  setRunning,
  setSimParam,
} from '../state/slices/simSlice';
import {
  setOpticalThickness,
  setOverlayGalaxies,
  setSampleWeight,
  setStepVoxels,
  setTrimDensity,
  setViewMode,
} from '../state/slices/viewSlice';
import { useAppStore } from './storeContext';
import Toggle from './Toggle';
import GridBoxPanel from './GridBoxPanel';

type ParamSliderSpec = {
  readonly id: keyof McpmParams;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly info: string;
};

// Ranges are workbench UI convenience, not physics — wide enough to explore
// well past the SDSS-VAC preset in either direction.
const PARAM_SLIDER_SPECS: readonly ParamSliderSpec[] = [
  {
    id: 'senseSpreadDeg',
    label: 'sense spread (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Angular offset of the off-axis sense probes from the agent heading.',
  },
  {
    id: 'senseDistanceMpc',
    label: 'sense distance (Mpc)',
    min: 0,
    max: 20,
    step: 0.1,
    info: 'How far ahead the sense probes sample the deposit grid.',
  },
  {
    id: 'turnAngleDeg',
    label: 'turn angle (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Rotation toward the winning probe direction each step.',
  },
  {
    id: 'moveDistanceMpc',
    label: 'move distance (Mpc)',
    min: 0,
    max: 2,
    step: 0.01,
    info: 'Distance an agent travels per step.',
  },
  {
    id: 'depositValue',
    label: 'deposit value',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Amount each agent adds to the deposit (steering) grid per step.',
  },
  {
    id: 'persistence',
    label: 'persistence',
    min: 0,
    max: 1,
    step: 0.01,
    info: 'Fraction of the deposit grid that survives each decay step.',
  },
  {
    id: 'sharpness',
    label: 'sharpness',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Exponent on probe samples in the turn decision — higher steers harder toward the strongest signal.',
  },
  {
    id: 'normalizationFactor',
    label: 'normalization',
    min: 0,
    max: 5,
    step: 0.05,
    info: 'Rescales data-point deposits against agent deposits.',
  },
];

type RaymarchSliderKey = 'opticalThickness' | 'sampleWeight' | 'trimDensity' | 'stepVoxels';

type RaymarchSliderSpec = {
  readonly key: RaymarchSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info?: string;
  /** Present ⇒ the pill travels in log10 space: min/max/step are log10 units,
   * and `format` receives the log10 value, not the stored one. */
  readonly log?: boolean;
};

// Ranges bracket the fork's shipped defaults (viewSlice's `defaultViewSlice`
// docblock). `ParamSlider` is linear-only, so decade-spanning params map to
// log10 here at the spec seam; trimDensity's range includes 0 so it cannot.
const RAYMARCH_SLIDERS: readonly RaymarchSliderSpec[] = [
  {
    key: 'opticalThickness',
    label: 'optical thickness',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Scales how opaque a given trace density renders along the ray.',
  },
  {
    key: 'sampleWeight',
    label: 'sample weight',
    min: -7,
    max: 0,
    step: 0.05,
    log: true,
    format: (v) => Math.pow(10, v).toExponential(1),
    info: 'Inverts the ~100x steady-state amplification of the trace decay (1% retained per step).',
  },
  {
    key: 'trimDensity',
    label: 'trim density',
    min: 0,
    max: 0.5,
    step: 0.00001,
    format: (v) => v.toFixed(5),
    info: 'Trace values at or below this render as empty space.',
  },
  {
    key: 'stepVoxels',
    label: 'step voxels',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: '1 is fork-parity sampling — below 1 oversamples each voxel, above 1 skips some.',
  },
];

// The two view modes that render; ViewSlice's other two are Track V's remaining work and
// Viewport falls back to the raymarch for them, so offering them here would toggle nothing.
const VIEW_MODES: readonly { readonly mode: ViewSlice['mode']; readonly label: string }[] = [
  { mode: 'traceRaymarch', label: 'raymarch' },
  { mode: 'agentSplat', label: 'splat' },
];

const RAYMARCH_SETTERS: {
  readonly [K in RaymarchSliderKey]: (prev: ViewSlice, value: number) => ViewSlice;
} = {
  opticalThickness: setOpticalThickness,
  sampleWeight: setSampleWeight,
  trimDensity: setTrimDensity,
  stepVoxels: setStepVoxels,
};

function ControlsPanel(): ReactNode {
  const store = useAppStore();
  const sim = useStore(store, (s) => s.sim);
  const catalog = useStore(store, (s) => s.catalog);
  const view = useStore(store, (s) => s.view);
  // No open/close slice for the workbench's panel sections yet — CollapsibleSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [raymarchOpen, setRaymarchOpen] = useState(true);

  return (
    <div
      style={{
        position: 'fixed',
        top: 'var(--space-6)',
        right: 'var(--space-6)',
        display: 'grid',
        gap: 'var(--space-5)',
        padding: 'var(--space-6)',
        borderRadius: '6px',
        background: 'var(--surface-panel)',
        border: '1px solid var(--border-card)',
        width: '280px',
        maxHeight: 'calc(100vh - var(--space-6) * 2)',
        overflowY: 'auto',
      }}
    >
      <CollapsibleSection title="Simulation" open={simOpen} onToggle={() => setSimOpen((v) => !v)}>
        <SliderGroup title="Agents">
          {PARAM_SLIDER_SPECS.map((spec) => (
            <ParamSlider
              key={spec.id}
              label={spec.label}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              info={spec.info}
              value={sim.params[spec.id]}
              onChange={(v) =>
                store.setState((s) => ({ ...s, sim: setSimParam(s.sim, spec.id, v) }))
              }
              path={`sim.params.${spec.id}`}
            />
          ))}
          <ParamSlider
            label="agent count"
            min={1_000_000}
            max={10_000_000}
            step={100_000}
            value={sim.agentCount}
            format={(v) => `${(v / 1_000_000).toFixed(1)}M`}
            info="Structural: changing it rebuilds the harness and reseeds the swarm."
            onChange={(v) => store.setState((s) => ({ ...s, sim: setAgentCount(s.sim, v) }))}
            path="sim.agentCount"
          />
        </SliderGroup>
      </CollapsibleSection>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Toggle
          label={sim.running ? 'pause' : 'resume'}
          on={sim.running}
          onToggle={() => store.setState((s) => ({ ...s, sim: setRunning(s.sim, !s.sim.running) }))}
        />
        <Toggle
          label="reset"
          on={false}
          onToggle={() => store.setState((s) => ({ ...s, sim: requestReset(s.sim) }))}
        />
        <Toggle
          label="clear trace"
          on={false}
          onToggle={() => store.setState((s) => ({ ...s, sim: requestClearTrace(s.sim) }))}
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Toggle
          label="weight: mass"
          on={catalog.weightMode === 'stellarMass'}
          onToggle={() =>
            store.setState((s) => ({
              ...s,
              catalog: setWeightMode(
                s.catalog,
                s.catalog.weightMode === 'stellarMass' ? 'uniform' : 'stellarMass',
              ),
            }))
          }
        />
        <Toggle
          label="init: around data"
          on={sim.initMode === 'aroundData'}
          onToggle={() =>
            store.setState((s) => ({
              ...s,
              sim: setInitMode(s.sim, s.sim.initMode === 'aroundData' ? 'uniform' : 'aroundData'),
            }))
          }
        />
      </div>

      <div>
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-fg-label)',
          }}
        >
          tier
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          {(['small', 'medium', 'large'] as const).map((tier) => (
            <Toggle
              key={tier}
              label={tier}
              on={catalog.tier === tier}
              onToggle={() =>
                store.setState((s) => ({ ...s, catalog: setCatalogTier(s.catalog, tier) }))
              }
            />
          ))}
        </div>
      </div>

      <div>
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-fg-label)',
          }}
        >
          view
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          {VIEW_MODES.map((entry) => (
            <Toggle
              key={entry.mode}
              label={entry.label}
              on={view.mode === entry.mode}
              onToggle={() =>
                store.setState((s) => ({ ...s, view: setViewMode(s.view, entry.mode) }))
              }
            />
          ))}
          {/* Inert in splat mode: the data points are already drawn there, at 10000x. */}
          <Toggle
            label="galaxies"
            on={view.overlayGalaxies}
            onToggle={() =>
              store.setState((s) => ({
                ...s,
                view: setOverlayGalaxies(s.view, !s.view.overlayGalaxies),
              }))
            }
          />
        </div>
      </div>

      <GridBoxPanel />

      <CollapsibleSection
        title="Raymarch"
        open={raymarchOpen}
        onToggle={() => setRaymarchOpen((v) => !v)}
      >
        <SliderGroup title="Trace">
          {RAYMARCH_SLIDERS.map((spec) => (
            <ParamSlider
              key={spec.key}
              label={spec.label}
              value={spec.log ? Math.log10(view.raymarch[spec.key]) : view.raymarch[spec.key]}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              format={spec.format}
              info={spec.info}
              onChange={(v) =>
                store.setState((s) => ({
                  ...s,
                  view: RAYMARCH_SETTERS[spec.key](s.view, spec.log ? Math.pow(10, v) : v),
                }))
              }
              path={`view.raymarch.${spec.key}`}
            />
          ))}
        </SliderGroup>
      </CollapsibleSection>
    </div>
  );
}

export default ControlsPanel;
