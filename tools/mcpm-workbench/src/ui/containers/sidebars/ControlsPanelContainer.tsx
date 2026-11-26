/**
 * ControlsPanelContainer — store boundary for the Simulation and Galaxies sections and the
 * renderer pick. Each value is its own subscription; the renderer rows have containers of
 * their own, so a rendering knob never re-renders the panel.
 */
import { memo, useCallback, type ReactNode } from 'react';
import type { CatalogSlice } from '../../../../@types/catalog/CatalogSlice';
import type { AgentInitMode } from '../../../../@types/sim/AgentInitMode';
import type { McpmParams } from '../../../../@types/sim/McpmParams';
import type { RendererId } from '../../../../@types/view/RendererId';
import type { ViewSlice } from '../../../../@types/view/ViewSlice';
import { setWeightMode } from '../../../state/catalog/catalogSlice';
import { clearTraceRequested, resetRequested } from '../../../state/commands';
import { selectSimRunning } from '../../../state/sim/selectSimRunning';
import { setAgentCount, setInitMode, setRunning, setSimParam } from '../../../state/sim/simSlice';
import {
  setGalaxyIntensity,
  setGalaxyPointSize,
  setRenderer,
  setShowGalaxies,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import ControlsPanel from '../../sidebars/ControlsPanel/ControlsPanel';

export type ControlsPanelContainerProps = {
  readonly id: string;
  readonly collapsed: boolean;
};

function ControlsPanelContainer({ id, collapsed }: ControlsPanelContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  // The status icon's truth: a lost device stops the sim but leaves `sim.running` set.
  const running = useAppSelector(selectSimRunning);
  const deviceLost = useAppSelector((s) => s.view.deviceLost);
  const initMode = useAppSelector((s) => s.sim.initMode);
  const weightMode = useAppSelector((s) => s.catalog.weightMode);
  const params = useAppSelector((s) => s.sim.params);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const renderer = useAppSelector((s) => s.view.renderer);
  const showGalaxies = useAppSelector((s) => s.view.showGalaxies);
  const galaxies = useAppSelector((s) => s.view.galaxies);

  const onRunningChange = useCallback((on: boolean) => dispatch(setRunning(on)), [dispatch]);
  const onInitModeChange = useCallback(
    (mode: AgentInitMode) => dispatch(setInitMode(mode)),
    [dispatch],
  );
  const onWeightModeChange = useCallback(
    (mode: CatalogSlice['weightMode']) => dispatch(setWeightMode(mode)),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetRequested()), [dispatch]);
  const onClearTrace = useCallback(() => dispatch(clearTraceRequested()), [dispatch]);
  const onParamChange = useCallback(
    (key: keyof McpmParams, value: number) => dispatch(setSimParam({ key, value })),
    [dispatch],
  );
  const onAgentCountChange = useCallback(
    (count: number) => dispatch(setAgentCount(count)),
    [dispatch],
  );
  const onRendererChange = useCallback(
    (next: RendererId) => dispatch(setRenderer(next)),
    [dispatch],
  );
  const onShowGalaxiesChange = useCallback(
    (on: boolean) => dispatch(setShowGalaxies(on)),
    [dispatch],
  );
  const onGalaxiesChange = useCallback(
    (key: keyof ViewSlice['galaxies'], value: number) =>
      dispatch(key === 'intensity' ? setGalaxyIntensity(value) : setGalaxyPointSize(value)),
    [dispatch],
  );

  return (
    <ControlsPanel
      id={id}
      collapsed={collapsed}
      running={running}
      runningDisabled={deviceLost}
      initMode={initMode}
      weightMode={weightMode}
      params={params}
      agentCount={agentCount}
      renderer={renderer}
      showGalaxies={showGalaxies}
      galaxies={galaxies}
      onRunningChange={onRunningChange}
      onInitModeChange={onInitModeChange}
      onWeightModeChange={onWeightModeChange}
      onReset={onReset}
      onClearTrace={onClearTrace}
      onParamChange={onParamChange}
      onAgentCountChange={onAgentCountChange}
      onRendererChange={onRendererChange}
      onShowGalaxiesChange={onShowGalaxiesChange}
      onGalaxiesChange={onGalaxiesChange}
    />
  );
}

export default memo(ControlsPanelContainer);
