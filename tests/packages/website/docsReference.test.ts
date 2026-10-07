/**
 * The two Reference pages print their tables from data/docsControls.ts and
 * data/docsUrlParams.ts. These hold those lists to the app's own: a key added
 * to the shortcut table, a parameter added to the address, or a new exhibit,
 * tour, clip, orientation or body would otherwise be missing from a page that
 * says it is complete. The mouse, wheel and touch handlers, and the keys the
 * search, the clock's boxes, the welcome screen and the sliders handle, are
 * written inline in the app and cannot be compared this way.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DOCS_CONTROLS } from '../../../packages/website/src/data/docsControls';
import { DOCS_SETTINGS } from '../../../packages/website/src/data/docsSettings';
import { DOCS_SETTING_SIZES } from '../../../packages/website/src/data/docsSettingSizes';
import {
  DOCS_EXHIBIT_IDS,
  DOCS_FOCUS_IDS,
  DOCS_ORIENTATIONS,
  DOCS_TOUR_IDS,
  DOCS_URL_PARAMS,
} from '../../../packages/website/src/data/docsUrlParams';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';
import type { LabelCategory } from '../../../src/@types/engine/data/LabelCategory';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
import { FLOW_SLIDER_FIELDS } from '../../../src/data/flow/flowFields';
import { orientationFrameLabel } from '../../../src/data/orientation/orientationFrameLabel';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { SOURCE_ENTRIES } from '../../../src/data/sourceEntries';
import { CATEGORY_DISPLAY_INFO } from '../../../src/data/structure/categoryDisplayInfo';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../../src/data/toneMapCurve';
import { BLACK_HOLE_FOCUS_PREFIX } from '../../../src/layers/blackHoles/present/blackHoleFocusPrefix';
import { MILKY_WAY_STARS_PER_TIER } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { BODY_FOCUS_PREFIX } from '../../../src/services/url/bodyFocusId';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { STAR_FOCUS_PREFIX } from '../../../src/services/url/starFocusId';
import { SHORTCUTS_BY_KEY } from '../../../src/state/input/keyboardShortcuts';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { HASH_PARAM_SOURCES } from '../../../src/state/url/hashParamSources';
import { appViewProblem } from '../../../tools/site/utils/appViewProblem';
import { initialTierFromViewport } from '../../../src/utils/initialTierFromViewport';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';

const ROOT = resolve(import.meta.dirname, '../../..');
const APP_SRC = join(ROOT, 'src');
const sorted = (names: readonly string[]) => [...names].sort();

/** Every value in a nested object, keyed by its path with dots. */
function leaves(value: unknown, path = '', out: Record<string, unknown> = {}) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    for (const [key, child] of Object.entries(value))
      leaves(child, path ? `${path}.${key}` : key, out);
  else out[path] = value;
  return out;
}

describe('Controls page', () => {
  it('lists every key of the app’s shortcut table, and no key that is not in it', () => {
    const listed = DOCS_CONTROLS.flatMap((group) =>
      group.rows.flatMap((row) => row.shortcut ?? []),
    );
    expect(sorted(listed)).toEqual(sorted(Object.keys(SHORTCUTS_BY_KEY)));
  });

  it('prints as many keys as a row has shortcuts', () => {
    const rows = DOCS_CONTROLS.flatMap((group) => group.rows).filter((row) => row.shortcut);
    expect(rows.filter((row) => row.shortcut!.length !== row.input.length)).toEqual([]);
  });
});

describe('Settings page', () => {
  const rows = DOCS_SETTINGS.flatMap((group) => group.rows);
  const app = leaves({ ...INITIAL_SETTINGS, tier: initialTierFromViewport(1200) });
  const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

  // Values the app's settings hold that no control of the Settings panel
  // changes: the debug panel's, a tour's or an exhibit's, or nobody's.
  const NOT_IN_PANEL = [
    /^debug\./,
    /^picking\./,
    /^labels\.focusedOnly$/,
    /^thumbnails\.enabled$/,
    /^blackHoleLensingTuning\./,
    /^bodies\.items\.[\w-]+\.enabled$/,
    /^(constellations|localBubble)\.intensity$/,
    /^flow\.(mode|count|trail|flowSpeed|densityBias|wander|boundaryFadeWidth)$/,
    /^galaxyCatalogs\.(brightness|provenance\..+)$/,
    /^galaxyCatalogs\.items\.(sdss|2mrs|glade|milliquas|desiDeep|desiWedge|desiSgw)\.labelEnabled$/,
    /^starCatalogs\.items\.(gaiaStars|sStar)\.labelEnabled$/,
    /^milkyWay\.(enabled|starSizeScale|exposure|starPxMin|starPxMax|softness|lodApparent|aggregateDivisor|starCount)$/,
    /^cosmicWebDensity\.items\.[\w-]+\.(contrast|densityScale|paletteId|trim|exposure|bands|intensity)$/,
    /^zoneOfAvoidance\.(intensity|radialFalloff|edgeSharpness|color|labelColor)$/,
  ];

  it('starts every setting where the app does', () => {
    const wrong = rows
      .filter((row) => row.state !== undefined && app[row.state] !== row.firstValue)
      .map((row) => `${row.name}: page ${String(row.firstValue)}, app ${String(app[row.state!])}`);
    expect(wrong).toEqual([]);
  });

  it('has a row for every value of the app’s settings that the panel changes', () => {
    const listed = new Set(rows.flatMap((row) => row.state ?? []));
    const missing = Object.keys(app).filter(
      (path) => !listed.has(path) && !NOT_IN_PANEL.some((pattern) => pattern.test(path)),
    );
    expect(missing).toEqual([]);
    const idle = NOT_IN_PANEL.filter(
      (pattern) => !Object.keys(app).some((path) => pattern.test(path)),
    );
    expect(idle).toEqual([]);
    expect(rows.filter((row) => row.state !== undefined && !(row.state in app))).toEqual([]);
  });

  it('names each switch of a catalogue, a structure and a name as the app’s lists do', () => {
    const entry = (id: string) => SOURCE_ENTRIES.find((candidate) => candidate.id === id);
    const named = (prefix: string, name: (id: string) => string | undefined) =>
      rows
        .filter((row) => row.state?.startsWith(prefix) && row.state.endsWith('.enabled'))
        .filter((row) => name(row.state!.slice(prefix.length, -'.enabled'.length)) !== row.name);
    expect(named('galaxyCatalogs.items.', (id) => entry(id)?.label)).toEqual([]);
    expect(named('cosmicWebDensity.items.', (id) => entry(id)?.label)).toEqual([]);
    expect(
      named('starCatalogs.items.', (id) => {
        const found = entry(id) as { label: string; plural?: string } | undefined;
        return found?.plural ?? found?.label;
      }),
    ).toEqual([]);
    expect(
      named('structures.items.', (id) => CATEGORY_DISPLAY_INFO[id as LabelCategory]?.plural),
    ).toEqual([]);

    const guides = DOCS_SETTINGS.find((group) => group.id === 'labels-and-guides')!.rows.slice(1);
    expect(guides.map((row) => row.name)).toEqual([
      ...LABEL_CATEGORIES.map((category) => CATEGORY_DISPLAY_INFO[category].plural),
      'Orbit trails',
      ...layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides').map((row) => row.label),
    ]);
  });

  it('lists the choices of each list as the app builds them', () => {
    const values = (name: string) => rows.find((row) => row.name === name)!.values;
    // The panel puts the starting one first, whatever the registry's order.
    expect(sorted(values('Orientation').split(', '))).toEqual(
      sorted((Object.keys(ORIENTATION_FRAMES) as OrientationFrameId[]).map(orientationFrameLabel)),
    );
    expect(values('Tone curve')).toBe(ALL_TONE_MAP_CURVES.map(toneMapCurveLabel).join(', '));
    // Written inline in the components.
    const options = (file: string, pattern: RegExp) =>
      [...read(file).matchAll(pattern)].map((match) => match[1]).join(', ');
    expect(values('Tier')).toBe(
      options('src/components/SettingsPanel/TierChip.tsx', /label: '(\w+)'/g),
    );
    expect(values('Density correction')).toBe(
      options(
        'src/layers/galaxyCatalog/ui/GalaxiesSection.tsx',
        /<option value=\{BiasMode\.\w+\}>([^<]+)</g,
      ),
    );
  });

  // Sliders and headings are written inline in each section's component.
  it('names every slider and heading its component draws, and no other', () => {
    for (const file of new Set(DOCS_SETTINGS.map((group) => group.file))) {
      const groups = DOCS_SETTINGS.filter((group) => group.file === file);
      const text = read(file).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const sliders = [...text.matchAll(/<Slider\s+label="([^"]+)"/g)].map((match) => match[1]!);
      const titles = [...text.matchAll(/<CollapsibleSection\s+title="([^"]+)"/g)].map((m) => m[1]!);
      // The two patterns want the name as the tag's first prop: a tag written another way must fail here, not go unread.
      expect(text.match(/<(Slider|CollapsibleSection)\b/g) ?? [], file).toHaveLength(
        sliders.length + titles.length,
      );
      const flow = file.includes('/flow/')
        ? FLOW_SLIDER_FIELDS.filter((field) => field.surface === 'panel').map(
            (field) => field.label,
          )
        : [];
      expect(
        sorted(
          groups.flatMap((g) => g.rows.filter((r) => r.control === 'slider').map((r) => r.name)),
        ),
        file,
      ).toEqual(sorted([...sliders, ...flow]));
      if (!file.endsWith('TierChip.tsx'))
        expect(sorted(groups.map((group) => group.title)), file).toEqual(sorted(titles));
    }
  });

  // The catalogue counts in the same table are in the data files, which a test cannot open.
  it('gives the Milky Way the points the app gives it at each data size', () => {
    const row = DOCS_SETTING_SIZES.find((size) => size.what.includes('Milky Way'))!;
    expect([row.small, row.medium, row.large]).toEqual(
      (['small', 'medium', 'large'] as const).map((tier) =>
        MILKY_WAY_STARS_PER_TIER[tier].toLocaleString('en-GB'),
      ),
    );
  });

  it('covers every section the panel draws', () => {
    const drawn = [
      ...APP_COMPOSITION.layers.flatMap((layer) =>
        (layer.ui ?? []).filter((slot) => slot.slot === 'main'),
      ),
    ].length;
    const layerFiles = new Set(
      DOCS_SETTINGS.filter((group) => group.file.startsWith('src/layers/')).map((g) => g.file),
    );
    expect(layerFiles.size).toBe(drawn);
  });
});

describe('URL parameters page', () => {
  const hash = DOCS_URL_PARAMS.filter((param) => param.part === 'hash');

  it('lists every parameter the app reads after the #', () => {
    expect(sorted(hash.map((param) => param.name))).toEqual(
      sorted(HASH_PARAM_SOURCES.map((source) => source.key)),
    );
  });

  it('says a # parameter skips the welcome screen where the app marks it a deep link', () => {
    expect(Object.fromEntries(hash.map((param) => [param.name, param.skipsWelcome]))).toEqual(
      Object.fromEntries(HASH_PARAM_SOURCES.map((source) => [source.key, source.deepLink])),
    );
  });

  // The flags are read by name where they are used, so the names are found in the source text.
  it('lists every flag the app reads after the ?', () => {
    const read = new Set<string>();
    for (const name of readdirSync(APP_SRC, { recursive: true, encoding: 'utf8' })) {
      if (!/\.tsx?$/.test(name) || name.endsWith('.d.ts')) continue;
      const text = readFileSync(join(APP_SRC, name), 'utf8');
      for (const match of text.matchAll(
        /^(?!\s*(?:\*|\/\/)).*\b(?:hasUrlGate|searchHasGate)\((?:search, )?'(\w+)'\)/gm,
      ))
        read.add(match[1]!);
    }
    const listed = DOCS_URL_PARAMS.filter((param) => param.part === 'query').map((p) => p.name);
    expect(sorted(listed)).toEqual(sorted([...read]));
  });

  it('lists the values the app takes for orientation, exhibit and tour', () => {
    expect(sorted(DOCS_ORIENTATIONS.map((row) => row.id))).toEqual(
      sorted(Object.keys(ORIENTATION_FRAMES)),
    );
    expect(sorted(DOCS_EXHIBIT_IDS.map((row) => row.id))).toEqual(
      sorted(Object.keys(exhibitRegistry)),
    );
    expect(sorted(DOCS_TOUR_IDS.map((row) => row.id))).toEqual(sorted(Object.keys(tourRegistry)));
  });

  it('lists every way a focus id can begin, each with an example the app reads', () => {
    const prefixes = new Set(DOCS_FOCUS_IDS.flatMap((row) => row.prefix ?? []));
    expect(sorted([...prefixes])).toEqual(
      sorted([
        BODY_FOCUS_PREFIX,
        STAR_FOCUS_PREFIX,
        BLACK_HOLE_FOCUS_PREFIX,
        MILKY_WAY_FOCUS_ID,
        ...STRUCTURE_IDS.map((kind) => `${kind}-`),
        // Written inline in galaxyCatalogSelectionRow.ts.
        'pgc-',
        'sdss-',
        'pos@',
      ]),
    );
    expect(
      DOCS_FOCUS_IDS.filter((row) => row.prefix && !row.example.startsWith(row.prefix)),
    ).toEqual([]);
    expect(DOCS_FOCUS_IDS.filter((row) => appViewProblem(`focus=${row.example}`) !== null)).toEqual(
      [],
    );
  });
});
