import famousGalaxySeed from '../../../../data/seeds/famous_galaxies.seed.json';
import structureSeed from '../../../../data/seeds/structure_anchors.seed.json';
import { MILKY_WAY_NAMES } from '../../../../src/components/CommandPalette/paletteRowModel';
import { tourRegistry } from '../../../../src/data/animation/tours/tourRegistry';
import { BODY_SEARCH_NAMES } from '../../../../src/data/bodies/bodySearchNames';
import { ORBITAL_ELEMENTS } from '../../../../src/data/bodies/orbitalElements';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../src/data/bodies/seededStarCatalogsBySource';
import { SURFACE_FIXED_SITES } from '../../../../src/data/bodies/surfaceFixedSites';
import { exhibitRegistry } from '../../../../src/data/exhibits/exhibitRegistry';
import { EARTH_PLACES } from '../../../../src/data/palette/earthPlaces';
import { FEATURED_TABS } from '../../../../src/data/palette/featuredTabs';
import { EARTH_REF } from '../../../../src/data/selection/earthRef';
import { buildStaticAnchorStructures } from '../../../../src/data/structure/buildStaticAnchorStructures';
import { encodeBlackHoleFocusId } from '../../../../src/layers/blackHoles/present/encodeBlackHoleFocusId';
import { BLACK_HOLE_SOURCE_ROWS } from '../../../../src/layers/blackHoles/sources/blackHoleSourceRows';
import { BODY_FOCUS_PREFIX } from '../../../../src/services/url/bodyFocusId';
import { encodeStarFocusId } from '../../../../src/services/url/encodeStarFocusId';
import { MILKY_WAY_FOCUS_ID } from '../../../../src/services/url/milkyWayFocusId';
import type { ObjectKind } from '../@types/ObjectKind';
import type { ObjectRow } from '../@types/ObjectRow';
import type { ObjectSection } from '../@types/ObjectSection';
import { byName } from '../utils/byName';

/**
 * The object catalogue page (content/docs/reference/objects.mdx), read at build
 * time from the registries the app's search and its link resolver read: no row
 * is typed here. Two lists are seeds rather than app modules: the named
 * galaxies (the app fetches the file built from that seed) and the structures'
 * other names. The X-ray clusters and the catalogue superclusters exist only in
 * the app's data files, which a site build may not have, so they are left out.
 * tests/packages/website/objectCatalogue.test.ts parses every link.
 */
export const OBJECT_SECTIONS: readonly ObjectSection[] = [
  {
    id: 'sun-planets-and-dwarf-planets',
    title: 'Sun, planets and dwarf planets',
    kinds: ['sun', 'planet'],
    one: 'body',
    many: 'bodies',
  },
  { id: 'moons', title: 'Moons', kinds: ['moon'], one: 'moon', many: 'moons', split: 'parent' },
  {
    id: 'spacecraft',
    title: 'Spacecraft',
    kinds: ['spacecraft'],
    one: 'spacecraft',
    many: 'spacecraft',
  },
  { id: 'other-models', title: 'Other models', kinds: ['model'], one: 'model', many: 'models' },
  { id: 'places-on-earth', title: 'Places on Earth', kinds: ['place'], one: 'place', many: 'places' },
  { id: 'named-stars', title: 'Named stars', kinds: ['star'], one: 'star', many: 'stars', split: 'letter' },
  {
    id: 'stars-at-the-centre-of-the-milky-way',
    title: 'Stars at the centre of the Milky Way',
    kinds: ['sStar'],
    one: 'star',
    many: 'stars',
  },
  {
    id: 'the-milky-way-and-its-black-hole',
    title: 'The Milky Way and its black hole',
    kinds: ['milkyWay', 'blackHole'],
    one: 'object',
    many: 'objects',
  },
  {
    id: 'named-galaxies',
    title: 'Named galaxies',
    kinds: ['galaxy'],
    one: 'galaxy',
    many: 'galaxies',
    split: 'letter',
  },
  { id: 'galaxy-groups', title: 'Galaxy groups', kinds: ['group'], one: 'group', many: 'groups' },
  { id: 'galaxy-clusters', title: 'Galaxy clusters', kinds: ['cluster'], one: 'cluster', many: 'clusters' },
  {
    id: 'superclusters',
    title: 'Superclusters',
    kinds: ['supercluster'],
    one: 'supercluster',
    many: 'superclusters',
  },
  { id: 'voids', title: 'Voids', kinds: ['void'], one: 'void', many: 'voids' },
  { id: 'exhibits', title: 'Exhibits', kinds: ['exhibit'], one: 'exhibit', many: 'exhibits' },
  { id: 'tours', title: 'Tours', kinds: ['tour'], one: 'tour', many: 'tours' },
];

/** A row the app opens by `focus=<id>`; the id is also the row's place on the page. */
const focusRow = (row: Omit<ObjectRow, 'anchor' | 'link'>): ObjectRow => ({
  ...row,
  anchor: row.id,
  link: `focus=${row.id}`,
});

/** Other names, without the one the row is headed by and without repeats. */
const others = (name: string, names: readonly (string | undefined)[]) => {
  const rest = [...new Set(names)].filter((other): other is string => !!other && other !== name);
  return rest.length > 0 ? { aliases: rest } : {};
};

const labels = new Map<string, string>(
  [SCENE_EARTH, ...SCENE_PLANETS, ...[...SEEDED_STAR_CATALOGS_BY_SOURCE.values()].flatMap((row) => row.stars)].map(
    (body) => [body.id, body.label],
  ),
);
const orbitOf = new Map(ORBITAL_ELEMENTS.map((row) => [row.id, row.focusId]));
const hostOf = new Map(SURFACE_FIXED_SITES.map((site) => [site.id, site.hostId as string]));

// The bodies with an orbit, in the orbit table's order: the planets outwards, then each planet's moons.
const orbiting = ORBITAL_ELEMENTS.flatMap((orbit) => {
  const body = [SCENE_EARTH, ...SCENE_PLANETS].find((candidate) => candidate.id === orbit.id);
  return body ? [{ body, round: orbit.focusId }] : [];
});
const sunId = [...SEEDED_STAR_CATALOGS_BY_SOURCE.values()].find((row) => row.id === 'sun')!.stars[0]!.id;

const planets = orbiting
  .filter(({ round }) => round === sunId)
  .map(({ body }) =>
    focusRow({
      name: body.label,
      kind: 'planet',
      id: `${BODY_FOCUS_PREFIX}${body.id}`,
      ...(body.id === EARTH_REF.id ? { note: 'The home view' } : {}),
    }),
  );

const moons = orbiting
  .filter(({ round }) => round !== sunId)
  .map(({ body, round }) =>
    focusRow({
      name: body.label,
      kind: 'moon',
      id: `${BODY_FOCUS_PREFIX}${body.id}`,
      parent: labels.get(round),
    }),
  );

// The app's own list of missions is its search's Missions tab; a model that is not on it is no spacecraft.
const missionIds = new Set(
  FEATURED_TABS.find((tab) => tab.id === 'missions')!.cards.flatMap((card) =>
    card.action.kind === 'focus' ? [card.action.focusId] : [],
  ),
);
const models = SCENE_MESH_BODIES.map((body) => {
  const id = `${BODY_FOCUS_PREFIX}${body.id}`;
  const names = BODY_SEARCH_NAMES.get(body.id) ?? [];
  return focusRow({
    name: body.label,
    kind: missionIds.has(id) ? 'spacecraft' : 'model',
    id,
    parent: labels.get(hostOf.get(body.id) ?? orbitOf.get(body.id) ?? ''),
    ...others(body.label, names.filter((name) => name.toLowerCase() !== body.label.toLowerCase())),
  });
});

const STAR_KINDS: Record<string, ObjectKind> = { sun: 'sun', famousStar: 'star', sStar: 'sStar' };
const stars = [...SEEDED_STAR_CATALOGS_BY_SOURCE].flatMap(([source, catalog]) =>
  catalog.stars.map((star, index) =>
    focusRow({
      name: star.label,
      kind: STAR_KINDS[catalog.id]!,
      id: encodeStarFocusId({ type: 'starCatalog', source, index }),
      ...others(star.label, BODY_SEARCH_NAMES.get(star.id) ?? []),
    }),
  ),
);

const places = EARTH_PLACES.map(
  (place): ObjectRow => ({
    name: place.names[0]!,
    kind: 'place',
    id: place.id,
    anchor: `place-${place.id}`,
    ...others(place.names[0]!, place.names),
  }),
);

const milkyWay = focusRow({ name: MILKY_WAY_NAMES[0], kind: 'milkyWay', id: MILKY_WAY_FOCUS_ID });
const blackHoles = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) =>
  focusRow({
    name: entry.detailLabel,
    kind: 'blackHole',
    id: encodeBlackHoleFocusId(entry.id),
    ...others(entry.detailLabel, [entry.label]),
  }),
);

const galaxies = famousGalaxySeed.map((galaxy) =>
  focusRow({
    name: galaxy.names[0]!,
    kind: 'galaxy',
    id: galaxy.id,
    ...others(galaxy.names[0]!, [galaxy.commonName, ...galaxy.names]),
  }),
);

const structures = buildStaticAnchorStructures().map((structure) => {
  const seed = structureSeed.find((row) => `${row.category}-${row.id}` === structure.id);
  return focusRow({
    name: structure.name,
    kind: structure.category,
    id: structure.id,
    ...others(structure.name, [seed?.commonName, ...(seed?.names ?? [])]),
  });
});

const exhibits = Object.values(exhibitRegistry).map(
  (exhibit): ObjectRow => ({
    name: exhibit.label,
    kind: 'exhibit',
    id: exhibit.id,
    anchor: `exhibit-${exhibit.id}`,
    link: `exhibit=${exhibit.id}`,
  }),
);

// A tour marked `dev` is not in the app's search, so it is not here.
const tours = Object.values(tourRegistry)
  .filter((tour) => tour.dev !== true)
  .map(
    (tour): ObjectRow => ({
      name: tour.label,
      kind: 'tour',
      id: tour.id,
      anchor: `tour-${tour.id}`,
      link: `tour=${tour.id}`,
    }),
  );

const sorted = (rows: ObjectRow[], kind: ObjectKind) =>
  rows.filter((row) => row.kind === kind).sort(byName);

/** Every row of the page, in the page's order. */
export const OBJECT_ROWS: readonly ObjectRow[] = [
  ...stars.filter((row) => row.kind === 'sun'),
  ...planets,
  ...moons,
  ...sorted(models, 'spacecraft'),
  ...sorted(models, 'model'),
  ...places.sort(byName),
  ...sorted(stars, 'star'),
  ...sorted(stars, 'sStar'),
  milkyWay,
  ...blackHoles,
  ...galaxies.sort(byName),
  ...sorted(structures, 'group'),
  ...sorted(structures, 'cluster'),
  ...sorted(structures, 'supercluster'),
  ...sorted(structures, 'void'),
  ...exhibits.sort(byName),
  ...tours,
];
