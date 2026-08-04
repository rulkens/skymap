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
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { OrientationDiagnostics } from '../../../@types/engine/OrientationDiagnostics';
import type { ParamSpecEntry } from '../../../@types/data/ParamSpecEntry';
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';
import Button from '../../../../../src/components/common/Button/Button';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { paramsPatched } from '../../state/slices/galaxySlice';
import { renderPatched } from '../../state/slices/renderSlice';
import { lodPatched } from '../../state/slices/lodSlice';
import { sectionToggled } from '../../state/slices/uiSlice';
import { PARAM_SPEC } from '../../data/paramSpec';
import { hubbleTypePatch } from '../../data/hubbleStagePatches';
import { randomGalaxyParams } from '../../data/randomGalaxyParams';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import ArmCloudSection from '../ArmCloudSection/ArmCloudSection';
import ArmFieldSection from '../ArmFieldSection/ArmFieldSection';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import DebugViewsSection from '../DebugViewsSection/DebugViewsSection';
import DustSection from '../DustSection/DustSection';
import DustCloudSection from '../DustCloudSection/DustCloudSection';
import FadeSection from '../FadeSection/FadeSection';
import FieldSection from '../FieldSection/FieldSection';
import HiiSection from '../HiiSection/HiiSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import SfMapSection from '../SfMapSection/SfMapSection';
import StarFormationSection from '../StarFormationSection/StarFormationSection';
import TonemapSelect from '../TonemapSelect/TonemapSelect';
import TypePicker from '../TypePicker/TypePicker';
import MultiGalaxySection from '../MultiGalaxySection/MultiGalaxySection';
import PresetsSection from '../PresetsSection/PresetsSection';
import styles from './ControlsPanel.module.css';

// Every GalaxyParams field except the Hubble-type string, the per-arm
// `armAges` array, and the nested `dust`/`starFormation` sections is a plain
// number — this narrows `keyof GalaxyParams` down to the subset a single-value
// slider can actually drive. `armAges` has no UI surface (pin it in a preset
// object instead, per barAngleDeg's pattern); each nested group gets its own
// component (`DustSection`, `StarFormationSection`), since a nested object
// needs its own patch-spreading handlers rather than the generic single-value
// `onChange` below.
type GalaxySliderKey = Exclude<keyof GalaxyParams, 'type' | 'armAges' | 'dust' | 'starFormation'>;

type SliderSpec = {
  readonly key: GalaxySliderKey;
  readonly label: string;
  readonly format?: (value: number) => string;
  readonly seedKey?: 'asymSeed' | 'clumpSeed' | 'waveSeed';
  /** Hover explainer, for the knobs whose label alone gets misread. */
  readonly info?: string;
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

/**
 * The sprite budget, alone in its own section rather than under SHAPE & SIZE:
 * the star bag is scheduled for deletion (`docs/research/milky-way/
 * goal-and-history.md`), and a section holding nothing else deletes with it.
 */
const STAR_BUDGET_SLIDERS: SliderSpec[] = [
  { key: 'starCount', label: 'Star density', format: (v) => `${Math.round(v / 1000)}k` },
];

// html:749-758 — always radius/irregularity; bulge/disk/warp
// knobs drop out one by one as the category loses that structure.
function buildShapeSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  const specs: SliderSpec[] = [
    { key: 'radius', label: 'Galaxy size', format: (v) => `${v.toFixed(2)}×` },
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
    {
      key: 'armFalloff',
      label: 'Arm edge falloff',
      info: 'Sets HOW FAR the arms extend — the only knob that does. 0 reaches 1.7x the disc radius, 1 stops at 0.65x. It is a generation knob, so moving it regenerates.',
    },
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
    { key: 'spriteDust', label: 'Dust density' },
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

export type ControlsPanelProps = {
  /**
   * Live fade telemetry, prop-drilled from `App` rather than dispatched into
   * the store — the same treatment `perf`/`stats` get, and for the same reason
   * (see `HudProps`): it is engine output on a 10 Hz cadence that exactly one
   * subtree reads.
   */
  readonly fade: MilkyWayFadeReadout | null;
  /** Same treatment, event-driven rather than timed — see `SfMapSection`'s own readout. */
  readonly orientationDiagnostics: OrientationDiagnostics | null;
};

function ControlsPanel({ fade, orientationDiagnostics }: ControlsPanelProps): ReactNode {
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
        info={spec.info}
      />
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <Button
          className={styles.randomizeButton}
          onClick={() => {
            const rng = freshRng();
            dispatch(paramsPatched(randomGalaxyParams(rng, { includeSize: false })));
          }}
        >
          Randomize
        </Button>

        {/* At the very top, outside any section: the one-click A/B against the
            sprite path the flux field is replacing. "Legacy" in the label is
            the point — the star bag is scheduled for deletion (see
            `docs/research/milky-way/goal-and-history.md`), and this switch is
            how its remaining usefulness (a reference to compare against) is
            reached without scrolling. */}
        <label className={styles.legacyToggleRow}>
          <input
            type="checkbox"
            className={styles.pillToggle}
            checked={render.spriteField}
            onChange={(e) => dispatch(renderPatched({ spriteField: e.target.checked }))}
          />
          <span>Legacy sprite stars</span>
        </label>

        {/* The analytic field is a closed-form line integral of a Gaussian
            mixture, evaluated into its OWN reduced-resolution target and
            additively blended into HDR alongside the sprites' — derived from
            the generator's own geometry in `galaxyFieldMixture.ts`. This
            group header, not a CollapsibleSection, never folds; it just
            labels everything below it as one family. Its pill is the whole
            field GPU pass's master (`render.analyticField`) — the one-click
            A/B against the legacy sprite pill above — while each section
            underneath (FLUX FIELD, ARM OVERDENSITIES) has its OWN pill
            choosing which mixture part builds. */}
        <div className={styles.groupHeader}>
          <span className={styles.groupHeaderTitle}>Analytic model</span>
          <input
            type="checkbox"
            className={styles.pillToggle}
            checked={render.analyticField}
            onChange={(e) => dispatch(renderPatched({ analyticField: e.target.checked }))}
            aria-label="Toggle analytic model"
          />
        </div>

        <DebugViewsSection />

        <FieldSection />
        <ArmFieldSection />
        <ArmCloudSection />
        <HiiSection />
        <StarFormationSection />
        <SfMapSection diagnostics={orientationDiagnostics} />
        <DustSection />
        <DustCloudSection />

        <CollapsibleSection
          title="MORPHOLOGY · HUBBLE SEQUENCE"
          open={ui.openSections.morphology}
          onToggle={() => dispatch(sectionToggled('morphology'))}
        >
          <TypePicker
            activeType={galaxy.type}
            onSelect={(type) => dispatch(paramsPatched(hubbleTypePatch(type)))}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="SHAPE & SIZE"
          open={ui.openSections.shape}
          onToggle={() => dispatch(sectionToggled('shape'))}
        >
          {shapeSliders.map(renderGalaxySlider)}
          <Button
            className={styles.newSeedButton}
            onClick={() => {
              const rng = freshRng();
              dispatch(paramsPatched({ seed: (rng() * 1e9) | 0 } as Partial<GalaxyParams>));
            }}
          >
            ⟲ New random seed
          </Button>
        </CollapsibleSection>

        <CollapsibleSection
          title="STAR BUDGET (TO BE DELETED)"
          open={ui.openSections.starBudget}
          onToggle={() => dispatch(sectionToggled('starBudget'))}
        >
          {STAR_BUDGET_SLIDERS.map(renderGalaxySlider)}
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

        {/* The pill gates the sprite generator's dust output (see the gate in
            `engineBridge.ts`), not this section's sliders — they stay live so
            legacy values can still be dialled and compared while off. */}
        {dustSliders.length > 0 && (
          <CollapsibleSection
            title="DUST (LEGACY)"
            open={ui.openSections.dust}
            onToggle={() => dispatch(sectionToggled('dust'))}
            headerToggle={render.legacyDustEnabled}
            onHeaderToggleChange={(value) => dispatch(renderPatched({ legacyDustEnabled: value }))}
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
              driving the app's own `milkyWay/sprites/` shaders — so a number read
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
            info="The two px knobs clamp a sprite's on-screen half-extent in pixels of the star target, which the divisor below shrinks — at divisor 2 one unit here is two screen pixels. Softness blends the tight core+glow profile toward a broad Gaussian at equal integral, changing shape without changing emitted light."
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
          <div className={styles.toneWrap}>
            <div className={styles.toneLabel}>Tone mapping</div>
            <TonemapSelect
              value={render.tonemap}
              onChange={(mode) => dispatch(renderPatched({ tonemap: mode }))}
            />
          </div>
        </CollapsibleSection>

        {/* The app's visibility fade, which multiplies into BOTH halves of the
            spike above — so the sprite/analytic comparison holds as the cloud
            dims instead of being interrupted by it. */}
        <FadeSection readout={fade} />

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
          <div className={styles.toggleRow}>
            <CompactInfoTip
              label="The app writes tone-mapped linear light straight into a non-sRGB swap chain with no encode. Whether that is right is an open question — this toggle is the A/B."
              align="start"
            >
              <button type="button" className={styles.infoIcon} aria-label="About gamma encode">
                ⓘ
              </button>
            </CompactInfoTip>
            <label className={styles.toggleLabel}>
              <span>Gamma encode (pow 1/2.2)</span>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={render.gammaEncode}
                onChange={(e) => dispatch(renderPatched({ gammaEncode: e.target.checked }))}
              />
            </label>
          </div>
        </CollapsibleSection>

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
            info="View-dependent: hides sprites smaller than the threshold on screen right now, and brightens the survivors so the field's total light holds. Higher = faster, especially with many galaxies. Fly in and they reappear. 0 disables the cull."
          />
          <ParamSlider
            label="Star target divisor"
            value={render.aggregateDivisor}
            min={1}
            max={6}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ aggregateDivisor: Math.round(v) }))}
            info="Stars render into an offscreen at 1/N the canvas and are bilinearly added back into HDR, so their fragment cost — the actual wall — falls as N². 1 is full resolution, the reference the reconstruction has to be judged against. Moving it reallocates that target and rescales the two px knobs above, which clamp in its pixels."
          />
          <ParamSlider
            label="Field target divisor"
            value={render.fieldDivisor}
            min={1}
            max={8}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ fieldDivisor: Math.round(v) }))}
            info="The same trade for the ANALYTIC field, on its own target. It goes coarser than the sprites can: the field is a sum of wide Gaussians with no point-like detail to lose, and it is fill-bound, so cost falls as N². The ceiling is bloom fireflies zoomed out, not blur — the ray integral is a POINT sample with no pixel-footprint filtering, so a core narrower than a texel aliases into a value that crosses the bloom threshold."
          />
          <ParamSlider
            label="Dust divisor"
            value={render.dustDivisor}
            min={1}
            max={8}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ dustDivisor: Math.round(v) }))}
            info="Its own divisor, separate from the field's: the dust splat is much higher-frequency than the smooth emission field, so it needs a finer target to avoid decimating thin lanes into beads."
          />
          <ParamSlider
            label="HII target divisor"
            value={render.hiiDivisor}
            min={1}
            max={8}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => dispatch(renderPatched({ hiiDivisor: Math.round(v) }))}
            info="Its own divisor, separate from the field's: an HII shell sprite is small and bright by construction, so sharing a coarser target collapses it under a texel and bloom turns the spike into a firefly. 1 (full canvas) is the default for exactly that reason."
          />
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
