/**
 * Mock FocusableTarget fixtures for the design-sync InfoCard previews.
 *
 * Each fixture is a complete, realistic instance of one arm of the
 * FocusableTarget union so the InfoCard renders every dataset variant in
 * claude.ai/design without the engine or store. Values are plausible (real
 * catalog objects where possible) so the cards read as a designer would see
 * them in the running app, never `foo`/`test` placeholders.
 *
 * Body fixtures live in ./fixturesBodies.ts because they key into the real
 * generated body-facts tables.
 */

import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import type { MilkyWayInfo } from '../../src/@types/engine/MilkyWayInfo';
import type { FieldStarInfo } from '../../src/@types/engine/FieldStarInfo';
import { Source } from '../../src/data/source';

export { sun, famousStar, planet, moon } from './fixturesBodies';

// ── Galaxy catalog fixtures ─────────────────────────────────────────────────

/** Shared skeleton so each galaxy fixture only overrides what differs. */
function galaxy(over: Partial<GalaxyInfo> & Pick<GalaxyInfo, 'source' | 'sourceLabel'>): GalaxyInfo {
  const base: GalaxyInfo = {
    type: 'galaxyCatalog',
    index: 12345,
    objID: 1237668296598749280n,
    x: 42.1,
    y: -18.6,
    z: 73.4,
    ra: 187.7059,
    dec: 12.3911,
    raSexagesimal: '12h30m49.4s',
    decSexagesimal: "+12°23'28\"",
    redshift: 0.0043,
    distanceMpc: 86.2,
    hubbleVelocityKmS: 1289,
    lookbackGyr: 0.28,
    earthEra: "during Earth's Pleistocene",
    magU: 13.9,
    magG: 12.4,
    magR: 11.8,
    magI: 11.5,
    magZ: 11.3,
    bands: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
    colours: [
      { label: 'u−g', value: 1.5 },
      { label: 'g−r', value: 0.6 },
      { label: 'r−i', value: 0.3 },
    ],
    absoluteMagG: -22.3,
    galaxyType: { category: 'red', description: 'Red, quiescent galaxy' },
    iauName: 'SDSS J123049.42+122328.0',
    displayName: 'PGC 41361',
    source: Source.SDSS,
    sourceLabel: 'SDSS',
    catalogues: [
      { label: 'SDSS Explorer', href: 'https://skyserver.sdss.org/dr18/' },
      { label: 'NED', href: 'https://ned.ipac.caltech.edu/' },
    ],
    diameterKpc: 34.2,
    diameterProvenance: 'SDSS petroR50_r',
    orientation: { axisRatio: 0.62, positionAngleDeg: 47.5, provenance: 'SDSS exp+deV blend' },
    thumbnailUrl:
      'https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg?ra=187.7059&dec=12.3911&scale=0.4&width=256&height=256',
  };
  return { ...base, ...over };
}

export const sdssGalaxy: GalaxyInfo = galaxy({
  source: Source.SDSS,
  sourceLabel: 'SDSS',
  displayName: 'SDSS J083909.28+450925.5',
  iauName: 'SDSS J083909.28+450925.5',
});

export const twoMrsGalaxy: GalaxyInfo = galaxy({
  source: Source.TwoMRS,
  sourceLabel: '2MRS',
  displayName: 'PGC 2557',
  iauName: '2MASX J00424433+4116074',
  objID: 2557n,
  ra: 10.6847,
  dec: 41.2687,
  raSexagesimal: '00h42m44.3s',
  decSexagesimal: "+41°16'09\"",
  redshift: -0.001,
  distanceMpc: 0.79,
  hubbleVelocityKmS: -300,
  lookbackGyr: 0.0026,
  earthEra: 'within recorded human history',
  magU: NaN,
  magG: 4.36,
  magR: 3.7,
  magI: 3.4,
  magZ: NaN,
  bands: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  colours: [
    { label: 'J−H', value: 0.66 },
    { label: 'H−K', value: 0.3 },
  ],
  absoluteMagG: -21.5,
  galaxyType: { category: 'blue', description: 'Blue, star-forming galaxy' },
  diameterKpc: 46.0,
  diameterProvenance: '2MRS Riso',
  orientation: { axisRatio: 0.32, positionAngleDeg: 35, provenance: '2MASS XSC sup_phi' },
  catalogues: [{ label: 'NED', href: 'https://ned.ipac.caltech.edu/' }],
  thumbnailUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
});

export const gladeGalaxy: GalaxyInfo = galaxy({
  source: Source.Glade,
  sourceLabel: 'GLADE',
  displayName: 'PGC 45279',
  iauName: 'GLADE J123423.00-084802.0',
  objID: 45279n,
  redshift: 0.023,
  distanceMpc: 98.0,
  hubbleVelocityKmS: 6890,
  lookbackGyr: 1.4,
  earthEra: "during Earth's Miocene",
  bands: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
  colours: [
    { label: 'B−J', value: 2.1 },
    { label: 'J−H', value: 0.7 },
    { label: 'H−K', value: 0.3 },
  ],
  galaxyType: { category: 'green', description: 'Intermediate (green valley) galaxy' },
  diameterKpc: 28.5,
  diameterProvenance: 'GLADE Tully',
  orientation: { axisRatio: 0.78, positionAngleDeg: 112, provenance: 'HyperLEDA PGC' },
  catalogues: [{ label: 'NED', href: 'https://ned.ipac.caltech.edu/' }],
  thumbnailUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
});

export const famousGalaxy: GalaxyInfo = galaxy({
  source: Source.FamousGalaxy,
  sourceLabel: 'Famous',
  displayName: 'Andromeda Galaxy',
  iauName: '2MASX J00424433+4116074',
  objID: 224n,
  ra: 10.6847,
  dec: 41.2687,
  raSexagesimal: '00h42m44.3s',
  decSexagesimal: "+41°16'09\"",
  redshift: -0.001,
  distanceMpc: 0.78,
  hubbleVelocityKmS: -300,
  lookbackGyr: 0.0025,
  earthEra: 'within recorded human history',
  magU: NaN,
  magG: 3.44,
  magR: 3.0,
  magI: 2.7,
  magZ: NaN,
  bands: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  colours: [
    { label: 'J−H', value: 0.66 },
    { label: 'H−K', value: 0.3 },
  ],
  absoluteMagG: -21.5,
  morphology: 'Barred spiral (SA(s)b)',
  galaxyType: { category: 'blue', description: 'Blue, star-forming galaxy' },
  diameterKpc: 46.6,
  diameterProvenance: 'GLADE Tully',
  orientation: { axisRatio: 0.32, positionAngleDeg: 35, provenance: 'HyperLEDA PGC' },
  catalogues: [
    { label: 'NED', href: 'https://ned.ipac.caltech.edu/' },
    { label: 'Wikipedia', href: 'https://en.wikipedia.org/wiki/Andromeda_Galaxy' },
  ],
  thumbnailUrl: '/images/famous-thumb/m31.webp',
  thumbnailFallbackUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
  famous: {
    id: 'm31',
    commonName: 'Andromeda Galaxy',
    names: ['M31', 'NGC 224', 'Andromeda'],
    description:
      'The nearest large spiral galaxy to the Milky Way, roughly 2.5 million light-years away and on a slow collision course with our own. Home to a trillion stars, it is the most distant object visible to the unaided eye.',
    type: 'SA(s)b',
  },
});

export const milliquasAgn: GalaxyInfo = galaxy({
  source: Source.Milliquas,
  sourceLabel: 'Milliquas',
  displayName: 'SDSS J094857.32+002225.5',
  iauName: 'SDSS J094857.32+002225.5',
  objID: 0n,
  redshift: 1.82,
  distanceMpc: 4650,
  hubbleVelocityKmS: 545000,
  lookbackGyr: 10.1,
  earthEra: 'before Earth had multicellular life',
  absoluteMagG: -26.4,
  galaxyType: { category: 'blue', description: 'Active galactic nucleus' },
  agnClass: 'Quasar',
  diameterKpc: 30,
  diameterProvenance: 'fallback (30 kpc)',
  catalogues: [{ label: 'NED', href: 'https://ned.ipac.caltech.edu/' }],
  thumbnailUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
});

export const desiTracer: GalaxyInfo = galaxy({
  source: Source.DesiDeep,
  sourceLabel: 'DESI',
  displayName: 'DESI J155213.40+310418.0',
  iauName: 'DESI J155213.40+310418.0',
  objID: 0n,
  ra: 238.0558,
  dec: 31.0717,
  raSexagesimal: '15h52m13.4s',
  decSexagesimal: "+31°04'18\"",
  redshift: 0.71,
  distanceMpc: 2580,
  hubbleVelocityKmS: 213000,
  lookbackGyr: 6.4,
  earthEra: "during Earth's Jurassic",
  magU: NaN,
  magG: NaN,
  magR: NaN,
  magI: NaN,
  magZ: NaN,
  bands: { u: '—', g: '—', r: '—', i: '—', z: '—' },
  colours: [],
  absoluteMagG: NaN,
  galaxyType: { category: 'red', description: 'Luminous red galaxy' },
  agnClass: 'Luminous Red Galaxy (LRG)',
  photometryNote: 'Magnitudes are per-tracer display constants, not measured photometry.',
  diameterKpc: 30,
  diameterProvenance: 'fallback (30 kpc)',
  catalogues: [{ label: 'NED', href: 'https://ned.ipac.caltech.edu/' }],
  thumbnailUrl: 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits',
});

// ── Structure fixtures ──────────────────────────────────────────────────────

export const cluster: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-1656',
  name: 'Coma Cluster',
  worldPos: [-2.1, 68.4, 8.9],
  featured: true,
  description:
    'One of the richest nearby galaxy clusters, holding over a thousand galaxies bound in a common halo of hot X-ray gas and dark matter. Its dynamics gave Fritz Zwicky the first evidence for dark matter in 1933.',
  significance: 0.95,
  physicalRadiusMpc: 2.0,
  apparentRadiusMpc: 5.5,
  abell: 'A1656',
};

export const supercluster: StructureInfo = {
  type: 'structure',
  category: 'supercluster',
  id: 'shapley',
  name: 'Shapley Supercluster',
  worldPos: [-120, 42, -180],
  featured: true,
  description:
    'The largest concentration of galaxies in the nearby universe, a vast basin of attraction pulling the Local Group and thousands of other galaxies toward it.',
  significance: 1.0,
  physicalRadiusMpc: 65,
};

export const cosmicVoid: StructureInfo = {
  type: 'structure',
  category: 'void',
  id: 'bootes-void',
  name: 'Boötes Void',
  worldPos: [80, 210, 40],
  featured: true,
  description:
    'A nearly empty sphere of space about 330 million light-years across, one of the largest known voids. If the Milky Way were at its center, we would not have discovered other galaxies until the 1960s.',
  significance: 0.8,
  physicalRadiusMpc: 50,
};

export const group: StructureInfo = {
  type: 'structure',
  category: 'group',
  id: 'local-group',
  name: 'Local Group',
  worldPos: [0, 0, 0],
  featured: true,
  description:
    'The gravitationally bound collection of more than 80 galaxies that includes the Milky Way, Andromeda, and the Triangulum galaxy, spanning roughly 10 million light-years.',
  significance: 1.0,
  physicalRadiusMpc: 1.5,
};

// ── Milky Way singleton ─────────────────────────────────────────────────────

export const milkyWay: MilkyWayInfo = {
  type: 'milkyWay',
  displayName: 'The Milky Way',
  description:
    'Our home galaxy, a barred spiral roughly 100,000 light-years across holding some 200 billion stars. The Sun orbits about 26,000 light-years from the galactic center.',
  typeString: 'Barred spiral (SBbc)',
  distanceNote: 'We are inside it — about 8 kpc from the center.',
  x: 0,
  y: 0,
  z: 0,
};

// ── Field star (SKST survey) ────────────────────────────────────────────────

export const fieldStar: FieldStarInfo = {
  type: 'star',
  index: 84213,
  displayName: 'Field star',
  x: 0.0000042,
  y: -0.0000011,
  z: 0.0000038,
  distancePc: 41.6,
  absMag: 4.83,
  apparentMag: 8.02,
  bpRp: 0.82,
  spectralClass: 'G',
};
