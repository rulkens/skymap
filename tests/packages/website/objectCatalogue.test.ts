/**
 * The object catalogue page is generated from the app's registries
 * (packages/website/src/data/objectCatalogue.ts). These hold the generated
 * rows to the app from the other side: every link is read by the app's own
 * parser and its id found by the decoder or the table that resolves it, and
 * every entry of a registry is a row, so a body, star, place, exhibit or tour
 * the derivation does not reach fails here instead of going missing.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ObjectKind } from '../../../packages/website/src/@types/ObjectKind';
import { OBJECT_ROWS, OBJECT_SECTIONS } from '../../../packages/website/src/data/objectCatalogue';
import { objectSubLists } from '../../../packages/website/src/utils/objectSubLists';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { BODY_PICK_ROWS } from '../../../src/data/bodies/bodyPickRows';
import { SEEDED_STAR_CATALOGS } from '../../../src/data/bodies/seededStarCatalogs';
import { exhibitRegistry } from '../../../src/data/exhibits/exhibitRegistry';
import { EARTH_PLACES } from '../../../src/data/palette/earthPlaces';
import { buildStaticAnchorStructures } from '../../../src/data/structure/buildStaticAnchorStructures';
import { BLACK_HOLE_SOURCE_ROWS } from '../../../src/layers/blackHoles/sources/blackHoleSourceRows';
import { encodeBlackHoleFocusId } from '../../../src/layers/blackHoles/present/encodeBlackHoleFocusId';
import { BODY_FOCUS_PREFIX } from '../../../src/services/url/bodyFocusId';
import { decodeStarFocusId } from '../../../src/services/url/decodeStarFocusId';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { STAR_FOCUS_PREFIX } from '../../../src/services/url/starFocusId';
import { isRegistryBodyId } from '../../../src/utils/scene/isRegistryBodyId';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';

const ROOT = resolve(import.meta.dirname, '../../..');
const PAGE = readFileSync(
  resolve(ROOT, 'packages/website/src/content/docs/reference/objects.mdx'),
  'utf8',
);
const rowsOf = (...kinds: ObjectKind[]) => OBJECT_ROWS.filter((row) => kinds.includes(row.kind));
const ids = (...kinds: ObjectKind[]) =>
  rowsOf(...kinds)
    .map((row) => row.id)
    .sort();
const structureIds = new Set(buildStaticAnchorStructures().map((structure) => structure.id));

/** Whether the app has something behind an id of a `focus` link, by the same decoder or table the app resolves it with. */
const RESOLVES: Record<ObjectKind, (id: string) => boolean> = {
  sun: (id) => decodeStarFocusId(id, false) !== null,
  star: (id) => decodeStarFocusId(id, false) !== null,
  sStar: (id) => decodeStarFocusId(id, false) !== null,
  planet: (id) => isRegistryBodyId(id.slice(BODY_FOCUS_PREFIX.length)),
  moon: (id) => isRegistryBodyId(id.slice(BODY_FOCUS_PREFIX.length)),
  spacecraft: (id) => isRegistryBodyId(id.slice(BODY_FOCUS_PREFIX.length)),
  model: (id) => isRegistryBodyId(id.slice(BODY_FOCUS_PREFIX.length)),
  milkyWay: (id) => id === MILKY_WAY_FOCUS_ID,
  blackHole: (id) =>
    BLACK_HOLE_SOURCE_ROWS.some(([, hole]) => encodeBlackHoleFocusId(hole.id) === id),
  // The app's resolver takes any id of the famous-galaxy shape; the list it checks against is in its data files (below).
  galaxy: (id) => /^[a-z0-9]+$/.test(id),
  group: (id) => structureIds.has(id),
  cluster: (id) => structureIds.has(id),
  supercluster: (id) => structureIds.has(id),
  void: (id) => structureIds.has(id),
  exhibit: (id) => id in exhibitRegistry,
  tour: (id) => id in tourRegistry,
  place: () => false,
};

describe('object catalogue', () => {
  it('has rows in every section, and every row in one section', () => {
    for (const section of OBJECT_SECTIONS)
      for (const kind of section.kinds) expect(rowsOf(kind), kind).not.toEqual([]);
    const placed = OBJECT_SECTIONS.flatMap((section) => rowsOf(...section.kinds));
    expect(placed).toHaveLength(OBJECT_ROWS.length);
    expect(new Set(placed).size).toBe(OBJECT_ROWS.length);
  });

  it('gives each row an anchor no other row or section heading has', () => {
    const anchors = [...OBJECT_ROWS.map((row) => row.anchor), ...OBJECT_SECTIONS.map((s) => s.id)];
    expect(anchors.filter((anchor, i) => anchors.indexOf(anchor) !== i)).toEqual([]);
    expect(anchors.filter((anchor) => !/^[A-Za-z][\w-]*$/.test(anchor))).toEqual([]);
  });

  it('writes links the app’s parser reads as the row’s own object', () => {
    const wrong = OBJECT_ROWS.filter((row) => row.link !== undefined).filter((row) => {
      const { view } = linkIntentFrom(row.link!);
      const kind = row.kind === 'exhibit' || row.kind === 'tour' ? row.kind : 'focus';
      return !(view.kind === kind && view.id === row.id && RESOLVES[row.kind](row.id));
    });
    expect(wrong.map((row) => row.link)).toEqual([]);
  });

  it('leaves only the places on Earth without a link', () => {
    expect(OBJECT_ROWS.filter((row) => row.link === undefined)).toEqual(rowsOf('place'));
  });

  it('lists every body, named star, place, structure, exhibit and tour the app has', () => {
    const prefixed = (prefix: string, rows: readonly { id: string }[]) =>
      rows.map((row) => `${prefix}${row.id}`).sort();
    expect(ids('planet', 'moon', 'spacecraft', 'model')).toEqual(
      prefixed(BODY_FOCUS_PREFIX, Object.values(BODY_PICK_ROWS).flat()),
    );
    expect(ids('sun', 'star', 'sStar')).toEqual(
      prefixed(STAR_FOCUS_PREFIX, Object.values(SEEDED_STAR_CATALOGS).flat()),
    );
    expect(ids('place')).toEqual(prefixed('', EARTH_PLACES));
    expect(ids('group', 'cluster', 'supercluster', 'void')).toEqual([...structureIds].sort());
    expect(ids('exhibit')).toEqual(Object.keys(exhibitRegistry).sort());
    expect(ids('tour')).toEqual(
      Object.values(tourRegistry)
        .filter((tour) => tour.dev !== true)
        .map((tour) => tour.id)
        .sort(),
    );
  });

  it('files each structure under its own kind', () => {
    expect(
      OBJECT_ROWS.filter((row) => structureIds.has(row.id) && !row.id.startsWith(`${row.kind}-`)),
    ).toEqual([]);
  });

  it('files every moon under a planet and tells a spacecraft from the other models', () => {
    const planets = rowsOf('planet').map((row) => row.name);
    expect(rowsOf('moon').filter((row) => !planets.includes(row.parent ?? ''))).toEqual([]);
    expect(rowsOf('planet').map((row) => row.id)).toContain('body-earth');
    expect(ids('model')).toEqual(['body-petunias', 'body-soendermarken', 'body-whale']);
  });

  it('orders names as a reader does and cuts a long list at each new letter or parent', () => {
    const galaxies = ids('galaxy');
    const order = rowsOf('galaxy').map((row) => row.id);
    expect(order.indexOf('m31')).toBeLessThan(order.indexOf('m100'));
    expect(galaxies).toHaveLength(new Set(galaxies).size);
    for (const section of OBJECT_SECTIONS.filter((candidate) => candidate.split)) {
      const labels = objectSubLists(section, rowsOf(...section.kinds)).map((list) => list.label);
      expect(labels, section.id).not.toContain(undefined);
      expect(new Set(labels).size, section.id).toBe(labels.length);
    }
  });

  // The app fetches the named galaxies from its data files, built from the seed the page reads. Where a checkout has them, the two must agree.
  const dataDir = resolve(ROOT, 'public/data');
  const built = existsSync(dataDir)
    ? readdirSync(dataDir).find((name) => /^famous_galaxies_meta\.[0-9a-f]+\.json$/.test(name))
    : undefined;
  it.skipIf(!built)('lists the named galaxies the app’s data files hold', () => {
    const meta = JSON.parse(readFileSync(resolve(dataDir, built!), 'utf8')) as {
      id: string;
      names: string[];
    }[];
    expect(ids('galaxy')).toEqual(meta.map((galaxy) => galaxy.id).sort());
    const named = new Map(rowsOf('galaxy').map((row) => [row.id, row.name]));
    expect(meta.filter((galaxy) => named.get(galaxy.id) !== galaxy.names[0])).toEqual([]);
  });
});

describe('object catalogue page', () => {
  it('has one heading and one list for each section, in the data’s order', () => {
    const headings = [...PAGE.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual(OBJECT_SECTIONS.map((section) => section.title));
    const lists = [...PAGE.matchAll(/<ObjectList section="([^"]+)" \/>/g)].map((match) => match[1]);
    expect(lists).toEqual(OBJECT_SECTIONS.map((section) => section.id));
  });

  it('names each section by the id its heading gets, so the jump list lands on it', () => {
    const slug = (title: string) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/ /g, '-');
    expect(OBJECT_SECTIONS.filter((section) => section.id !== slug(section.title))).toEqual([]);
  });
});
