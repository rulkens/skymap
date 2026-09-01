/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — `watchSceneSaga` watches those actions and rebuilds
 * the harness (debounced). The Raymarch / Agents / Galaxies / Path tracer
 * sections are the four render layers: each section's header pill IS its
 * layer's on/off switch, and any subset may be on.
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { ViewSlice } from '../../../@types/ViewSlice';
import Button from '../../../../../src/components/common/Button/Button';
import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import SliderGroup from '../../../../../src/components/common/SliderGroup/SliderGroup';
import { SOURCE_REGISTRY } from '../../../../../src/data/sources';
import { tierTarget } from '../../../../../src/data/tierTargets';
import { downloadStem } from '../../export/downloadStem';
import { triggerDownload } from '../../export/triggerDownload';
import { deriveGridBox } from '../../field/deriveGridBox';
import {
  setCatalogSources,
  setCatalogTier,
  setWeightMode,
  toggleCatalogSource,
  WORKBENCH_SOURCES,
} from '../../state/slices/catalogSlice';
import { exportParams, MCPM_PARAM_KEYS } from '../../state/exportParams';
import { installImportedBox } from '../../state/slices/gridSlice';
import { importParams } from '../../state/importParams';
import {
  requestClearTrace,
  requestExport,
  requestReset,
  requestScfdExport,
  setAgentCount,
  setInitMode,
  setRunning,
  setSimParam,
} from '../../state/slices/simSlice';
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
} from '../../state/slices/viewSlice';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/hooks';
import PaletteRow from '../PaletteRow/PaletteRow';
import Toggle from '../Toggle/Toggle';
import ToggleRow from '../ToggleRow/ToggleRow';
import GridBoxPanel from '../GridBoxPanel/GridBoxPanel';
import { PARAM_SLIDER_SPECS } from './utils/PARAM_SLIDER_SPECS';
import { PATHTRACER_SLIDERS } from './utils/PATHTRACER_SLIDERS';
import { RAYMARCH_SETTERS } from './utils/RAYMARCH_SETTERS';
import { RAYMARCH_SLIDERS } from './utils/RAYMARCH_SLIDERS';
import styles from './ControlsPanel.module.css';

function ControlsPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const sim = useAppSelector((s) => s.sim);
  const catalog = useAppSelector((s) => s.catalog);
  const view = useAppSelector((s) => s.view);
  // No open/close slice for the workbench's panel sections yet — CollapsibleSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(true);
  const [gridBoxOpen, setGridBoxOpen] = useState(true);
  const [raymarchOpen, setRaymarchOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [galaxiesOpen, setGalaxiesOpen] = useState(false);
  const [pathTracerOpen, setPathTracerOpen] = useState(false);
  const toggleLayer = (layer: keyof ViewSlice['layers']) => (on: boolean) =>
    dispatch(setLayerEnabled({ layer, on }));

  // V3: save/load a McpmParams + agent count + init mode + grid box preset,
  // the same shape emitTraceSidecar's provenance.params rides (exportParams).
  // `null` grid box (no catalog loaded yet, manual bounds never null) blocks
  // save — there's nothing meaningful to freeze into a preset yet.
  const [paramsStatus, setParamsStatus] = useState<string | null>(null);
  const paramsFileInputRef = useRef<HTMLInputElement>(null);

  const onSaveParams = (): void => {
    const s = store.getState();
    // deriveGridBox is never null: grid derivation is always the manual path
    // (S13.5), and manualCenterMpc/manualSizeMpc always have a value.
    const json = exportParams({
      params: s.sim.params,
      agentCount: s.sim.agentCount,
      initMode: s.sim.initMode,
      gridBox: deriveGridBox(s.grid),
      sources: s.catalog.sources,
    });
    triggerDownload(`${downloadStem(new Date())}-params.json`, json, 'application/json');
    setParamsStatus(null);
  };

  const onLoadParamsClick = (): void => paramsFileInputRef.current?.click();

  const onLoadParamsFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ''; // clears the input so re-selecting the same file still fires onChange
    if (!file) return;
    void file
      .text()
      .then((text) => {
        const imported = importParams(text);
        // Grid/sim first, catalog LAST (only if present): Viewport's subscriber treats a
        // catalog-identity (`catalogKey`) change as the immediate, undebounced rebuild
        // trigger and reads the whole live state at that point — dispatching the catalog
        // action after every other field lands means that one rebuild already sees the
        // new grid box/agent count/params, matching the old single combined write's
        // "one rebuild, not two" behaviour despite this now being several dispatches.
        for (const key of MCPM_PARAM_KEYS)
          dispatch(setSimParam({ key, value: imported.params[key] }));
        dispatch(setInitMode(imported.initMode));
        dispatch(setAgentCount(imported.agentCount));
        dispatch(installImportedBox(imported.gridBox));
        if (imported.sources !== undefined) dispatch(setCatalogSources(imported.sources));
        setParamsStatus(null);
      })
      .catch((err: unknown) => {
        setParamsStatus((err as Error).message);
      });
  };

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <CollapsibleSection
          title="Simulation"
          open={simOpen}
          onToggle={() => setSimOpen((v) => !v)}
        >
          <ToggleRow
            label="running"
            on={sim.running}
            info="Steps the simulation every frame. Pause to let the path tracer accumulate and to take stable exports."
            onChange={(on) => dispatch(setRunning(on))}
          />
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
          {/* reset / clear trace: momentary commands, not state — the slice records
              a request the Viewport consumes on its next frame. Divided from the
              toggle rows above with the same --border-divider hairline
              HistogramPlot/CollapsibleSection use, and one font-size step smaller
              than the panel's other buttons so the pair reads as secondary to the
              run/seed/weight toggles it now sits under. */}
          <div className={styles.simActions}>
            <Button className={styles.simActionButton} onClick={() => dispatch(requestReset())}>
              reset
            </Button>
            <Button
              className={styles.simActionButton}
              onClick={() => dispatch(requestClearTrace())}
            >
              clear trace
            </Button>
          </div>
          <SliderGroup title="Agents">
            {MCPM_PARAM_KEYS.map((id) => {
              const spec = PARAM_SLIDER_SPECS[id];
              return (
                <ParamSlider
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
            <ParamSlider
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
          </SliderGroup>
        </CollapsibleSection>

        <CollapsibleSection
          title="Grid box"
          open={gridBoxOpen}
          onToggle={() => setGridBoxOpen((v) => !v)}
        >
          <GridBoxPanel />
        </CollapsibleSection>

        <CollapsibleSection title="Data" open={dataOpen} onToggle={() => setDataOpen((v) => !v)}>
          {WORKBENCH_SOURCES.map((s) => (
            <ToggleRow
              key={s}
              label={SOURCE_REGISTRY[s].label}
              on={catalog.sources.includes(s)}
              // Excluded at the current tier (e.g. SDSS at 'small') carries no bin for
              // this tier, but selection must survive a tier switch — mute + hint, never
              // disable.
              hint={tierTarget(s, catalog.tier) === 0 ? `not in ${catalog.tier} tier` : undefined}
              onChange={(on) => {
                const next = toggleCatalogSource(catalog.sources, s, on);
                dispatch(setCatalogSources(next));
              }}
            />
          ))}
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
                  onToggle={() => dispatch(setCatalogTier(tier))}
                />
              ))}
            </div>
          </div>
        </CollapsibleSection>

        {/* Three INDEPENDENT layers, each switched by its own header pill — not a mode
            picker. Section order is the compositing order Viewport encodes them in. */}
        <CollapsibleSection
          title="Raymarch"
          open={raymarchOpen}
          onToggle={() => setRaymarchOpen((v) => !v)}
          headerToggle={view.layers.raymarch}
          onHeaderToggleChange={toggleLayer('raymarch')}
        >
          {/* Additive off is fork parity: per-slab 'over', opaque a few voxels in. */}
          <ToggleRow
            label="additive blend"
            on={view.raymarch.additive}
            onChange={(on) => dispatch(setAdditive(on))}
          />
          {/* T18: on demand, not a mode — Viewport packs once on the rising edge
              and un-checks this itself once the sim steps past that snapshot. */}
          <ToggleRow
            label="preview packed export"
            on={view.raymarch.previewPacked}
            info="Marches the packed export cube (real packLogTraceVoxels) instead of the live trace — a structure check, not a brightness match. Goes stale and reverts on the next sim step."
            onChange={(on) => dispatch(setPreviewPacked(on))}
          />
          <PaletteRow
            value={view.raymarch.paletteId}
            onChange={(id) => dispatch(setRaymarchPaletteId(id))}
          />
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
                  dispatch(RAYMARCH_SETTERS[spec.key](spec.log ? Math.pow(10, v) : v))
                }
                path={`view.raymarch.${spec.key}`}
              />
            ))}
          </SliderGroup>
          <SliderGroup title="Preview">
            <ParamSlider
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
          </SliderGroup>
        </CollapsibleSection>

        <CollapsibleSection
          title="Agents"
          open={agentsOpen}
          onToggle={() => setAgentsOpen((v) => !v)}
          headerToggle={view.layers.agents}
          onHeaderToggleChange={toggleLayer('agents')}
        >
          <ParamSlider
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
          <ParamSlider
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
        </CollapsibleSection>

        <CollapsibleSection
          title="Galaxies"
          open={galaxiesOpen}
          onToggle={() => setGalaxiesOpen((v) => !v)}
          headerToggle={view.layers.galaxies}
          onHeaderToggleChange={toggleLayer('galaxies')}
        >
          <ParamSlider
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
          <ParamSlider
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
        </CollapsibleSection>

        <CollapsibleSection
          title="Path tracer"
          open={pathTracerOpen}
          onToggle={() => setPathTracerOpen((v) => !v)}
          headerToggle={view.layers.pathTracer}
          onHeaderToggleChange={toggleLayer('pathTracer')}
        >
          {/* Off by default: worst case is bounces×512 tracking steps per pixel,
              far heavier than the raymarch — this is not a layer to leave on
              while exploring. */}
          <PaletteRow
            value={view.pathTracer.paletteId}
            onChange={(id) => dispatch(setPathTracerPaletteId(id))}
          />
          <SliderGroup title="Trace">
            {PATHTRACER_SLIDERS.map((spec) => (
              <ParamSlider
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
          </SliderGroup>
          <SliderGroup title="Preview">
            <ParamSlider
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
            <ParamSlider
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
          </SliderGroup>
          <ToggleRow
            label="compressive"
            on={view.pathTracer.compressive}
            info="Tonemap each sample before accumulating (the fork's LDR accumulation) instead of averaging linear radiance."
            onChange={(on) => dispatch(setPathTracerCompressive(on))}
          />
        </CollapsibleSection>
      </div>
      {/* Pinned below the scroll area, always visible (S12). */}
      <div className={styles.footer}>
        {/* T16 leg 1: `.npy` + `polyphy-trace` sidecar, one stem naming
            both (downloadStem/emitTraceSidecar/exportNpy). Same one-shot
            token shape as reset/clear-trace (Simulation section above) —
            only Viewport's harness closure can actually call readbackTrace,
            so this button can only request; Viewport's token-diff effect is
            the consumer that performs the readback and triggerDownloads. */}
        <Button className={styles.actionButton} onClick={() => dispatch(requestExport())}>
          download trace
        </Button>
        {/* T17 leg 2: same one-shot token pattern, downloading a
            ready-to-serve `.scfd` through the SAME packing code
            (packLogTraceVoxels/encodeScalarField) the offline
            buildRhizomeVolume importer uses. */}
        <Button className={styles.actionButton} onClick={() => dispatch(requestScfdExport())}>
          download .scfd
        </Button>
        {/* V3: unlike the two exports above, this runs synchronously right
            here — exportParams needs no GPU readback, just the live snapshot. */}
        <Button className={styles.actionButton} onClick={onSaveParams}>
          save params
        </Button>
        {/* The visible control is the Button; the <input> stays off-screen and
            is only ever driven programmatically (App.tsx's dev packed-drop
            reads a File the same way, via drag-drop instead of a click). Works
            in prod builds, unlike that DEV-gated drop path. */}
        <Button className={styles.actionButton} onClick={onLoadParamsClick}>
          load params
        </Button>
        <input
          ref={paramsFileInputRef}
          type="file"
          accept="application/json,.json"
          aria-label="load params file"
          style={{ display: 'none' }}
          onChange={onLoadParamsFile}
        />
      </div>
      {paramsStatus && <div className={styles.paramsStatus}>{paramsStatus}</div>}
    </div>
  );
}

export default ControlsPanel;
