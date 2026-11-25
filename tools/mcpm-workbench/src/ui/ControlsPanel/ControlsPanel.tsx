/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the rendering. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode (and the
 * grid box, in DataPanel's Selection) are structural — `watchSceneSaga` watches those actions and rebuilds
 * the harness (debounced). Simulation's header pill runs and pauses the sim;
 * Rendering's header dropdown picks the one renderer and its rows, and the
 * Galaxies pill adds the catalog dots on top of it.
 */
import { useState, type ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import SubsectionGroup from './SubsectionGroup';
import ButtonTip from '../ButtonTip/ButtonTip';
import { clearTraceRequested, resetRequested } from '../../state/commands';
import { setWeightMode } from '../../state/catalog/catalogSlice';
import { MCPM_PARAM_KEYS } from '../../state/exportParams';
import { setAgentCount, setInitMode, setRunning, setSimParam } from '../../state/sim/simSlice';
import {
  setGalaxyIntensity,
  setGalaxyPointSize,
  setRenderer,
  setShowGalaxies,
} from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import EyeIcon from '../../../../../src/components/icons/EyeIcon/EyeIcon';
import SimulationStatusIcon from '../SimulationStatusIcon/SimulationStatusIcon';
import SpiralIcon from '../icons/SpiralIcon/SpiralIcon';
import PanelSection from '../PanelSection/PanelSection';
import PanelRow from '../PanelRow/PanelRow';
import Select from '../Select/Select';
import SliderRow from '../SliderRow/SliderRow';
import ToggleRow from '../ToggleRow/ToggleRow';
import { PARAM_SLIDER_SPECS } from './utils/PARAM_SLIDER_SPECS';
import { RENDERER_ICONS } from './utils/RENDERER_ICONS';
import { RENDERER_LABELS } from './utils/RENDERER_LABELS';
import { RENDERER_ROWS } from './utils/RENDERER_ROWS';
import { RENDERERS } from './utils/RENDERERS';
import styles from './ControlsPanel.module.css';

export type ControlsPanelProps = {
  readonly id: string;
  readonly collapsed: boolean;
};

function ControlsPanel({ id, collapsed }: ControlsPanelProps): ReactNode {
  const dispatch = useAppDispatch();
  const sim = useAppSelector((s) => s.sim);
  const catalog = useAppSelector((s) => s.catalog);
  const view = useAppSelector((s) => s.view);
  // No open/close slice for the workbench's panel sections yet — PanelSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [renderingOpen, setRenderingOpen] = useState(false);
  const [galaxiesOpen, setGalaxiesOpen] = useState(false);
  const RendererRows = RENDERER_ROWS[view.renderer];

  return (
    <aside id={id} className={styles.root} aria-label="Simulation and rendering" inert={collapsed}>
      <div className={styles.scroll}>
        <PanelSection
          title="Simulation"
          icon={<SimulationStatusIcon size={12} />}
          open={simOpen}
          onToggle={() => setSimOpen((v) => !v)}
          on={sim.running}
          onChange={(on) => dispatch(setRunning(on))}
          toggleLabel="running"
        >
          <ToggleRow
            label="seed around data"
            on={sim.initMode === 'aroundData'}
            info="Seeds agents near catalog points instead of uniformly across the grid, so the fit converges onto the survey volume faster."
            onChange={(on) => dispatch(setInitMode(on ? 'aroundData' : 'uniform'))}
          />
          <ToggleRow
            label="weight by mass"
            on={catalog.weightMode === 'stellarMass'}
            info="Data-point deposits scale with each galaxy's stellar mass; off, every data point deposits equally. Free agents always deposit at a flat weight either way."
            onChange={(on) => dispatch(setWeightMode(on ? 'stellarMass' : 'uniform'))}
          />
          {/* reset / clear trace: momentary commands, not state — `state/commands.ts`
              actions a saga (Task 7) takes. Divided from the toggle rows above with
              the same --border-divider hairline the section headers use, and one
              font-size step smaller than the panel's other buttons so the
              pair reads as secondary to the run/seed/weight toggles it now sits under. */}
          <PanelRow>
            <div className={styles.simActions}>
              <ButtonTip
                tip="Re-seeds the agents, clears the trace and step count, and reframes the camera."
                align="start"
              >
                {(describedBy) => (
                  <Button
                    className={styles.simActionButton}
                    aria-describedby={describedBy}
                    onClick={() => dispatch(resetRequested())}
                  >
                    reset
                  </Button>
                )}
              </ButtonTip>
              <ButtonTip tip="Clears the trace; agents keep their positions." align="end">
                {(describedBy) => (
                  <Button
                    className={styles.simActionButton}
                    aria-describedby={describedBy}
                    onClick={() => dispatch(clearTraceRequested())}
                  >
                    clear trace
                  </Button>
                )}
              </ButtonTip>
            </div>
          </PanelRow>
          <SubsectionGroup title="Agents">
            {MCPM_PARAM_KEYS.map((id) => {
              const spec = PARAM_SLIDER_SPECS[id];
              return (
                <SliderRow
                  key={id}
                  label={spec.label}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  info={spec.info}
                  value={sim.params[id]}
                  onChange={(v) => dispatch(setSimParam({ key: id, value: v }))}
                  path={`sim.params.${id}`}
                />
              );
            })}
            <SliderRow
              label="agent count"
              min={1_000_000}
              max={10_000_000}
              step={100_000}
              value={sim.agentCount}
              format={(v) => `${(v / 1_000_000).toFixed(1)}M`}
              displayed={{ fromValue: (v) => v / 1_000_000, toValue: (m) => m * 1_000_000 }}
              info="Structural: changing it rebuilds the harness and reseeds the swarm."
              onChange={(v) => dispatch(setAgentCount(v))}
              path="sim.agentCount"
            />
          </SubsectionGroup>
        </PanelSection>

        <PanelSection
          title="Rendering"
          icon={<EyeIcon size={12} />}
          open={renderingOpen}
          onToggle={() => setRenderingOpen((v) => !v)}
          contentKey={view.renderer}
          control={
            <Select
              value={view.renderer}
              options={RENDERERS}
              labels={RENDERER_LABELS}
              icons={RENDERER_ICONS}
              onChange={(renderer) => dispatch(setRenderer(renderer))}
              aria-label="Renderer"
            />
          }
        >
          <RendererRows />
        </PanelSection>

        {/* An overlay on top of whichever renderer is chosen, so its own pill. */}
        <PanelSection
          title="Galaxies"
          icon={<SpiralIcon size={12} />}
          open={galaxiesOpen}
          onToggle={() => setGalaxiesOpen((v) => !v)}
          on={view.showGalaxies}
          onChange={(on) => dispatch(setShowGalaxies(on))}
        >
          <SliderRow
            label="intensity"
            value={view.galaxies.intensity}
            min={0.05}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            info="Brightness of each catalog dot, before its own mass weighting."
            onChange={(v) => dispatch(setGalaxyIntensity(v))}
            path="view.galaxies.intensity"
          />
          <SliderRow
            label="point size (px)"
            value={view.galaxies.pointSizePx}
            min={0.5}
            max={8}
            step={0.5}
            format={(v) => v.toFixed(1)}
            info="Screen-space dot radius — constant with distance, so far galaxies stay visible."
            onChange={(v) => dispatch(setGalaxyPointSize(v))}
            path="view.galaxies.pointSizePx"
          />
        </PanelSection>
      </div>
    </aside>
  );
}

export default ControlsPanel;
