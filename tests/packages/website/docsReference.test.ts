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
import {
  DOCS_BODY_NAMES,
  DOCS_CLIP_IDS,
  DOCS_EXHIBIT_IDS,
  DOCS_FOCUS_IDS,
  DOCS_ORIENTATIONS,
  DOCS_POSE_SITES,
  DOCS_TOUR_CLIP_IDS,
  DOCS_TOUR_IDS,
  DOCS_URL_PARAMS,
} from '../../../packages/website/src/data/docsUrlParams';
import { clipFactories } from '../../../src/data/animation/clips/clipRegistry';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { BODY_PICK_ROWS } from '../../../src/data/bodies/bodyPickRows';
import { SURFACE_FIXED_SITES } from '../../../src/data/bodies/surfaceFixedSites';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { BLACK_HOLE_FOCUS_PREFIX } from '../../../src/layers/blackHoles/present/blackHoleFocusPrefix';
import { BODY_FOCUS_PREFIX } from '../../../src/services/url/bodyFocusId';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { STAR_FOCUS_PREFIX } from '../../../src/services/url/starFocusId';
import { SHORTCUTS_BY_KEY } from '../../../src/state/input/keyboardShortcuts';
import { HASH_PARAM_SOURCES } from '../../../src/state/url/hashParamSources';

const APP_SRC = resolve(import.meta.dirname, '../../../src');
const sorted = (names: readonly string[]) => [...names].sort();

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

  it('lists the values the app takes for orientation, exhibit, tour and clip', () => {
    expect(sorted(DOCS_ORIENTATIONS.map((row) => row.id))).toEqual(
      sorted(Object.keys(ORIENTATION_FRAMES)),
    );
    expect(sorted(DOCS_EXHIBIT_IDS.map((row) => row.id))).toEqual(
      sorted(Object.keys(exhibitRegistry)),
    );
    expect(sorted(DOCS_TOUR_IDS.map((row) => row.id))).toEqual(sorted(Object.keys(tourRegistry)));
    expect(sorted([...DOCS_CLIP_IDS, ...DOCS_TOUR_CLIP_IDS])).toEqual(
      sorted(Object.keys(clipFactories)),
    );
  });

  it('lists every way a focus id can begin, every body and every site a pose can name', () => {
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
    expect([...DOCS_BODY_NAMES]).toEqual(
      Object.values(BODY_PICK_ROWS).flatMap((seeds) => seeds.map((seed) => seed.id)),
    );
    expect(sorted(DOCS_POSE_SITES)).toEqual(sorted(SURFACE_FIXED_SITES.map((site) => site.id)));
  });
});
