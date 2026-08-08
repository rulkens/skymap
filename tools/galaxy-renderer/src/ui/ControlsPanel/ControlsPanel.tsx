/**
 * ControlsPanel — the 340px right column: every galaxy-shape,
 * rendering, and perf-test knob in one scrollable rail. A layout/dispatch
 * shell — the actual domain logic (what a Hubble-type pick nudges,
 * what a "randomize everything" draw looks like, what range each slider
 * gets) lives in `hubbleTypePatch`/`randomGalaxyParams`/`PARAM_SPEC`; this
 * component only decides which sliders are visible for the current
 * category and wires their `onChange` to a `paramsPatched` dispatch.
 *
 * Slider visibility per Hubble category mirrors the spike's `renderVals`
 * exactly, including `hii` (POPULATIONS) and the lenticular-only dust-ring
 * trio (DUST). Those four had no `SPEC` entry in the spike, so their range
 * came from `mk()`'s inline fallback args instead — live, not dead, for
 * exactly these keys (see `paramSpec.ts`'s docblock). `PARAM_SPEC` now
 * carries those four ranges too, so it stays this tool's ONLY range table.
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
import type { GalaxyLegacyParams } from '../../../../../src/@types/galaxy/GalaxyLegacyParams';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxySharedParams } from '../../../../../src/@types/galaxy/GalaxySharedParams';
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
import { GALAXY_LEGACY_PARAM_KEYS } from '../../data/galaxyLegacyParamKeys';
import { PARAM_SPEC, type GalaxyParamKey } from '../../data/paramSpec';
import { hubbleTypePatch } from '../../data/hubbleStagePatches';
import { randomGalaxyParams } from '../../data/randomGalaxyParams';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import ArmCloudSection from '../ArmCloudSection/ArmCloudSection';
import ArmFieldSection from '../ArmFieldSection/ArmFieldSection';
import SpursSection from '../SpursSection/SpursSection';
import CollapsibleSection from '../CollapsibleSection/CollapsibleSection';
import DebugViewsSection from '../DebugViewsSection/DebugViewsSection';
import DustSection from '../DustSection/DustSection';
import DustCloudSection from '../DustCloudSection/DustCloudSection';
import FadeSection from '../FadeSection/FadeSection';
import FieldSection from '../FieldSection/FieldSection';
import HiiSection from '../HiiSection/HiiSection';
import ParamSlider from '../ParamSlider/ParamSlider';
import IsmMapSection from '../IsmMapSection/IsmMapSection';
import SliderGroup from '../SliderGroup/SliderGroup';
import TonemapSelect from '../TonemapSelect/TonemapSelect';
import TypePicker from '../TypePicker/TypePicker';
import MultiGalaxySection from '../MultiGalaxySection/MultiGalaxySection';
import PresetsSection from '../PresetsSection/PresetsSection';
import styles from './ControlsPanel.module.css';

// Every flat `shared`/`legacy` field except the per-arm `armAges` array is a
// plain number — this narrows `GalaxyParamKey` down to the subset a
// single-value slider can actually drive. `armAges` has no UI surface (pin it
// in a preset object instead, per barAngleDeg's pattern). A key's OWNING bag
// (`shared` vs `legacy`) is looked up via `GALAXY_LEGACY_PARAM_KEYS` at each
// read/write site below, mirroring `fieldTuningPatched`'s section shape: read
// the bag, spread the one field in, dispatch the whole bag.
type GalaxySliderKey = Exclude<GalaxyParamKey, 'armAges'>;

function isLegacyKey(key: GalaxySliderKey): key is keyof GalaxyLegacyParams {
  return (GALAXY_LEGACY_PARAM_KEYS as ReadonlySet<string>).has(key);
}

function readGalaxyField(galaxy: GalaxyParams, key: GalaxySliderKey): number | undefined {
  return isLegacyKey(key)
    ? galaxy.legacy?.[key]
    : (galaxy.shared[key as keyof GalaxySharedParams] as number | undefined);
}

/**
 * Builds the whole-bag patch a single-field edit dispatches — `paramsPatched`
 * Object.assigns the bag wholesale (`galaxySlice`'s docblock), so every other
 * field the bag already holds has to ride along or it's dropped.
 */
function patchGalaxyField(
  galaxy: GalaxyParams,
  key: GalaxySliderKey,
  value: number,
): Partial<GalaxyParams> {
  return isLegacyKey(key)
    ? { legacy: { ...galaxy.legacy, [key]: value } }
    : { shared: { ...galaxy.shared, [key]: value } };
}

type SliderSpec = {
  readonly key: GalaxySliderKey;
  readonly label: string;
  readonly format?: (value: number) => string;
  readonly seedKey?: 'asymSeed' | 'clumpSeed' | 'waveSeed';
  /** Hover explainer, for the knobs whose label alone gets misread. */
  readonly info?: string;
};

// The three fields whose range input still emits fractional
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

// Always radius/irregularity; bulge/disk/warp
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
  // The SHARED-bag arm fields: both generators read them, so they live here
  // rather than under LEGACY MODEL's SPIRAL ARMS (which keeps only the
  // legacy-only trio — see `buildArmSliders`).
  if (category === 'spiral' || category === 'barred') {
    specs.push({
      key: 'armStart',
      label: 'Arm start',
      format: (v) => v.toFixed(2),
      info: 'Multiplier on the derived arm start radius (bar/bulge-relative); below 1 pulls the arms inward toward the bulge.',
    });
    specs.push({ key: 'armCount', label: 'Spiral arms', format: (v) => String(v) });
    specs.push({ key: 'armWinding', label: 'Arm pitch (tight→loose)' });
    specs.push({
      key: 'armFalloff',
      label: 'Arm edge falloff',
      info: 'Sets HOW FAR the arms extend — the only knob that does. 0 reaches 1.7x the disc radius, 1 stops at 0.65x. It is a generation knob, so moving it regenerates.',
    });
    specs.push({ key: 'armEdgeVar', label: 'Arm length variation', seedKey: 'asymSeed' });
    specs.push({ key: 'armClump', label: 'Arm clumpiness', seedKey: 'clumpSeed' });
    specs.push({ key: 'armWave', label: 'Arm waviness', seedKey: 'waveSeed' });
  }
  if (category === 'barred') specs.push({ key: 'barStrength', label: 'Bar length' });
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

// SHAPE & SIZE's own four `SliderGroup` clusters — a `buildShapeSliders`
// entry falls into exactly one, by key, regardless of which category left it
// in the list. `irregularity` rides with warp: it's the other axis a
// category's default silhouette departs from, not a size knob. `ARM_KEYS` is
// the SHARED-bag arm subset (drives both generators); the LEGACY-bag trio
// (`armWidth`/`armStrength`/`subArms`) stays under LEGACY MODEL's SPIRAL ARMS
// instead — see `buildArmSliders`.
const SIZE_KEYS: ReadonlySet<GalaxySliderKey> = new Set(['radius']);
const BULGE_DISC_KEYS: ReadonlySet<GalaxySliderKey> = new Set([
  'bulgeSize',
  'bulgeFalloff',
  'diskThickness',
]);
const ARM_KEYS: ReadonlySet<GalaxySliderKey> = new Set([
  'armStart',
  'armCount',
  'armWinding',
  'armFalloff',
  'armEdgeVar',
  'armClump',
  'armWave',
  'barStrength',
]);
const WARP_KEYS: ReadonlySet<GalaxySliderKey> = new Set([
  'warpStrength',
  'warpTwist',
  'irregularity',
]);

// The legacy-only trio: `armWidth`/`armStrength`/`subArms` drive ONLY the
// sprite generator, so this group — unlike the shared arm fields in
// `buildShapeSliders`'s `ARM_KEYS` above — stays under LEGACY MODEL.
function buildArmSliders(category: ReturnType<typeof classifyHubbleType>): SliderSpec[] {
  if (category !== 'spiral' && category !== 'barred') return [];
  return [
    { key: 'armWidth', label: 'Arm width' },
    { key: 'armStrength', label: 'Arm definition' },
    { key: 'subArms', label: 'Sub-arms / spurs' },
  ];
}

// hii/youngStars/metallicity for star-forming categories.
// The spike gave irregular's hii slider a narrower [0, 0.5] display range
// than spiral/barred's [0, 2]; PARAM_SPEC has one
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

// Every category except elliptical; lenticular additionally
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

// Unconditional: every category gets a cluster count/size/brightness triplet.
const GLOB_SLIDERS: readonly SliderSpec[] = [
  { key: 'globularCount', label: 'Cluster count', format: (v) => String(v) },
  { key: 'globularSize', label: 'Cluster size' },
  { key: 'globularBright', label: 'Cluster brightness' },
];

function freshRng(): () => number {
  return mulberry32((Math.random() * 1e9) | 0);
}

/**
 * A section's own galaxy values, read off the slider list that renders it, so
 * the copy payload can never drift from what the section actually shows. Each
 * reseed button's seed comes along: it is as much a value of that section as
 * the slider it sits under, and the look is not reproducible without it.
 */
function galaxyValues(galaxy: GalaxyParams, specs: readonly SliderSpec[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const spec of specs) {
    values[spec.key] = readGalaxyField(galaxy, spec.key);
    if (spec.seedKey) values[spec.seedKey] = readGalaxyField(galaxy, spec.seedKey);
  }
  return values;
}

export type ControlsPanelProps = {
  /**
   * Live fade telemetry, prop-drilled from `App` rather than dispatched into
   * the store — the same treatment `perf`/`stats` get, and for the same reason
   * (see `HudProps`): it is engine output on a 10 Hz cadence that exactly one
   * subtree reads.
   */
  readonly fade: MilkyWayFadeReadout | null;
  /** Same treatment, event-driven rather than timed — see `IsmMapSection`'s own readout. */
  readonly orientationDiagnostics: OrientationDiagnostics | null;
};

function ControlsPanel({ fade, orientationDiagnostics }: ControlsPanelProps): ReactNode {
  const dispatch = useAppDispatch();
  const galaxy = useAppSelector((state) => state.galaxy);
  const render = useAppSelector((state) => state.render);
  const lod = useAppSelector((state) => state.lod);
  const ui = useAppSelector((state) => state.ui);
  const extras = useAppSelector((state) => state.extras);

  const category = classifyHubbleType(galaxy.type);
  const shapeSliders = buildShapeSliders(category);
  const armSliders = buildArmSliders(category);
  const popSliders = buildPopSliders(category);
  const dustSliders = buildDustSliders(category);

  const handleReseed = (seedKey: 'asymSeed' | 'clumpSeed' | 'waveSeed'): void => {
    const rng = freshRng();
    dispatch(paramsPatched(patchGalaxyField(galaxy, seedKey, (rng() * 1e9) | 0)));
  };

  const renderGalaxySlider = (spec: SliderSpec): ReactNode => {
    const { min, max, step } = specFor(spec.key);
    const value = readGalaxyField(galaxy, spec.key) ?? 0;
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
          dispatch(paramsPatched(patchGalaxyField(galaxy, spec.key, coerceInteger(spec.key, v))))
        }
        onReseed={spec.seedKey ? () => handleReseed(spec.seedKey!) : undefined}
        info={spec.info}
        // Derived from the same `spec.key` `galaxyValues` keys its copy payload
        // by, so the tip and the copy block can only ever name the same field —
        // and bag-routed the same way `readGalaxyField`/`patchGalaxyField` are,
        // so the path actually resolves against the real (nested) store shape.
        path={`galaxy.${isLegacyKey(spec.key) ? 'legacy' : 'shared'}.${spec.key}`}
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
            // A "full" random draw, but merged onto the current bags rather
            // than dispatched as-is: `includeSize: false` means the draft
            // simply omits `radius`/`starCount`, and `paramsPatched` replaces
            // a bag wholesale (see `galaxySlice`'s docblock), so leaving
            // those two fields alone means spreading the draft OVER the
            // current bags here, not handing it to the store raw.
            const draft = randomGalaxyParams(rng, { includeSize: false });
            dispatch(
              paramsPatched({
                type: draft.type,
                shared: { ...galaxy.shared, ...draft.shared },
                legacy: { ...galaxy.legacy, ...draft.legacy },
              }),
            );
          }}
        >
          Randomize
        </Button>

        {/* The two global selectors, ahead of everything else: both feed
            BOTH models (the Hubble type gates which sliders even show, the
            shape/size knobs drive whichever generator is on), so neither
            belongs inside ANALYTIC MODEL or LEGACY MODEL specifically. */}
        <CollapsibleSection
          title="MORPHOLOGY · HUBBLE SEQUENCE"
          open={ui.openSections.morphology}
          onToggle={() => dispatch(sectionToggled('morphology'))}
          copyPayload={{ galaxy: { type: galaxy.type } }}
        >
          <TypePicker
            activeType={galaxy.type}
            onSelect={(type) => dispatch(paramsPatched(hubbleTypePatch(galaxy, type)))}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="SHAPE & SIZE"
          open={ui.openSections.shape}
          onToggle={() => dispatch(sectionToggled('shape'))}
          copyPayload={{
            galaxy: { ...galaxyValues(galaxy, shapeSliders), seed: galaxy.shared.seed },
          }}
        >
          <SliderGroup title="Size">
            {shapeSliders.filter((s) => SIZE_KEYS.has(s.key)).map(renderGalaxySlider)}
          </SliderGroup>
          <SliderGroup title="Bulge & disc">
            {shapeSliders.filter((s) => BULGE_DISC_KEYS.has(s.key)).map(renderGalaxySlider)}
          </SliderGroup>
          {(category === 'spiral' || category === 'barred') && (
            <SliderGroup title="Arms">
              {shapeSliders.filter((s) => ARM_KEYS.has(s.key)).map(renderGalaxySlider)}
            </SliderGroup>
          )}
          <SliderGroup title="Warp & irregularity">
            {shapeSliders.filter((s) => WARP_KEYS.has(s.key)).map(renderGalaxySlider)}
          </SliderGroup>
          <Button
            className={styles.newSeedButton}
            onClick={() => {
              const rng = freshRng();
              dispatch(paramsPatched(patchGalaxyField(galaxy, 'seed', (rng() * 1e9) | 0)));
            }}
          >
            ⟲ New random seed
          </Button>
        </CollapsibleSection>

        {/* The analytic field is a closed-form line integral of a Gaussian
            mixture, evaluated into its OWN reduced-resolution target and
            additively blended into HDR alongside the sprites' — derived from
            the generator's own geometry in `galaxyFieldMixture.ts`. Its
            header pill is the whole field GPU pass's master
            (`render.analyticField`) — the one-click A/B against the legacy
            sprite pill in LEGACY MODEL below — while each section inside
            (FLUX FIELD, ARM OVERDENSITIES) has its OWN pill choosing which
            mixture part builds. No copyPayload: it's a pure grouping, every
            value it holds already has a home in the sections nested inside. */}
        <CollapsibleSection
          title="ANALYTIC MODEL"
          open={ui.openSections.analyticModel}
          onToggle={() => dispatch(sectionToggled('analyticModel'))}
          headerToggle={render.analyticField}
          onHeaderToggleChange={(value) => dispatch(renderPatched({ analyticField: value }))}
          group
        >
          <DebugViewsSection />
          <IsmMapSection diagnostics={orientationDiagnostics} />
          <FieldSection />
          <ArmFieldSection />
          <ArmCloudSection />
          <SpursSection />
          <HiiSection />
          <DustSection />
          <DustCloudSection />
        </CollapsibleSection>

        {/* Everything the sprite generator still drives, one fold below the
            analytic model it's being replaced by — the star bag is scheduled
            for deletion (see `docs/research/milky-way/goal-and-history.md`),
            and this group is how its remaining usefulness (a reference to
            compare against) stays reachable without scrolling past the
            active work above it. The header pill is `render.spriteField`,
            symmetric with ANALYTIC MODEL's — but unlike that one it gates
            only the legacy STAR half, same as the checkbox it replaces: the
            legacy DUST half keeps its OWN pill on DUST (LEGACY) below
            (`createGalaxyEngine.ts`'s frame-loop comment spells out why the
            two were never one switch — dust gates upstream, at generation,
            not the draw list this one empties). */}
        <CollapsibleSection
          title="LEGACY MODEL"
          open={ui.openSections.legacyModel}
          onToggle={() => dispatch(sectionToggled('legacyModel'))}
          headerToggle={render.spriteField}
          onHeaderToggleChange={(value) => dispatch(renderPatched({ spriteField: value }))}
          group
        >
          <CollapsibleSection
            title="STAR BUDGET (TO BE DELETED)"
            open={ui.openSections.starBudget}
            onToggle={() => dispatch(sectionToggled('starBudget'))}
            copyPayload={{ galaxy: galaxyValues(galaxy, STAR_BUDGET_SLIDERS) }}
          >
            {STAR_BUDGET_SLIDERS.map(renderGalaxySlider)}
          </CollapsibleSection>

          {armSliders.length > 0 && (
            <CollapsibleSection
              title="SPIRAL ARMS"
              open={ui.openSections.arms}
              onToggle={() => dispatch(sectionToggled('arms'))}
              copyPayload={{ galaxy: galaxyValues(galaxy, armSliders) }}
            >
              {armSliders.map(renderGalaxySlider)}
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="POPULATIONS"
            open={ui.openSections.pop}
            onToggle={() => dispatch(sectionToggled('pop'))}
            copyPayload={{ galaxy: galaxyValues(galaxy, popSliders) }}
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
              onHeaderToggleChange={(value) =>
                dispatch(renderPatched({ legacyDustEnabled: value }))
              }
              copyPayload={{
                galaxy: galaxyValues(galaxy, dustSliders),
                render: { legacyDustEnabled: render.legacyDustEnabled },
              }}
            >
              {dustSliders.map(renderGalaxySlider)}
            </CollapsibleSection>
          )}

          {/* Sprite-generated clusters, not analytic — the legacy model's own
              globular population, so it moved in here with the rest of what
              the sprite generator drives. */}
          <CollapsibleSection
            title="GLOBULAR CLUSTERS"
            open={ui.openSections.glob}
            onToggle={() => dispatch(sectionToggled('glob'))}
            copyPayload={{ galaxy: galaxyValues(galaxy, GLOB_SLIDERS) }}
          >
            {GLOB_SLIDERS.map(renderGalaxySlider)}
          </CollapsibleSection>
        </CollapsibleSection>

        <CollapsibleSection
          title="RENDERING"
          open={ui.openSections.render}
          onToggle={() => dispatch(sectionToggled('render'))}
          copyPayload={{
            render: {
              exposure: render.exposure,
              bloom: render.bloom,
              bloomThreshold: render.bloomThreshold,
              sizeScale: render.sizeScale,
              starIntensity: render.starIntensity,
              starPxMin: render.starPxMin,
              starPxMax: render.starPxMax,
              softness: render.softness,
              tonemap: render.tonemap,
            },
          }}
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
            path="render.exposure"
          />
          <ParamSlider
            label="Bloom glow"
            value={render.bloom}
            min={0}
            max={2}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ bloom: v }))}
            path="render.bloom"
          />
          <ParamSlider
            label="Bloom threshold"
            value={render.bloomThreshold}
            min={0}
            max={6}
            step={0.05}
            onChange={(v) => dispatch(renderPatched({ bloomThreshold: v }))}
            path="render.bloomThreshold"
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
            path="render.sizeScale"
          />
          <ParamSlider
            label="Star intensity"
            value={render.starIntensity}
            min={0.02}
            max={0.4}
            step={0.01}
            onChange={(v) => dispatch(renderPatched({ starIntensity: v }))}
            path="render.starIntensity"
          />
          <ParamSlider
            label="Star px floor"
            value={render.starPxMin}
            min={0}
            max={8}
            step={0.25}
            format={(v) => v.toFixed(2)}
            onChange={(v) => dispatch(renderPatched({ starPxMin: v }))}
            path="render.starPxMin"
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
            path="render.starPxMax"
          />
          <ParamSlider
            label="Star softness"
            value={render.softness}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => dispatch(renderPatched({ softness: v }))}
            path="render.softness"
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
          copyPayload={{
            render: {
              saturation: render.saturation,
              vignette: render.vignette,
              gammaEncode: render.gammaEncode,
            },
          }}
        >
          <ParamSlider
            label="Saturation"
            value={render.saturation}
            min={0.6}
            max={1.6}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ saturation: v }))}
            path="render.saturation"
          />
          <ParamSlider
            label="Vignette"
            value={render.vignette}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => dispatch(renderPatched({ vignette: v }))}
            path="render.vignette"
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
          copyPayload={{
            lod: { lodApparent: lod.lodApparent },
            render: {
              aggregateDivisor: render.aggregateDivisor,
              fieldDivisor: render.fieldDivisor,
              dustDivisor: render.dustDivisor,
              hiiDivisor: render.hiiDivisor,
            },
          }}
        >
          <ParamSlider
            label="LOD · min on-screen size"
            value={lod.lodApparent}
            min={0}
            max={0.2}
            step={0.001}
            format={(v) => v.toFixed(3)}
            onChange={(v) => dispatch(lodPatched({ lodApparent: v }))}
            path="lod.lodApparent"
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
            path="render.aggregateDivisor"
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
            path="render.fieldDivisor"
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
            path="render.dustDivisor"
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
            path="render.hiiDivisor"
            info="Its own divisor, separate from the field's: an HII shell sprite is small and bright by construction, so sharing a coarser target collapses it under a texel and bloom turns the spike into a firefly. 1 (full canvas) is the default for exactly that reason."
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="MULTIPLE GALAXIES"
          open={ui.openSections.multi}
          onToggle={() => dispatch(sectionToggled('multi'))}
          // `regenNonce` is a reroll trigger, not a value — same exclusion the
          // preset wire format makes.
          copyPayload={{ extras: { enabled: extras.enabled, count: extras.count } }}
        >
          <MultiGalaxySection />
        </CollapsibleSection>

        <PresetsSection />
      </div>
    </div>
  );
}

export default ControlsPanel;
