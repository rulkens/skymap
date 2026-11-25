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
import Button from '../../../../../../src/components/common/Button/Button';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import { clearTraceRequested, resetRequested } from '../../../state/commands';
import { setWeightMode } from '../../../state/catalog/catalogSlice';
import { MCPM_PARAM_KEYS } from '../../../params/exportParams';
import { setAgentCount, setInitMode, setRunning, setSimParam } from '../../../state/sim/simSlice';
import {
  setGalaxyIntensity,
  setGalaxyPointSize,
  setRenderer,
  setShowGalaxies,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import EyeIcon from '../../../../../../src/components/icons/EyeIcon/EyeIcon';
import SimulationStatusIcon from '../../sim/SimulationStatusIcon/SimulationStatusIcon';
import SimulationTip from '../../sim/SimulationTip/SimulationTip';
import SpiralIcon from '../../icons/SpiralIcon/SpiralIcon';
import PanelSection from '../../panel/PanelSection/PanelSection';
import PanelRow from '../../panel/PanelRow/PanelRow';
import Select from '../../panel/Select/Select';
import SliderRows from '../../panel/SliderRows/SliderRows';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import { AGENT_COUNT_SLIDER_FIELDS } from './data/agentCountSliderFields.constant';
import { GALAXIES_SLIDER_FIELDS } from './data/galaxiesSliderFields.constant';
import { PARAM_SLIDER_FIELDS } from './data/paramSliderFields.constant';
import { RENDERER_ICONS } from './data/rendererIcons.constant';
import { RENDERER_LABELS } from './data/rendererLabels.constant';
import { RENDERER_ROWS } from './data/rendererRows.constant';
import { RENDERERS } from './data/renderers.constant';
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
          iconTip={<SimulationTip />}
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
            <SliderRows
              fields={MCPM_PARAM_KEYS.map((key) => PARAM_SLIDER_FIELDS[key])}
              values={sim.params}
              path="sim.params"
              onChange={(key, value) => dispatch(setSimParam({ key, value }))}
            />
            <SliderRows
              fields={AGENT_COUNT_SLIDER_FIELDS}
              values={sim}
              path="sim"
              onChange={(_, value) => dispatch(setAgentCount(value))}
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
          <SliderRows
            fields={GALAXIES_SLIDER_FIELDS}
            values={view.galaxies}
            path="view.galaxies"
            onChange={(key, value) =>
              dispatch(key === 'intensity' ? setGalaxyIntensity(value) : setGalaxyPointSize(value))
            }
          />
        </PanelSection>
      </div>
    </aside>
  );
}

export default ControlsPanel;
