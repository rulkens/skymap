/**
 * ControlsPanel — the control surface, wired to the canonical FlowSettings store.
 *
 * Phase E flattened the store: the flow slice IS `FlowSettings` now, so the panel
 * binds directly to its fields rather than a per-mode params object. It renders a
 * mode segmented control, the flat numeric knobs as sliders, an enable toggle,
 * the labels + auto-rotate toggles, and a reset-view button. `wander` is
 * advect-only (the streamline integrator ignores it), so it's hidden in
 * streamline mode — matching the renderer's behaviour.
 *
 * Each slider's value reads from `s.flow` and writes back through `setFlowParam`
 * (keyed by `NumericFlowKey`, so a number can't land in a non-numeric field).
 * Slider ranges/steps mirror the main app's DebugPanel FlowTuningSection so the
 * two tuning surfaces feel the same: count's ceiling is `MAX_PARTICLES` (the
 * buffer capacity == slider top end). The panel holds no state.
 *
 * Chrome comes from the shared `common/Panel` (glass card + collapsible header)
 * so it matches the main app; the controls are this tool's primitives.
 */
import type { ReactNode } from 'react';
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';
import type { NumericFlowKey } from '../../state/slices/flowSlice';
import { MAX_PARTICLES } from '../../../../../src/data/flow/flowFieldConstants';
import { Panel } from '../../../../../src/components/common/Panel/Panel';
import Button from '../../../../../src/components/common/Button/Button';
import { useStore } from '../../state/useStore';
import { setFlowEnabled, setFlowMode, setFlowParam } from '../../state/slices/flowSlice';
import { setLabelsEnabled } from '../../state/slices/labelsSlice';
import { setAutoRotate, defaultCameraSlice } from '../../state/slices/cameraSlice';
import { useAppStore } from '../storeContext';
import Slider from '../Slider/Slider';
import Toggle from '../Toggle/Toggle';
import ModeTabs from '../ModeTabs/ModeTabs';
import styles from './ControlsPanel.module.css';

// One spec per numeric FlowSettings knob. `id` is the NumericFlowKey the value
// is read from and written under — ranges/steps mirror the main app's
// DebugPanel FlowTuningSection so both tuning surfaces match. `wander` is
// advect-only (the streamline shader ignores it) and is filtered below.
type FlowSliderSpec = SliderSpec & { readonly id: NumericFlowKey; readonly advectOnly?: boolean };

const FLOW_SLIDER_SPECS: readonly FlowSliderSpec[] = [
  { id: 'intensity', label: 'intensity', min: 0, max: 1, step: 0.01 },
  { id: 'count', label: 'count', min: 0, max: MAX_PARTICLES, step: 1000 },
  { id: 'trail', label: 'trail', min: 0, max: 0.05, step: 0.001 },
  { id: 'flowSpeed', label: 'speed', min: 0, max: 0.6, step: 0.005 },
  { id: 'densityBias', label: 'density bias', min: 0, max: 1, step: 0.01 },
  { id: 'wander', label: 'wander', min: 0, max: 0.5, step: 0.005, advectOnly: true },
  { id: 'boundaryFadeWidth', label: 'boundary fade', min: 0, max: 0.5, step: 0.01 },
];

function ControlsPanel(): ReactNode {
  const store = useAppStore();
  const flow = useStore(store, (s) => s.flow);
  const labelsOn = useStore(store, (s) => s.labels.enabled);
  const autoRotate = useStore(store, (s) => s.camera.autoRotate);

  const specs = FLOW_SLIDER_SPECS.filter((spec) => !spec.advectOnly || flow.mode === 'advect');

  return (
    <div className={styles.panel}>
      <Panel title="Flow Workbench">
        <div className={styles.body}>
          <ModeTabs
            mode={flow.mode}
            onSelect={(m) => store.setState((s) => ({ ...s, flow: setFlowMode(s.flow, m) }))}
          />

          <div className={styles.sliders}>
            {specs.map((spec) => (
              <Slider
                key={spec.id}
                spec={spec}
                value={flow[spec.id]}
                onChange={(v) =>
                  store.setState((s) => ({ ...s, flow: setFlowParam(s.flow, spec.id, v) }))
                }
              />
            ))}
          </div>

          <div className={styles.row}>
            <Toggle
              label="flow"
              on={flow.enabled}
              onToggle={() =>
                store.setState((s) => ({ ...s, flow: setFlowEnabled(s.flow, !s.flow.enabled) }))
              }
            />
            <Toggle
              label="labels"
              on={labelsOn}
              onToggle={() =>
                store.setState((s) => ({
                  ...s,
                  labels: setLabelsEnabled(s.labels, !s.labels.enabled),
                }))
              }
            />
            <Toggle
              label="rotate"
              on={autoRotate}
              onToggle={() =>
                store.setState((s) => ({
                  ...s,
                  camera: setAutoRotate(s.camera, !s.camera.autoRotate),
                }))
              }
            />
          </div>

          <Button
            onClick={() =>
              store.setState((s) => ({
                ...s,
                // reset the orbit pose, keep the harness-written viewProj for this frame
                camera: { ...defaultCameraSlice, viewProj: s.camera.viewProj },
              }))
            }
          >
            reset view
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export default ControlsPanel;
