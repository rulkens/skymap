/**
 * ControlsPanel — the 340px right column (html:149): every galaxy-shape,
 * rendering, and perf-test knob in one scrollable rail. A layout/dispatch
 * shell — the actual domain logic (what a Hubble-type pick nudges,
 * what a "randomize everything" draw looks like, what range each slider
 * gets) lives in `hubbleTypePatch`/`randomGalaxyParams`/`PARAM_SPEC`; this
 * component only decides which sliders are visible for the current
 * category and wires their `onChange` to a `paramsPatched` dispatch.
 *
 * Slider visibility per Hubble category mirrors the spike's `renderVals`
 * (html:749-789) exactly, with one resolved gap: the spike's `mk()` also
 * had inline fallback ranges for three fields with no `SPEC` entry
 * (`dustRing`/`dustRingWidth`/`dustRingStrength`) and for `hii`. Those
 * fallbacks were dead in the live spike whenever `SPEC` *did* have an
 * entry (see `paramSpec.ts`'s docblock) — but for these four fields it
 * never did, so the "live" range was always the inline fallback, i.e. a
 * second range table the port doesn't carry forward. `PARAM_SPEC` is
 * this tool's ONLY range table (entanglement-radar checks this at the
 * plan gate), so those four sliders are dropped rather than re-inventing
 * a per-component fallback.
 *
 * Every entropy-consuming click (randomize-all, new-seed, reseed-one-die)
 * seeds a fresh `mulberry32` from `Math.random()` at the click site — the
 * house rule that pure functions never own their own entropy source
 * (`randomGalaxyParams`'s docblock) means the RNG has to come from
 * somewhere, and a fresh seed per click is what makes repeated clicks
 * keep producing new results (a single component-lifetime RNG would
 * replay the same sequence across remounts, and doesn't buy anything a
 * plain per-click reseed doesn't).
 */
import { type ReactNode } from 'react';
import type { GalaxyParams } from '../../../@types/model/GalaxyParams';
import type { ParamSpecEntry } from '../../../@types/data/ParamSpecEntry';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { lodPatched } from '../../state/slices/lodSlice';
import { sectionToggled, autoRotateSet } from '../../state/slices/uiSlice';
import { PARAM_SPEC } from '../../data/paramSpec';
import { hubbleTypePatch } from '../../data/hubbleStagePatches';
import { randomGalaxyParams } from '../../data/randomGalaxyParams';
import { classifyHubbleType } from '../../model/classifyHubbleType';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import TonemapSelect from '../TonemapSelect/TonemapSelect';
import TypePicker from '../TypePicker/TypePicker';
import MultiGalaxySection from '../MultiGalaxySection/MultiGalaxySection';
import PresetsSection from '../PresetsSection/PresetsSection';
import styles from './ControlsPanel.module.css';

// Every GalaxyParams field except the Hubble-type string itself is a
// plain number — this narrows `keyof GalaxyParams` down to the subset a
// slider can actually drive.
type GalaxySliderKey = Exclude<keyof GalaxyParams, 'type'>;

type SliderSpec = {
  readonly key: GalaxySliderKey;
  readonly label: string;
  readonly format?: (value: number) => string;
  readonly seedKey?: 'asymSeed' | 'clumpSeed' | 'waveSeed';
};

// html:511 — the three fields whose range input still emits fractional
// values at the resolution a `<input type=range step=1>` can drift to;
// the spike rounds these three defensively on every change.
const INTEGER_KEYS: ReadonlySet<GalaxySliderKey> = new Set([
  'armCount',
  'globularCount',
  'starCount',
]);

function coerceInteger(key: GalaxySliderKey, value: number): number {
  return INTEGER_KEYS.has(key) ? Math.round(value) : value;
}

function specFor(key: GalaxySliderKey): ParamSpecEntry {
  const entry = PARAM_SPEC[key];
  if (!entry) {
    throw new Error(
      `ControlsPanel: no PARAM_SPEC entry for '${key}' — add one before wiring a slider to it.`,
    );
  }
  return entry;
}

// html:749-758 — always radius/starCount/irregularity; bulge/disk/warp
// knobs drop out one by one as the category loses that structure.
function buildShapeSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  const specs: SliderSpec[] = [
    { key: 'radius', label: 'Galaxy size', format: (v) => `${v.toFixed(2)}×` },
    { key: 'starCount', label: 'Star density', format: (v) => `${Math.round(v / 1000)}k` },
  ];
  if (category !== 'elliptical') specs.push({ key: 'bulgeSize', label: 'Central bulge' });
  if (category !== 'irregular') specs.push({ key: 'bulgeFalloff', label: 'Bulge falloff' });
  if (category !== 'irregular' && category !== 'elliptical') {
    specs.push({ key: 'diskThickness', label: 'Disk thickness' });
  }
  if (category === 'spiral' || category === 'barred' || category === 'lenticular') {
    specs.push({ key: 'warpStrength', label: 'Disk warp' });
    specs.push({
      key: 'warpTwist',
      label: 'Warp twist',
      format: (v) => `${Math.trunc(v * 57.3)}°`,
    });
  }
  specs.push({ key: 'irregularity', label: 'Randomness / asymmetry', seedKey: 'asymSeed' });
  return specs;
}

// html:760-771 — the whole group only exists for spiral/barred galaxies.
function buildArmSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category !== 'spiral' && category !== 'barred') return [];
  const specs: SliderSpec[] = [
    { key: 'armCount', label: 'Spiral arms', format: (v) => String(v) },
    { key: 'armWinding', label: 'Arm pitch (tight→loose)' },
    { key: 'armWidth', label: 'Arm width' },
    { key: 'armStrength', label: 'Arm definition' },
    { key: 'subArms', label: 'Sub-arms / spurs' },
    { key: 'armFalloff', label: 'Arm edge falloff' },
    { key: 'armEdgeVar', label: 'Arm length variation', seedKey: 'asymSeed' },
    { key: 'armClump', label: 'Arm clumpiness', seedKey: 'clumpSeed' },
    { key: 'armWave', label: 'Arm waviness', seedKey: 'waveSeed' },
  ];
  if (category === 'barred') specs.push({ key: 'barStrength', label: 'Bar length' });
  return specs;
}

// html:781-784 — youngStars/metallicity for star-forming categories only
// (hii is dropped: no PARAM_SPEC entry, see the module docblock).
function buildPopSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category !== 'spiral' && category !== 'barred' && category !== 'irregular') return [];
  return [
    { key: 'youngStars', label: 'Young blue stars' },
    { key: 'metallicity', label: 'HII colour · metallicity' },
  ];
}

// html:773-775 — every category except elliptical (the ring-dust knobs
// for lenticular galaxies are dropped, same reason as hii above).
function buildDustSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category === 'elliptical') return [];
  return [
    { key: 'dust', label: 'Dust density' },
    { key: 'dustNoise', label: 'Dust patchiness' },
    { key: 'dustNoiseScale', label: 'Dust noise scale' },
  ];
}

// html:785-789 — unconditional, every category gets a cluster count/size/brightness triplet.
const GLOB_SLIDERS: readonly SliderSpec[] = [
  { key: 'globularCount', label: 'Cluster count', format: (v) => String(v) },
  { key: 'globularSize', label: 'Cluster size' },
  { key: 'globularBright', label: 'Cluster brightness' },
];

function freshRng(): () => number {
  return mulberry32((Math.random() * 1e9) | 0);
}

function ControlsPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const render = useAppSelector((state) => state.render);
  const lod = useAppSelector((state) => state.lod);
  const ui = useAppSelector((state) => state.ui);

  const category = classifyHubbleType(galaxy.type);
  const shapeSliders = buildShapeSliders(category);
  const armSliders = buildArmSliders(category);
  const popSliders = buildPopSliders(category);
  const dustSliders = buildDustSliders(category);

  const handleReseed = (seedKey: 'asymSeed' | 'clumpSeed' | 'waveSeed'): void => {
    const rng = freshRng();
    dispatch(paramsPatched({ [seedKey]: (rng() * 1e9) | 0 } as Partial<GalaxyParams>));
  };

  const renderGalaxySlider = (spec: SliderSpec): ReactNode => {
    const { min, max, step } = specFor(spec.key);
    const value = galaxy[spec.key] ?? 0;
    return (
      <ParamSlider
        key={spec.key}
        label={spec.label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={spec.format}
        onChange={(v) =>
          dispatch(
            paramsPatched({ [spec.key]: coerceInteger(spec.key, v) } as Partial<GalaxyParams>),
          )
        }
        onReseed={spec.seedKey ? () => handleReseed(spec.seedKey!) : undefined}
      />
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <button
          type="button"
          className={styles.randomizeButton}
          onClick={() => {
            const rng = freshRng();
            dispatch(paramsPatched(randomGalaxyParams(rng, { includeSize: false })));
          }}
        >
          🎲 Randomize everything
        </button>

        <div className={styles.morphologyHeader}>MORPHOLOGY · HUBBLE SEQUENCE</div>
        <TypePicker
          activeType={galaxy.type}
          onSelect={(type) => dispatch(paramsPatched(hubbleTypePatch(type)))}
        />

        <CollapsibleSection
          title="SHAPE & SIZE"
          open={ui.openSections.shape}
          onToggle={() => dispatch(sectionToggled('shape'))}
        >
          {shapeSliders.map(renderGalaxySlider)}
        </CollapsibleSection>

        {armSliders.length > 0 && (
          <CollapsibleSection
            title="SPIRAL ARMS"
            open={ui.openSections.arms}
            onToggle={() => dispatch(sectionToggled('arms'))}
          >
            {armSliders.map(renderGalaxySlider)}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="POPULATIONS"
          open={ui.openSections.pop}
          onToggle={() => dispatch(sectionToggled('pop'))}
        >
          {popSliders.map(renderGalaxySlider)}
        </CollapsibleSection>

        {dustSliders.length > 0 && (
          <CollapsibleSection
            title="DUST"
            open={ui.openSections.dust}
            onToggle={() => dispatch(sectionToggled('dust'))}
          >
            {dustSliders.map(renderGalaxySlider)}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="GLOBULAR CLUSTERS"
          open={ui.openSections.glob}
          onToggle={() => dispatch(sectionToggled('glob'))}
        >
          {GLOB_SLIDERS.map(renderGalaxySlider)}
        </CollapsibleSection>

        <button
          type="button"
          className={styles.newSeedButton}
          onClick={() => {
            const rng = freshRng();
            dispatch(paramsPatched({ seed: (rng() * 1e9) | 0 } as Partial<GalaxyParams>));
          }}
        >
          ⟲ New random seed
        </button>

        <CollapsibleSection
          title="RENDERING"
          open={ui.openSections.render}
          onToggle={() => dispatch(sectionToggled('render'))}
        >
          <ParamSlider
            label="Exposure"
            value={render.exposure}
            min={0.4}
            max={2.2}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ exposure: v }))}
          />
          <ParamSlider
            label="Bloom glow"
            value={render.bloom}
            min={0}
            max={2}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ bloom: v }))}
          />
          <ParamSlider
            label="Saturation"
            value={render.saturation}
            min={0.6}
            max={1.6}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ saturation: v }))}
          />
          <ParamSlider
            label="Star size"
            value={render.sizeScale}
            min={0.2}
            max={1.1}
            step={0.05}
            onChange={(v) => dispatch(renderPatched({ sizeScale: v }))}
          />
          {/* vignette + starIntensity: RenderSettings fields the spike's engine
              had but its own UI never exposed — the render slice owns them, so
              this panel shows them (resolved spec ambiguity, see plan 03 task 12). */}
          <ParamSlider
            label="Vignette"
            value={render.vignette}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ vignette: v }))}
          />
          <ParamSlider
            label="Star intensity"
            value={render.starIntensity}
            min={0.02}
            max={0.4}
            step={0.01}
            onChange={(v) => dispatch(renderPatched({ starIntensity: v }))}
          />
          <div className={styles.toneWrap}>
            <div className={styles.toneLabel}>Tone mapping</div>
            <TonemapSelect
              value={render.tonemap}
              onChange={(mode) => dispatch(renderPatched({ tonemap: mode }))}
            />
          </div>
        </CollapsibleSection>

        <label className={styles.autoRotateRow}>
          <span>Auto-rotate when idle</span>
          <input
            type="checkbox"
            className={styles.autoRotateCheckbox}
            checked={ui.autoRotate}
            onChange={(e) => dispatch(autoRotateSet(e.target.checked))}
          />
        </label>

        <CollapsibleSection
          title="PERFORMANCE (LOD)"
          open={ui.openSections.perf}
          onToggle={() => dispatch(sectionToggled('perf'))}
        >
          <ParamSlider
            label="LOD · min on-screen size"
            value={lod.lodApparent}
            min={0}
            max={0.02}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(v) => dispatch(lodPatched({ lodApparent: v }))}
          />
          <ParamSlider
            label="Cull faint stars"
            value={lod.cullBright}
            min={0}
            max={0.4}
            step={0.01}
            onChange={(v) => dispatch(lodPatched({ cullBright: v }))}
          />
          <div className={styles.lodExplainer}>
            View-dependent: hides sprites smaller/fainter than the threshold on screen right now.
            Higher = faster, especially with many galaxies. Fly in and they reappear.
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="MULTIPLE GALAXIES"
          open={ui.openSections.multi}
          onToggle={() => dispatch(sectionToggled('multi'))}
        >
          <MultiGalaxySection />
        </CollapsibleSection>

        <PresetsSection />
      </div>
    </div>
  );
}

export default ControlsPanel;
