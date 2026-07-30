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
 * (html:749-789) exactly, including `hii` (POPULATIONS, html:781-782) and
 * the lenticular-only dust-ring trio (DUST, html:776-779). Those four had
 * no `SPEC` entry in the spike, so their range came from `mk()`'s inline
 * fallback args instead — live, not dead, for exactly these keys (see
 * `paramSpec.ts`'s docblock). `PARAM_SPEC` now carries those four ranges
 * too, so it stays this tool's ONLY range table.
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
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
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
import { classifyHubbleType } from '../../../../../src/services/gpu/galaxy/classifyHubbleType';
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

// html:781-784 — hii/youngStars/metallicity for star-forming categories.
// The spike gave irregular's hii slider a narrower [0, 0.5] display range
// (html:782) than spiral/barred's [0, 2] (html:781); PARAM_SPEC has one
// `hii` entry, so this port uses [0, 2] for every category — a cosmetic
// widening only, since `randomGalaxyParams` already caps irregular's
// *sampled* hii at 0.5 behaviourally (its own docblock).
function buildPopSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category !== 'spiral' && category !== 'barred' && category !== 'irregular') return [];
  const specs: SliderSpec[] = [
    {
      key: 'hii',
      label: category === 'irregular' ? 'Star-forming regions' : 'HII / star-forming',
    },
    { key: 'youngStars', label: 'Young blue stars' },
    { key: 'metallicity', label: 'HII colour · metallicity' },
  ];
  return specs;
}

// html:773-779 — every category except elliptical; lenticular additionally
// gets the dust-ring trio (strength/radius/width, in that order).
function buildDustSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category === 'elliptical') return [];
  const specs: SliderSpec[] = [
    { key: 'dust', label: 'Dust density' },
    { key: 'dustNoise', label: 'Dust patchiness' },
    { key: 'dustNoiseScale', label: 'Dust noise scale' },
  ];
  if (category === 'lenticular') {
    specs.push({ key: 'dustRingStrength', label: 'Dust ring strength' });
    specs.push({ key: 'dustRing', label: 'Dust ring radius' });
    specs.push({ key: 'dustRingWidth', label: 'Dust ring width' });
  }
  return specs;
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
          {/* Exposure / bloom / tone curve mirror the app's own knobs, over the
              app's own ranges (exposure 0.1–4.0, per DEFAULT_EXPOSURE's
              docblock) so a value read off this panel can be typed straight
              into the app's settings. */}
          <ParamSlider
            label="Exposure"
            value={render.exposure}
            min={0.1}
            max={4}
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
            label="Bloom threshold"
            value={render.bloomThreshold}
            min={0}
            max={6}
            step={0.05}
            onChange={(v) => dispatch(renderPatched({ bloomThreshold: v }))}
          />
          {/* The star-pass block. These are the app's `MilkyWayTuning` knobs,
              over the app's own ranges (`src/data/milkyWay/milkyWaySliderFields.ts`),
              driving the app's own `milkyWayCloud/` shaders — so a number read
              off this panel can be typed straight into the app's DebugPanel.
              `Star size` and `Star intensity` keep this tool's narrower spike
              ranges: they predate the shared shaders and are the two knobs the
              reference-gallery auto-fit drives. */}
          <ParamSlider
            label="Star size"
            value={render.sizeScale}
            min={0.2}
            max={1.1}
            step={0.05}
            onChange={(v) => dispatch(renderPatched({ sizeScale: v }))}
          />
          <ParamSlider
            label="Star intensity"
            value={render.starIntensity}
            min={0.02}
            max={0.4}
            step={0.01}
            onChange={(v) => dispatch(renderPatched({ starIntensity: v }))}
          />
          <ParamSlider
            label="Star px floor"
            value={render.starPxMin}
            min={0}
            max={8}
            step={0.25}
            format={(v) => v.toFixed(2)}
            onChange={(v) => dispatch(renderPatched({ starPxMin: v }))}
          />
          <ParamSlider
            label="Star px cap"
            value={render.starPxMax}
            min={1}
            max={256}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ starPxMax: v }))}
          />
          <ParamSlider
            label="Star softness"
            value={render.softness}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => dispatch(renderPatched({ softness: v }))}
          />
          <div className={styles.lodExplainer}>
            The two px knobs clamp a sprite&rsquo;s on-screen half-extent in pixels of the STAR
            TARGET, which the divisor below shrinks — at divisor 2 one unit here is two screen
            pixels. Softness blends the tight core+glow profile toward a broad Gaussian at equal
            integral, so it changes shape without changing emitted light.
          </div>
          <div className={styles.toneWrap}>
            <div className={styles.toneLabel}>Tone mapping</div>
            <TonemapSelect
              value={render.tonemap}
              onChange={(mode) => dispatch(renderPatched({ tonemap: mode }))}
            />
          </div>
        </CollapsibleSection>

        {/* Saturation, vignette, and the gamma encode have NO app counterpart.
            They drive the tool-only `grade.wesl` trailer, which is skipped
            entirely while all three sit at the identity defaults shown here —
            so out of the box this tool's image is the app's image. They stay
            available because matching reference astrophotography sometimes
            wants them; their own section keeps "this is a departure from app
            parity" visible rather than mixed in with the shared knobs. */}
        <CollapsibleSection
          title="TOOL-ONLY GRADE (NOT IN THE APP)"
          open={ui.openSections.grade}
          onToggle={() => dispatch(sectionToggled('grade'))}
        >
          <ParamSlider
            label="Saturation"
            value={render.saturation}
            min={0.6}
            max={1.6}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ saturation: v }))}
          />
          <ParamSlider
            label="Vignette"
            value={render.vignette}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ vignette: v }))}
          />
          <label className={styles.autoRotateRow}>
            <span>Gamma encode (pow 1/2.2)</span>
            <input
              type="checkbox"
              className={styles.autoRotateCheckbox}
              checked={render.gammaEncode}
              onChange={(e) => dispatch(renderPatched({ gammaEncode: e.target.checked }))}
            />
          </label>
          <div className={styles.lodExplainer}>
            The app writes tone-mapped linear light straight into a non-sRGB swap chain with no
            encode. Whether that is right is an open question — this toggle is the A/B.
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
            max={0.2}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(v) => dispatch(lodPatched({ lodApparent: v }))}
          />
          <div className={styles.lodExplainer}>
            View-dependent: hides sprites smaller than the threshold on screen right now, and
            brightens the survivors so the field&rsquo;s total light holds. Higher = faster,
            especially with many galaxies. Fly in and they reappear. 0 disables the cull.
          </div>
          <ParamSlider
            label="Star target divisor"
            value={render.aggregateDivisor}
            min={1}
            max={6}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ aggregateDivisor: Math.round(v) }))}
          />
          <div className={styles.lodExplainer}>
            Stars render into an offscreen at 1/N the canvas and are bilinearly added back into HDR,
            so their fragment cost — the actual wall — falls as N². 1 is full resolution, the
            reference the reconstruction has to be judged against. Moving it reallocates that target
            and rescales the two px knobs above, which clamp in ITS pixels.
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
