/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — `watchSceneSaga` watches those actions and rebuilds
 * the harness (debounced). Simulation's header pill runs and pauses the sim;
 * the Raymarch / Agents / Galaxies / Path tracer sections are the four render
 * layers, each switched by its header pill, and any subset may be on.
 */
import { useState, type ReactNode } from 'react';
import type { ViewSlice } from '../../../@types/ViewSlice';
import Button from '../../../../../src/components/common/Button/Button';
import SubsectionGroup from './SubsectionGroup';
import { clearTraceRequested, resetRequested } from '../../state/commands';
import { setWeightMode } from '../../state/catalog/catalogSlice';
import { MCPM_PARAM_KEYS } from '../../state/exportParams';
import { setAgentCount, setInitMode, setRunning, setSimParam } from '../../state/sim/simSlice';
import {
  setAdditive,
  setAgentIntensity,
  setAgentPointSize,
  setDivisor,
  setGalaxyIntensity,
  setGalaxyPointSize,
  setLayerEnabled,
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerPaletteId,
  setPathTracerParam,
  setPathTracerSampleCap,
  setPreviewPacked,
  setRaymarchPaletteId,
  setRaymarchParam,
} from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import FileActions from '../FileActions/FileActions';
import PaletteRow from '../PaletteRow/PaletteRow';
import PanelSection from '../PanelSection/PanelSection';
import PanelRow from '../PanelRow/PanelRow';
import SliderRow from '../SliderRow/SliderRow';
import ToggleRow from '../ToggleRow/ToggleRow';
import GridBoxPanel from '../GridBoxPanel/GridBoxPanel';
import { PALETTE_INFO } from './utils/PALETTE_INFO';
import { PARAM_SLIDER_SPECS } from './utils/PARAM_SLIDER_SPECS';
import { PATHTRACER_SLIDERS } from './utils/PATHTRACER_SLIDERS';
import { RAYMARCH_SLIDERS } from './utils/RAYMARCH_SLIDERS';
import styles from './ControlsPanel.module.css';

function ControlsPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const sim = useAppSelector((s) => s.sim);
  const catalog = useAppSelector((s) => s.catalog);
  const view = useAppSelector((s) => s.view);
  // No open/close slice for the workbench's panel sections yet — PanelSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [gridBoxOpen, setGridBoxOpen] = useState(true);
  const [raymarchOpen, setRaymarchOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [galaxiesOpen, setGalaxiesOpen] = useState(false);
  const [pathTracerOpen, setPathTracerOpen] = useState(false);
  const toggleLayer = (layer: keyof ViewSlice['layers']) => (on: boolean) =>
    dispatch(setLayerEnabled({ layer, on }));

  return (
    <aside className={styles.root} aria-label="Simulation and rendering">
      <div className={styles.scroll}>
        <PanelSection
          title="Simulation"
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
              <Button className={styles.simActionButton} onClick={() => dispatch(resetRequested())}>
                reset
              </Button>
              <Button
                className={styles.simActionButton}
                onClick={() => dispatch(clearTraceRequested())}
              >
                clear trace
              </Button>
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
              info="Structural: changing it rebuilds the harness and reseeds the swarm."
              onChange={(v) => dispatch(setAgentCount(v))}
              path="sim.agentCount"
            />
          </SubsectionGroup>
        </PanelSection>

        <PanelSection
          title="Selection"
          open={gridBoxOpen}
          onToggle={() => setGridBoxOpen((v) => !v)}
        >
          <GridBoxPanel />
        </PanelSection>

        {/* Three INDEPENDENT layers, each switched by its own header pill — not a mode
            picker. Section order is the compositing order Viewport encodes them in. */}
        <PanelSection
          title="Raymarch"
          open={raymarchOpen}
          onToggle={() => setRaymarchOpen((v) => !v)}
          on={view.layers.raymarch}
          onChange={toggleLayer('raymarch')}
        >
          {/* Additive off is fork parity: per-slab 'over', opaque a few voxels in. */}
          <ToggleRow
            label="additive blend"
            on={view.raymarch.additive}
            info="Adds brightness along each ray, so dense regions show through. Off, nearer structure hides what is behind it, as in Polyphorm."
            onChange={(on) => dispatch(setAdditive(on))}
          />
          {/* T18: on demand, not a mode — watchPreviewPackedSaga packs once on the
              rising edge and un-checks this itself once the sim steps past that
              snapshot. */}
          <ToggleRow
            label="preview packed export"
            on={view.raymarch.previewPacked}
            info="Marches the packed export cube (real packLogTraceVoxels) instead of the live trace — a structure check, not a brightness match. Goes stale and reverts on the next sim step."
            onChange={(on) => dispatch(setPreviewPacked(on))}
          />
          <PaletteRow
            value={view.raymarch.paletteId}
            onChange={(id) => dispatch(setRaymarchPaletteId(id))}
            info={PALETTE_INFO}
          />
          <SubsectionGroup title="Trace">
            {RAYMARCH_SLIDERS.map((spec) => (
              <SliderRow
                key={spec.key}
                label={spec.label}
                value={spec.log ? Math.log10(view.raymarch[spec.key]) : view.raymarch[spec.key]}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                format={spec.format}
                info={spec.info}
                onChange={(v) =>
                  dispatch(
                    setRaymarchParam({ key: spec.key, value: spec.log ? Math.pow(10, v) : v }),
                  )
                }
                path={`view.raymarch.${spec.key}`}
              />
            ))}
          </SubsectionGroup>
          <SubsectionGroup title="Preview">
            <SliderRow
              label="divisor"
              value={view.raymarch.divisor}
              min={1}
              max={8}
              step={1}
              format={(v) => v.toFixed(0)}
              info="Marches into a floor(size/divisor) offscreen target and bilinear-upsamples it in, instead of straight into the frame. Fragment cost falls with the square of the divisor; 3 matches the main app's volume row."
              onChange={(v) => dispatch(setDivisor(v))}
              path="view.raymarch.divisor"
            />
          </SubsectionGroup>
        </PanelSection>

        <PanelSection
          title="Agents"
          open={agentsOpen}
          onToggle={() => setAgentsOpen((v) => !v)}
          on={view.layers.agents}
          onChange={toggleLayer('agents')}
        >
          <SliderRow
            label="intensity"
            value={view.agents.intensity}
            min={0.05}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
            info="Brightness multiplier on the resolved agent splat."
            onChange={(v) => dispatch(setAgentIntensity(v))}
            path="view.agents.intensity"
          />
          <SliderRow
            label="point size"
            value={view.agents.pointSizePx}
            min={1}
            max={8}
            step={1}
            format={(v) => v.toFixed(0)}
            info="Per-agent splat footprint, in whole pixels — the splat compute kernel writes a discrete square, unlike the Galaxies layer's continuously-sized quad."
            onChange={(v) => dispatch(setAgentPointSize(v))}
            path="view.agents.pointSizePx"
          />
        </PanelSection>

        <PanelSection
          title="Galaxies"
          open={galaxiesOpen}
          onToggle={() => setGalaxiesOpen((v) => !v)}
          on={view.layers.galaxies}
          onChange={toggleLayer('galaxies')}
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

        <PanelSection
          title="Path tracer"
          open={pathTracerOpen}
          onToggle={() => setPathTracerOpen((v) => !v)}
          on={view.layers.pathTracer}
          onChange={toggleLayer('pathTracer')}
        >
          {/* Off by default: worst case is bounces×512 tracking steps per pixel,
              far heavier than the raymarch — this is not a layer to leave on
              while exploring. */}
          <PaletteRow
            value={view.pathTracer.paletteId}
            onChange={(id) => dispatch(setPathTracerPaletteId(id))}
            info={PALETTE_INFO}
          />
          <SubsectionGroup title="Trace">
            {PATHTRACER_SLIDERS.map((spec) => (
              <SliderRow
                key={spec.key}
                label={spec.label}
                value={spec.log ? Math.log10(view.pathTracer[spec.key]) : view.pathTracer[spec.key]}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                format={spec.format}
                info={spec.info}
                onChange={(v) =>
                  dispatch(
                    setPathTracerParam({ key: spec.key, value: spec.log ? Math.pow(10, v) : v }),
                  )
                }
                path={`view.pathTracer.${spec.key}`}
              />
            ))}
          </SubsectionGroup>
          <SubsectionGroup title="Preview">
            <SliderRow
              label="path tracer divisor"
              value={view.pathTracer.divisor}
              min={1}
              max={4}
              step={1}
              format={(v) => v.toFixed(0)}
              info="Accumulates into floor(size/divisor), samples/sec up with divisor². Auto-boosts to 4 while the camera moves."
              onChange={(v) => dispatch(setPathTracerDivisor(v))}
              path="view.pathTracer.divisor"
            />
            <SliderRow
              label="sample cap"
              value={view.pathTracer.sampleCap}
              min={64}
              max={4096}
              step={64}
              format={(v) => v.toFixed(0)}
              info="Progressive accumulator stops forcing a render past this many samples (Monte Carlo noise falls as 1/sqrt(N)). Raising it while capped resumes accumulation without a reset; lowering it just goes idle sooner."
              onChange={(v) => dispatch(setPathTracerSampleCap(v))}
              path="view.pathTracer.sampleCap"
            />
          </SubsectionGroup>
          <ToggleRow
            label="compressive"
            on={view.pathTracer.compressive}
            info="Tonemap each sample before accumulating (the fork's LDR accumulation) instead of averaging linear radiance."
            onChange={(on) => dispatch(setPathTracerCompressive(on))}
          />
        </PanelSection>
      </div>
      <FileActions />
    </aside>
  );
}

export default ControlsPanel;
