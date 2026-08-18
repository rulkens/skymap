/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — Viewport watches them and rebuilds the harness.
 */
import type { ReactNode } from 'react';
import type { McpmParams } from '../../@types/McpmParams';
import { useStore } from '../state/useStore';
import {
  setCatalogTier,
  setWeightMode,
} from '../state/slices/catalogSlice';
import {
  requestClearTrace,
  requestReset,
  setAgentCount,
  setInitMode,
  setRunning,
  setSimParam,
} from '../state/slices/simSlice';
import { useAppStore } from './storeContext';
import Slider from './Slider';
import Toggle from './Toggle';
import GridBoxPanel from './GridBoxPanel';

type ParamSliderSpec = {
  readonly id: keyof McpmParams;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
};

// Ranges are workbench UI convenience, not physics — wide enough to explore
// well past the SDSS-VAC preset in either direction.
const PARAM_SLIDER_SPECS: readonly ParamSliderSpec[] = [
  { id: 'senseSpreadDeg', label: 'sense spread (deg)', min: 0, max: 90, step: 0.5 },
  { id: 'senseDistanceMpc', label: 'sense distance (Mpc)', min: 0, max: 20, step: 0.1 },
  { id: 'turnAngleDeg', label: 'turn angle (deg)', min: 0, max: 90, step: 0.5 },
  { id: 'moveDistanceMpc', label: 'move distance (Mpc)', min: 0, max: 2, step: 0.01 },
  { id: 'depositValue', label: 'deposit value', min: 0, max: 10, step: 0.1 },
  { id: 'persistence', label: 'persistence', min: 0, max: 1, step: 0.01 },
  { id: 'sharpness', label: 'sharpness', min: 0, max: 10, step: 0.1 },
  { id: 'normalizationFactor', label: 'normalization', min: 0, max: 5, step: 0.05 },
];

function ControlsPanel(): ReactNode {
  const store = useAppStore();
  const sim = useStore(store, (s) => s.sim);
  const catalog = useStore(store, (s) => s.catalog);

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
      <div>
        {PARAM_SLIDER_SPECS.map((spec) => (
          <Slider
            key={spec.id}
            label={spec.label}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={sim.params[spec.id]}
            onChange={(v) =>
              store.setState((s) => ({ ...s, sim: setSimParam(s.sim, spec.id, v) }))
            }
          />
        ))}
      </div>

      <Slider
        label="agent count"
        min={1_000_000}
        max={10_000_000}
        step={100_000}
        value={sim.agentCount}
        format={(v) => `${(v / 1_000_000).toFixed(1)}M`}
        onChange={(v) => store.setState((s) => ({ ...s, sim: setAgentCount(s.sim, v) }))}
      />

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
        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-sm)', color: 'var(--color-fg-label)' }}>
          tier
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          {(['small', 'medium', 'large'] as const).map((tier) => (
            <Toggle
              key={tier}
              label={tier}
              on={catalog.tier === tier}
              onToggle={() => store.setState((s) => ({ ...s, catalog: setCatalogTier(s.catalog, tier) }))}
            />
          ))}
        </div>
      </div>

      <GridBoxPanel />
    </div>
  );
}

export default ControlsPanel;
