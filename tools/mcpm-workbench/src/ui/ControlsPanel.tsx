/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — Viewport watches them and rebuilds the harness. The
 * Raymarch / Agents / Galaxies / Path tracer sections are the four render
 * layers: each section's header pill IS its layer's on/off switch, and any
 * subset may be on.
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { McpmParams } from '../../@types/McpmParams';
import type { ViewSlice } from '../../@types/ViewSlice';
import Button from '../../../../src/components/common/Button/Button';
import CollapsibleSection from '../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import SliderGroup from '../../../../src/components/common/SliderGroup/SliderGroup';
import { SOURCE_REGISTRY } from '../../../../src/data/sources';
import { tierTarget } from '../../../../src/data/tierTargets';
import { downloadStem } from '../export/downloadStem';
import { triggerDownload } from '../export/triggerDownload';
import { deriveGridBox } from '../field/deriveGridBox';
import { useStore } from '../state/useStore';
import {
  setCatalogSources,
  setCatalogTier,
  setWeightMode,
  toggleCatalogSource,
  WORKBENCH_SOURCES,
} from '../state/slices/catalogSlice';
import { exportParams, MCPM_PARAM_KEYS } from '../state/exportParams';
import { installImportedBox } from '../state/slices/gridSlice';
import { importParams } from '../state/importParams';
import {
  requestClearTrace,
  requestExport,
  requestReset,
  requestScfdExport,
  setAgentCount,
  setInitMode,
  setRunning,
  setSimParam,
} from '../state/slices/simSlice';
import {
  setAdditive,
  setAgentIntensity,
  setAgentPointSize,
  setDivisor,
  setGalaxyIntensity,
  setGalaxyPointSize,
  setLayerEnabled,
  setOpticalThickness,
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerParam,
  setPathTracerSampleCap,
  setPreviewPacked,
  setSampleWeight,
  setStepVoxels,
  setTrimDensity,
} from '../state/slices/viewSlice';
import { useAppStore } from './storeContext';
import Toggle from './Toggle';
import ToggleRow from './ToggleRow';
import GridBoxPanel from './GridBoxPanel';
import styles from './ControlsPanel.module.css';

type ParamSliderSpec = {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly info: string;
};

// Ranges are workbench UI convenience, not physics — wide enough to explore well past the
// SDSS-VAC preset in either direction. Record<keyof McpmParams, …>, not an array of {id, …}
// literals: a field added to McpmParams is a compile error here until it gets a spec, the same
// exhaustiveness MCPM_PARAM_KEYS's sentinel gets independently (exportParams.ts) — no shared
// array to keep the two in sync by hand.
const PARAM_SLIDER_SPECS: Record<keyof McpmParams, ParamSliderSpec> = {
  senseSpreadDeg: {
    label: 'sense spread (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Angular offset of the off-axis sense probes from the agent heading.',
  },
  senseDistanceMpc: {
    label: 'sense distance (Mpc)',
    min: 0,
    max: 20,
    step: 0.1,
    info: 'How far ahead the sense probes sample the deposit grid.',
  },
  turnAngleDeg: {
    label: 'turn angle (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Rotation toward the winning probe direction each step.',
  },
  moveDistanceMpc: {
    label: 'move distance (Mpc)',
    min: 0,
    max: 2,
    step: 0.01,
    info: 'Distance an agent travels per step.',
  },
  depositValue: {
    label: 'deposit value',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Amount each agent adds to the deposit (steering) grid per step.',
  },
  persistence: {
    label: 'persistence',
    min: 0,
    max: 1,
    step: 0.01,
    info: 'Fraction of the deposit grid that survives each decay step.',
  },
  sharpness: {
    label: 'sharpness',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Exponent on probe samples in the turn decision — higher steers harder toward the strongest signal.',
  },
  normalizationFactor: {
    label: 'normalization',
    min: 0,
    max: 5,
    step: 0.05,
    info: 'Rescales data-point deposits against agent deposits.',
  },
};

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

const RAYMARCH_SETTERS: {
  readonly [K in RaymarchSliderKey]: (prev: ViewSlice, value: number) => ViewSlice;
} = {
  opticalThickness: setOpticalThickness,
  sampleWeight: setSampleWeight,
  trimDensity: setTrimDensity,
  stepVoxels: setStepVoxels,
};

// 'divisor' gets its own dedicated ParamSlider below (the "Preview" group,
// mirroring the raymarch layer's own), not the generic log-mapped physics list.
type PathTracerSliderKey = Exclude<
  keyof ViewSlice['pathTracer'],
  'compressive' | 'divisor' | 'sampleCap'
>;

type PathTracerSliderSpec = {
  readonly key: PathTracerSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info: string;
  /** Present ⇒ log10 space, same convention as RAYMARCH_SLIDERS' sampleWeight. */
  readonly log?: boolean;
};

// Spec §7's nine knobs plus the raymarch layer's own trimDensity/sampleWeight
// (VolpathParams' full list — task-V2A-report.md). Order matches the brief.
const PATHTRACER_SLIDERS: readonly PathTracerSliderSpec[] = [
  {
    key: 'sigmaT',
    label: 'sigma t',
    min: 0.01,
    max: 20,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Extinction. Scattering = albedo · sigmaT.',
  },
  {
    key: 'albedo',
    label: 'albedo',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Fraction of extinction that scatters rather than absorbs.',
  },
  {
    key: 'sigmaE',
    label: 'sigma e',
    min: 0,
    max: 10,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Emission scale — how bright a collision glows through the palette.',
  },
  {
    key: 'anisotropy',
    label: 'anisotropy',
    min: 0,
    max: 0.99,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: "Henyey-Greenstein mean cosine: 0 isotropic, up to 0.99 sharply forward. UNSIGNED — the fork's sampler folds a negative value onto its positive twin, so back-scattering is unreachable.",
  },
  {
    key: 'ambientTrace',
    label: 'ambient trace',
    min: 0,
    max: 1,
    step: 0.001,
    format: (v) => v.toFixed(3),
    info: 'Density floor inside the box, so the void between filaments still scatters.',
  },
  {
    key: 'traceMax',
    label: 'trace max',
    min: 0,
    max: 5,
    step: 0.05,
    log: true,
    format: (v) => Math.pow(10, v).toExponential(1),
    info: "Tracking majorant, log-mapped 1e0–1e5 to reach the field's real scale (packLogTraceVoxels.ts: p99≈320, max≈40000) — fork-faithful default sits below the field's peak (40000) on purpose, clamping the accept probability to 1 in the hottest voxels rather than spending tracking steps resolving them.",
  },
  {
    key: 'exposure',
    label: 'exposure',
    min: 0,
    max: 5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: 'Tonemap exposure applied when the accumulator resolves.',
  },
  {
    key: 'trimDensity',
    label: 'trim density',
    min: 0,
    max: 0.5,
    step: 0.00001,
    format: (v) => v.toFixed(5),
    info: "Trace values at or below this are treated as empty space — the raymarch layer's own knob of the same name, kept separately tunable here.",
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
    key: 'bounces',
    label: 'bounces',
    min: 1,
    max: 64,
    step: 1,
    format: (v) => v.toFixed(0),
    info: "Tracking walks per path, not the fork's n_bounces (this layer passes it through as given, one less than the fork's call-site convention).",
  },
];

function ControlsPanel(): ReactNode {
  const store = useAppStore();
  const sim = useStore(store, (s) => s.sim);
  const catalog = useStore(store, (s) => s.catalog);
  const view = useStore(store, (s) => s.view);
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
    store.setState((s) => ({ ...s, view: setLayerEnabled(s.view, layer, on) }));

  // V3: save/load a McpmParams + agent count + init mode + grid box preset,
  // the same shape emitTraceSidecar's provenance.params rides (exportParams).
  // `null` grid box (no catalog loaded yet, manual bounds never null) blocks
  // save — there's nothing meaningful to freeze into a preset yet.
  const [paramsStatus, setParamsStatus] = useState<string | null>(null);
  const paramsFileInputRef = useRef<HTMLInputElement>(null);

  const onSaveParams = (): void => {
    const s = store.getSnapshot();
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
        store.setState((s) => ({
          ...s,
          sim: setAgentCount(
            { ...s.sim, params: imported.params, initMode: imported.initMode },
            imported.agentCount,
          ),
          grid: installImportedBox(s.grid, imported.gridBox),
          // Folded into this same update, not a follow-up setState: Viewport's
          // subscriber branches on catalog identity FIRST when both catalogKey and
          // buildKey move together, and buildOnce always re-reads deriveGridBox(s.grid)
          // off the live snapshot at build time — so one combined write can never
          // race the box install, it just yields one rebuild instead of two. Omitted
          // field (pre-S15 preset) ⇒ leave the current selection untouched.
          catalog:
            imported.sources !== undefined
              ? setCatalogSources(s.catalog, imported.sources)
              : s.catalog,
        }));
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
            onChange={(on) => store.setState((s) => ({ ...s, sim: setRunning(s.sim, on) }))}
          />
          <ToggleRow
            label="seed around data"
            on={sim.initMode === 'aroundData'}
            info="Seeds agents near catalog points instead of uniformly across the grid, so the fit converges onto the survey volume faster."
            onChange={(on) =>
              store.setState((s) => ({
                ...s,
                sim: setInitMode(s.sim, on ? 'aroundData' : 'uniform'),
              }))
            }
          />
          <ToggleRow
            label="weight by mass"
            on={catalog.weightMode === 'stellarMass'}
            info="Data-point deposits scale with each galaxy's stellar mass; off, every data point deposits equally. Free agents always deposit at a flat weight either way."
            onChange={(on) =>
              store.setState((s) => ({
                ...s,
                catalog: setWeightMode(s.catalog, on ? 'stellarMass' : 'uniform'),
              }))
            }
          />
          {/* reset / clear trace: momentary commands, not state — the slice records
              a request the Viewport consumes on its next frame. Divided from the
              toggle rows above with the same --border-divider hairline
              HistogramPlot/CollapsibleSection use, and one font-size step smaller
              than the panel's other buttons so the pair reads as secondary to the
              run/seed/weight toggles it now sits under. */}
          <div className={styles.simActions}>
            <Button
              className={styles.simActionButton}
              onClick={() => store.setState((s) => ({ ...s, sim: requestReset(s.sim) }))}
            >
              reset
            </Button>
            <Button
              className={styles.simActionButton}
              onClick={() => store.setState((s) => ({ ...s, sim: requestClearTrace(s.sim) }))}
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
                  onChange={(v) =>
                    store.setState((s) => ({ ...s, sim: setSimParam(s.sim, id, v) }))
                  }
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
              onChange={(v) => store.setState((s) => ({ ...s, sim: setAgentCount(s.sim, v) }))}
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
                store.setState((st) => ({ ...st, catalog: setCatalogSources(st.catalog, next) }));
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
                  onToggle={() =>
                    store.setState((s) => ({ ...s, catalog: setCatalogTier(s.catalog, tier) }))
                  }
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
            onChange={(on) => store.setState((s) => ({ ...s, view: setAdditive(s.view, on) }))}
          />
          {/* T18: on demand, not a mode — Viewport packs once on the rising edge
              and un-checks this itself once the sim steps past that snapshot. */}
          <ToggleRow
            label="preview packed export"
            on={view.raymarch.previewPacked}
            info="Marches the packed export cube (real packLogTraceVoxels) instead of the live trace — a structure check, not a brightness match. Goes stale and reverts on the next sim step."
            onChange={(on) => store.setState((s) => ({ ...s, view: setPreviewPacked(s.view, on) }))}
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
                  store.setState((s) => ({
                    ...s,
                    view: RAYMARCH_SETTERS[spec.key](s.view, spec.log ? Math.pow(10, v) : v),
                  }))
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
              onChange={(v) => store.setState((s) => ({ ...s, view: setDivisor(s.view, v) }))}
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
            onChange={(v) => store.setState((s) => ({ ...s, view: setAgentIntensity(s.view, v) }))}
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
            onChange={(v) => store.setState((s) => ({ ...s, view: setAgentPointSize(s.view, v) }))}
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
            onChange={(v) => store.setState((s) => ({ ...s, view: setGalaxyIntensity(s.view, v) }))}
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
            onChange={(v) => store.setState((s) => ({ ...s, view: setGalaxyPointSize(s.view, v) }))}
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
                  store.setState((s) => ({
                    ...s,
                    view: setPathTracerParam(s.view, spec.key, spec.log ? Math.pow(10, v) : v),
                  }))
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
              onChange={(v) =>
                store.setState((s) => ({ ...s, view: setPathTracerDivisor(s.view, v) }))
              }
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
              onChange={(v) =>
                store.setState((s) => ({ ...s, view: setPathTracerSampleCap(s.view, v) }))
              }
              path="view.pathTracer.sampleCap"
            />
          </SliderGroup>
          <ToggleRow
            label="compressive"
            on={view.pathTracer.compressive}
            info="Tonemap each sample before accumulating (the fork's LDR accumulation) instead of averaging linear radiance."
            onChange={(on) =>
              store.setState((s) => ({ ...s, view: setPathTracerCompressive(s.view, on) }))
            }
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
        <Button
          className={styles.actionButton}
          onClick={() => store.setState((s) => ({ ...s, sim: requestExport(s.sim) }))}
        >
          download trace
        </Button>
        {/* T17 leg 2: same one-shot token pattern, downloading a
            ready-to-serve `.scfd` through the SAME packing code
            (packLogTraceVoxels/encodeScalarField) the offline
            buildRhizomeVolume importer uses. */}
        <Button
          className={styles.actionButton}
          onClick={() => store.setState((s) => ({ ...s, sim: requestScfdExport(s.sim) }))}
        >
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
