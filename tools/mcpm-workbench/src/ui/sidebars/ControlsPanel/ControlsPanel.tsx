/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the rendering. Every slider writes straight to the sim
 * slice; the harness reads `params` fresh each step, so these are live with no
 * rebuild. Agent count, weight mode and init mode (and the Selection, in
 * DataPanel) are structural: `watchSceneSaga` rebuilds the harness, debounced. Simulation's header pill runs and pauses the sim;
 * Rendering's header dropdown picks the one renderer and its rows, and the
 * Galaxies pill adds the catalog dots on top of it.
 */
import { useState, type ReactNode } from 'react';
import Button from '../../../../../../packages/shared/src/components/common/Button/Button';
import EyeIcon from '../../../../../../packages/shared/src/components/icons/EyeIcon/EyeIcon';
import type { CatalogSlice } from '../../../../@types/catalog/CatalogSlice';
import type { AgentInitMode } from '../../../../@types/sim/AgentInitMode';
import type { McpmParams } from '../../../../@types/sim/McpmParams';
import type { RendererId } from '../../../../@types/view/RendererId';
import type { ViewSlice } from '../../../../@types/view/ViewSlice';
import { MCPM_PARAM_KEYS } from '../../../params/mcpmParamKeys.constant';
import SimulationStatusIconContainer from '../../containers/sim/SimulationStatusIconContainer';
import SimulationTipContainer from '../../containers/sim/SimulationTipContainer';
import SpiralIcon from '../../../../../../src/components/icons/SpiralIcon/SpiralIcon';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import PanelRow from '../../panel/PanelRow/PanelRow';
import PanelSection from '../../panel/PanelSection/PanelSection';
import Select from '../../../../../../src/components/common/Select/Select';
import SliderRows from '../../panel/SliderRows/SliderRows';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
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
  readonly running: boolean;
  readonly runningDisabled: boolean;
  readonly initMode: AgentInitMode;
  readonly weightMode: CatalogSlice['weightMode'];
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly renderer: RendererId;
  readonly showGalaxies: boolean;
  readonly galaxies: ViewSlice['galaxies'];
  readonly onRunningChange: (on: boolean) => void;
  readonly onInitModeChange: (mode: AgentInitMode) => void;
  readonly onWeightModeChange: (mode: CatalogSlice['weightMode']) => void;
  readonly onReset: () => void;
  readonly onClearTrace: () => void;
  readonly onParamChange: (key: keyof McpmParams, value: number) => void;
  readonly onAgentCountChange: (agentCount: number) => void;
  readonly onRendererChange: (renderer: RendererId) => void;
  readonly onShowGalaxiesChange: (on: boolean) => void;
  readonly onGalaxiesChange: (key: keyof ViewSlice['galaxies'], value: number) => void;
};

function ControlsPanel({
  id,
  collapsed,
  running,
  runningDisabled,
  initMode,
  weightMode,
  params,
  agentCount,
  renderer,
  showGalaxies,
  galaxies,
  onRunningChange,
  onInitModeChange,
  onWeightModeChange,
  onReset,
  onClearTrace,
  onParamChange,
  onAgentCountChange,
  onRendererChange,
  onShowGalaxiesChange,
  onGalaxiesChange,
}: ControlsPanelProps): ReactNode {
  // No open/close slice for the workbench's panel sections yet — PanelSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [renderingOpen, setRenderingOpen] = useState(false);
  const [galaxiesOpen, setGalaxiesOpen] = useState(false);
  const RendererRows = RENDERER_ROWS[renderer];

  return (
    <aside id={id} className={styles.root} aria-label="Simulation and rendering" inert={collapsed}>
      <div className={styles.scroll}>
        <PanelSection
          title="Simulation"
          icon={<SimulationStatusIconContainer size={12} />}
          iconTip={<SimulationTipContainer />}
          open={simOpen}
          onToggle={() => setSimOpen((v) => !v)}
          on={running}
          onChange={onRunningChange}
          toggleDisabled={runningDisabled}
          toggleLabel="running"
        >
          <ToggleRow
            label="seed around data"
            on={initMode === 'aroundData'}
            info="Seeds agents near catalog points instead of uniformly across the grid, so the fit converges onto the survey volume faster."
            onChange={(on) => onInitModeChange(on ? 'aroundData' : 'uniform')}
          />
          <ToggleRow
            label="weight by mass"
            on={weightMode === 'stellarMass'}
            info="Data-point deposits scale with each galaxy's stellar mass; off, every data point deposits equally. Free agents always deposit at a flat weight either way."
            onChange={(on) => onWeightModeChange(on ? 'stellarMass' : 'uniform')}
          />
          {/* reset / clear trace: momentary commands, not state (`state/commands.ts`),
              one font-size step smaller so the pair reads as secondary to the toggles. */}
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
                    onClick={onReset}
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
                    onClick={onClearTrace}
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
              values={params}
              path="sim.params"
              onChange={onParamChange}
            />
            <SliderRows
              fields={AGENT_COUNT_SLIDER_FIELDS}
              values={{ agentCount }}
              path="sim"
              onChange={(_, value) => onAgentCountChange(value)}
            />
          </SubsectionGroup>
        </PanelSection>

        <PanelSection
          title="Rendering"
          icon={<EyeIcon size={12} />}
          open={renderingOpen}
          onToggle={() => setRenderingOpen((v) => !v)}
          contentKey={renderer}
          control={
            <Select
              value={renderer}
              options={RENDERERS}
              labels={RENDERER_LABELS}
              icons={RENDERER_ICONS}
              onChange={onRendererChange}
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
          on={showGalaxies}
          onChange={onShowGalaxiesChange}
        >
          <SliderRows
            fields={GALAXIES_SLIDER_FIELDS}
            values={galaxies}
            path="view.galaxies"
            onChange={onGalaxiesChange}
          />
        </PanelSection>
      </div>
    </aside>
  );
}

export default ControlsPanel;
