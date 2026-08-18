/**
 * ControlsPanel — the eight McpmParams sliders, run controls, weight/init
 * mode toggles, and the embedded GridBoxPanel. Every slider writes straight
 * to the sim slice; the harness reads `params` fresh each step, so these
 * are live with no rebuild. Agent count / weight mode / init mode / grid
 * box are structural — Viewport watches them and rebuilds the harness.
 *
 * The Raymarch / Agents / Galaxies / Path tracer sections are the four render
 * layers: each section's header pill IS its layer's on/off switch, and any
 * subset may be on.
 */
import { useState, type ReactNode } from 'react';
import type { McpmParams } from '../../@types/McpmParams';
import type { ViewSlice } from '../../@types/ViewSlice';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import Button from '../../../../src/components/common/Button/Button';
import CollapsibleSection from '../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import SliderGroup from '../../../../src/components/common/SliderGroup/SliderGroup';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { tierTarget } from '../../../../src/data/tierTargets';
import { useStore } from '../state/useStore';
import { setCatalogSources, setCatalogTier, setWeightMode } from '../state/slices/catalogSlice';
import { setSampleRandomly } from '../state/slices/histogramSlice';
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
  setGalaxyIntensity,
  setGalaxyPointSize,
  setLayerEnabled,
  setOpticalThickness,
  setPathTracerCompressive,
  setPathTracerParam,
  setPreviewPacked,
  setSampleWeight,
  setStepVoxels,
  setTrimDensity,
} from '../state/slices/viewSlice';
import { useAppStore } from './storeContext';
import Toggle from './Toggle';
import ToggleRow from './ToggleRow';
import GridBoxPanel from './GridBoxPanel';
import HistogramPlot from './HistogramPlot';
import styles from './ControlsPanel.module.css';

type ParamSliderSpec = {
  readonly id: keyof McpmParams;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly info: string;
};

// Ranges are workbench UI convenience, not physics — wide enough to explore
// well past the SDSS-VAC preset in either direction.
const PARAM_SLIDER_SPECS: readonly ParamSliderSpec[] = [
  {
    id: 'senseSpreadDeg',
    label: 'sense spread (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Angular offset of the off-axis sense probes from the agent heading.',
  },
  {
    id: 'senseDistanceMpc',
    label: 'sense distance (Mpc)',
    min: 0,
    max: 20,
    step: 0.1,
    info: 'How far ahead the sense probes sample the deposit grid.',
  },
  {
    id: 'turnAngleDeg',
    label: 'turn angle (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Rotation toward the winning probe direction each step.',
  },
  {
    id: 'moveDistanceMpc',
    label: 'move distance (Mpc)',
    min: 0,
    max: 2,
    step: 0.01,
    info: 'Distance an agent travels per step.',
  },
  {
    id: 'depositValue',
    label: 'deposit value',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Amount each agent adds to the deposit (steering) grid per step.',
  },
  {
    id: 'persistence',
    label: 'persistence',
    min: 0,
    max: 1,
    step: 0.01,
    info: 'Fraction of the deposit grid that survives each decay step.',
  },
  {
    id: 'sharpness',
    label: 'sharpness',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Exponent on probe samples in the turn decision — higher steers harder toward the strongest signal.',
  },
  {
    id: 'normalizationFactor',
    label: 'normalization',
    min: 0,
    max: 5,
    step: 0.05,
    info: 'Rescales data-point deposits against agent deposits.',
  },
];

// The main app's full toggleable galaxy-catalog ladder (GalaxiesSection.tsx),
// same order. `toggleCatalogSource` re-derives the sources array from this
// fixed order every time, so clicking GLADE then 2MRS still yields
// [2MRS, GLADE], never the click order. May legitimately go empty — the
// zero-point path is a first-class state Viewport surfaces, not something
// this helper guards against.
const WORKBENCH_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];

function toggleCatalogSource(
  current: readonly SourceType[],
  s: SourceType,
  on: boolean,
): readonly SourceType[] {
  const enabled = new Set(current);
  if (on) enabled.add(s);
  else enabled.delete(s);
  return WORKBENCH_SOURCES.filter((source) => enabled.has(source));
}

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

type PathTracerSliderKey = Exclude<keyof ViewSlice['pathTracer'], 'compressive'>;

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
    info: "Tracking majorant, log-mapped 1e0–1e5 to reach the field's real scale (packLogTraceVoxels.ts: p99≈320, max≈40000). Below the field's true peak the image undersamples the densest voxels — raise this first if the render looks too dim.",
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
  const histogram = useStore(store, (s) => s.histogram);
  // No open/close slice for the workbench's panel sections yet — CollapsibleSection
  // is controlled, so local flags are enough until a section's state must persist.
  const [simOpen, setSimOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(true);
  const [gridBoxOpen, setGridBoxOpen] = useState(false);
  const [raymarchOpen, setRaymarchOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [galaxiesOpen, setGalaxiesOpen] = useState(false);
  const [pathTracerOpen, setPathTracerOpen] = useState(false);
  const [histogramOpen, setHistogramOpen] = useState(true);
  const toggleLayer = (layer: keyof ViewSlice['layers']) => (on: boolean) =>
    store.setState((s) => ({ ...s, view: setLayerEnabled(s.view, layer, on) }));

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <CollapsibleSection
          title="Simulation"
          open={simOpen}
          onToggle={() => setSimOpen((v) => !v)}
        >
          <SliderGroup title="Agents">
            {PARAM_SLIDER_SPECS.map((spec) => (
              <ParamSlider
                key={spec.id}
                label={spec.label}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                info={spec.info}
                value={sim.params[spec.id]}
                onChange={(v) =>
                  store.setState((s) => ({ ...s, sim: setSimParam(s.sim, spec.id, v) }))
                }
                path={`sim.params.${spec.id}`}
              />
            ))}
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
          title="Histogram"
          open={histogramOpen}
          onToggle={() => setHistogramOpen((v) => !v)}
        >
          <HistogramPlot />
          <ToggleRow
            label="jittered sampling"
            on={histogram.sampleRandomly}
            info="Samples the histogram at random positions instead of the catalog points themselves (the fork's HIST RNG SAMPLING toggle) — a coverage check, not the convergence signal itself."
            onChange={(on) =>
              store.setState((s) => ({ ...s, histogram: setSampleRandomly(s.histogram, on) }))
            }
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Grid box"
          open={gridBoxOpen}
          onToggle={() => setGridBoxOpen((v) => !v)}
        >
          <GridBoxPanel />
        </CollapsibleSection>

        <div>
          <ToggleRow
            label="running"
            on={sim.running}
            onChange={(on) => store.setState((s) => ({ ...s, sim: setRunning(s.sim, on) }))}
          />
          <ToggleRow
            label="weight by mass"
            on={catalog.weightMode === 'stellarMass'}
            onChange={(on) =>
              store.setState((s) => ({
                ...s,
                catalog: setWeightMode(s.catalog, on ? 'stellarMass' : 'uniform'),
              }))
            }
          />
          <ToggleRow
            label="seed around data"
            on={sim.initMode === 'aroundData'}
            onChange={(on) =>
              store.setState((s) => ({
                ...s,
                sim: setInitMode(s.sim, on ? 'aroundData' : 'uniform'),
              }))
            }
          />
          {/* Momentary commands, not state: the slice records a request the
              Viewport consumes on its next frame. */}
          <div className={styles.actions}>
            <Button
              className={styles.actionButton}
              onClick={() => store.setState((s) => ({ ...s, sim: requestReset(s.sim) }))}
            >
              reset
            </Button>
            <Button
              className={styles.actionButton}
              onClick={() => store.setState((s) => ({ ...s, sim: requestClearTrace(s.sim) }))}
            >
              clear trace
            </Button>
            {/* T16 leg 1: `.npy` + `polyphy-trace` sidecar, one stem naming
                both (downloadStem/emitTraceSidecar/exportNpy). Same one-shot
                token shape as reset/clear-trace above — only Viewport's
                harness closure can actually call readbackTrace, so this
                button can only request; Viewport's token-diff effect is the
                consumer that performs the readback and triggerDownloads. */}
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
          </div>
        </div>

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
        </CollapsibleSection>

        <CollapsibleSection
          title="Agents"
          open={agentsOpen}
          onToggle={() => setAgentsOpen((v) => !v)}
          headerToggle={view.layers.agents}
          onHeaderToggleChange={toggleLayer('agents')}
        >
          <span
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-fg-muted)',
            }}
          >
            free agents only — catalog points are the Galaxies layer
          </span>
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
    </div>
  );
}

export default ControlsPanel;
