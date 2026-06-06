/**
 * ControlsPanel — the data-driven control surface, wired to the store.
 *
 * It reads the active flow mode and renders THAT mode's slider specs (advect
 * adds wander + uses tighter ranges; streamline omits wander), plus the density
 * intensity slider when the density layer is on. Layer enables, the labels and
 * auto-rotate toggles, and a reset-view button round it out. Every control reads
 * its value from the store via a stable selector and writes back through a slice
 * reducer — the panel itself holds no state.
 *
 * Chrome comes from the shared `common/Panel` (glass card + collapsible header)
 * so it matches the main app; the controls are this tool's primitives.
 */
import type { ReactNode } from 'react';
import type { FlowModeParams } from '../../../@types/state/slices/FlowModeParams';
import type { VolumeSlice } from '../../../@types/state/slices/VolumeSlice';
import { Panel } from '../../../../../src/components/common/Panel/Panel';
import Button from '../../../../../src/components/common/Button/Button';
import { useStore } from '../../state/useStore';
import { selectActiveFlowParams } from '../../state/selectors';
import { setFlowMode, setFlowParam } from '../../state/slices/flowSlice';
import { toggleLayer } from '../../state/slices/viewSlice';
import { setVolumeParam } from '../../state/slices/volumeSlice';
import { setLabelsEnabled } from '../../state/slices/labelsSlice';
import { setAutoRotate, defaultCameraSlice } from '../../state/slices/cameraSlice';
import { FLOW_PARAM_SPECS, FLOW_ADVECT_PARAM_SPECS } from '../../visualizations/flowField/params';
import { VOLUME_PARAM_SPECS } from '../../visualizations/densityVolume/params';
import { useAppStore } from '../storeContext';
import Slider from '../Slider/Slider';
import Toggle from '../Toggle/Toggle';
import ModeTabs from '../ModeTabs/ModeTabs';
import LayerToggles from '../LayerToggles/LayerToggles';
import styles from './ControlsPanel.module.css';

function ControlsPanel(): ReactNode {
  const store = useAppStore();
  const mode = useStore(store, (s) => s.flow.mode);
  const flowParams = useStore(store, selectActiveFlowParams);
  const view = useStore(store, (s) => s.view);
  const volume = useStore(store, (s) => s.volume);
  const labelsOn = useStore(store, (s) => s.labels.enabled);
  const autoRotate = useStore(store, (s) => s.camera.autoRotate);

  const flowSpecs = mode === 'advect' ? FLOW_ADVECT_PARAM_SPECS : FLOW_PARAM_SPECS;

  return (
    <div className={styles.panel}>
      <Panel title="Cosmic Flow">
        <div className={styles.body}>
          <ModeTabs
            mode={mode}
            onSelect={(m) => store.setState((s) => ({ ...s, flow: setFlowMode(s.flow, m) }))}
          />

          <div className={styles.sliders}>
            {flowSpecs.map((spec) => (
              <Slider
                key={spec.id}
                spec={spec}
                value={flowParams[spec.id as keyof FlowModeParams]}
                onChange={(v) =>
                  store.setState((s) => ({
                    ...s,
                    flow: setFlowParam(s.flow, s.flow.mode, spec.id as keyof FlowModeParams, v),
                  }))
                }
              />
            ))}
            {view.densityVolume &&
              VOLUME_PARAM_SPECS.map((spec) => (
                <Slider
                  key={spec.id}
                  spec={spec}
                  value={volume[spec.id as keyof VolumeSlice]}
                  onChange={(v) =>
                    store.setState((s) => ({
                      ...s,
                      volume: setVolumeParam(s.volume, spec.id as keyof VolumeSlice, v),
                    }))
                  }
                />
              ))}
          </div>

          <LayerToggles
            flowField={view.flowField}
            densityVolume={view.densityVolume}
            onToggle={(layer) =>
              store.setState((s) => ({ ...s, view: toggleLayer(s.view, layer) }))
            }
          />

          <div className={styles.row}>
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
                // reset the orbit pose, keep the engine-written viewProj for this frame
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
