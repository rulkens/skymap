/**
 * REFERENCE_GALAXIES — verbatim port of the spike's `REFS` gallery
 * (`Galaxy Renderer.dc.html`): eight real named galaxies with a
 * param preset, a camera pose, and prose, used to seed the generator toward
 * something recognisable and to eyeball how close the model gets.
 *
 * Images are the curated famous-galaxy starless renders already published
 * under `public/images/famous-curated/<id>/starless.webp`. The id used for
 * the image path isn't always the REFS entry's own id — `ngc6946` ships
 * under its Caldwell catalog number (`c12`), and the generic `ell` entry
 * uses M49 as its illustrative giant elliptical. The Milky Way has no
 * external photograph (we live inside it), so its `img` is `null`.
 */

import type { ReferenceGalaxy } from '../../@types/data/ReferenceGalaxy';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../src/data/milkyWay/milkyWayGalaxyParams';

export const REFERENCE_GALAXIES: readonly ReferenceGalaxy[] = [
  {
    id: 'm100',
    short: 'M100',
    name: 'M100 · grand-design spiral',
    hubbleType: 'SAB(s)bc — spiral',
    dist: '55 Mly',
    diam: '~107,000 ly',
    arms: '2 main',
    viewLabel: 'Face-on',
    notable:
      'A grand-design spiral in the Virgo Cluster: two dominant arms wind out of a bright core, threaded with dust and blue star-forming regions.',
    credit: 'ESA/Hubble · starless',
    img: '/images/famous-curated/m100/starless.webp',
    params: {
      type: 'Sb',
      shared: {
        armCount: 2,
        armWinding: 0.52,
        bulgeSize: 0.6,
        youngStars: 0.62,
        diskThickness: 0.9,
        radius: 1.0,
      },
      legacy: {
        armWidth: 1.0,
        armStrength: 1.1,
        spriteDust: 1.0,
        dustRing: 0.7,
        hii: 1.1,
        globularCount: 30,
        starCount: 600000,
      },
    },
    view: { az: 0.5, el: 1.25, dist: 32 },
  },
  {
    id: 'ngc6946',
    short: 'NGC 6946',
    name: 'NGC 6946 · Fireworks (C12)',
    hubbleType: 'SAB(rs)cd — spiral',
    dist: '25 Mly',
    diam: '~40,000 ly',
    arms: 'multiple',
    viewLabel: 'Face-on',
    notable:
      'The "Fireworks Galaxy" — a face-on, many-armed spiral with prolific star formation and abundant pink HII knots strung along fragmented arms.',
    credit: 'starless',
    img: '/images/famous-curated/c12/starless.webp',
    params: {
      type: 'Sc',
      shared: {
        armCount: 5,
        armWinding: 0.72,
        bulgeSize: 0.4,
        youngStars: 0.76,
        diskThickness: 1.0,
        radius: 1.1,
      },
      legacy: {
        armWidth: 1.3,
        armStrength: 1.05,
        spriteDust: 0.95,
        dustRing: 0.72,
        hii: 1.5,
        globularCount: 18,
        starCount: 600000,
      },
    },
    view: { az: 0.6, el: 1.28, dist: 33 },
  },
  {
    id: 'm58',
    short: 'M58',
    name: 'M58 · barred spiral',
    hubbleType: 'SAB(rs)b — barred spiral',
    dist: '68 Mly',
    diam: '~120,000 ly',
    arms: '2 (from bar)',
    viewLabel: 'Face-on',
    notable:
      'A bright barred spiral in Virgo. A stubby central bar feeds tightly wound arms around a warm, old, dominant bulge.',
    credit: 'ESA/Hubble · starless',
    img: '/images/famous-curated/m58/starless.webp',
    params: {
      type: 'SBb',
      shared: {
        armCount: 2,
        armWinding: 0.42,
        barStrength: 0.95,
        bulgeSize: 0.7,
        youngStars: 0.55,
        diskThickness: 0.9,
        radius: 1.0,
      },
      legacy: {
        armWidth: 0.9,
        armStrength: 1.0,
        spriteDust: 0.9,
        dustRing: 0.7,
        hii: 0.9,
        globularCount: 25,
        starCount: 600000,
      },
    },
    view: { az: 0.5, el: 1.25, dist: 31 },
  },
  {
    id: 'm104',
    short: 'M104',
    name: 'M104 · Sombrero',
    hubbleType: 'Sa / S0 — edge-on',
    dist: '31 Mly',
    diam: '~95,000 ly',
    arms: '—',
    viewLabel: 'Edge-on (6°)',
    notable:
      'An unusually large, bright bulge encircled by a sharp edge-on dust ring — the "hat brim". Hosts ~2,000 globular clusters.',
    credit: 'NASA/ESA Hubble · starless',
    img: '/images/famous-curated/m104/starless.webp',
    params: {
      type: 'S0',
      shared: {
        bulgeSize: 1.8,
        bulgeFalloff: 0.6,
        diskThickness: 0.4,
        youngStars: 0.25,
        radius: 1.0,
      },
      legacy: {
        spriteDust: 0.25,
        dustNoise: 0.7,
        dustNoiseScale: 1.2,
        dustRing: 0.85,
        dustRingWidth: 0.07,
        dustRingStrength: 1.3,
        globularCount: 90,
        starCount: 600000,
      },
    },
    view: { az: 0.2, el: 0.06, dist: 31 },
  },
  {
    id: 'm31',
    short: 'M31',
    name: 'M31 · Andromeda',
    hubbleType: 'SA(s)b — spiral',
    dist: '2.5 Mly',
    diam: '~152,000 ly',
    arms: 'multiple, tight',
    viewLabel: '~77° inclined',
    notable:
      'The nearest major galaxy. A large bulge and tightly wound, ring-like arms with dark dust lanes, seen at a steep inclination.',
    credit: 'starless',
    img: '/images/famous-curated/m31/starless.webp',
    params: {
      type: 'Sb',
      shared: {
        armCount: 3,
        armWinding: 0.3,
        bulgeSize: 1.0,
        youngStars: 0.42,
        diskThickness: 0.9,
        radius: 1.15,
      },
      legacy: {
        armWidth: 1.1,
        armStrength: 0.9,
        spriteDust: 1.2,
        dustRing: 0.72,
        hii: 0.6,
        globularCount: 60,
        starCount: 600000,
      },
    },
    view: { az: 0.5, el: 0.32, dist: 30 },
  },
  {
    id: 'ell',
    short: 'Elliptical',
    name: 'Giant elliptical',
    hubbleType: 'E1 — elliptical',
    dist: '—',
    diam: '~120,000 ly',
    arms: '—',
    viewLabel: 'Any',
    notable:
      'A giant elliptical: a smooth, featureless spheroid of old, warm stars with no disk, arms, or dust — surrounded by a rich halo of globular clusters.',
    credit: 'starless',
    img: '/images/famous-curated/m49/starless.webp',
    params: {
      type: 'E1',
      shared: { bulgeSize: 1.0, youngStars: 0.15, radius: 1.1 },
      legacy: { spriteDust: 0, hii: 0, globularCount: 200, starCount: 500000 },
    },
    view: { az: 0.6, el: 0.6, dist: 31 },
  },
  {
    id: 'lmc',
    short: 'LMC',
    name: 'Large Magellanic Cloud',
    hubbleType: 'SB(s)m — irregular',
    dist: '163,000 ly',
    diam: '~32,000 ly',
    arms: 'chaotic / 1',
    viewLabel: '3/4',
    notable:
      'A satellite of the Milky Way with an off-center bar and one ragged arm, ablaze with star formation (including the Tarantula Nebula).',
    credit: 'starless',
    img: '/images/famous-curated/lmc/starless.webp',
    params: {
      type: 'Irr',
      shared: { youngStars: 0.8, barStrength: 0.6, diskThickness: 1.4, radius: 0.62 },
      legacy: { hii: 1.4, spriteDust: 0.9, globularCount: 15, starCount: 450000 },
    },
    view: { az: 0.8, el: 0.85, dist: 24 },
  },
  {
    id: 'mw',
    short: 'Milky Way',
    name: 'Milky Way (model)',
    hubbleType: 'SBbc — barred spiral',
    dist: '— (we live inside it)',
    diam: '~100,000 ly',
    arms: '~4 (Norma, Scutum–Centaurus, Sagittarius, Perseus)',
    viewLabel: 'no external photo exists',
    notable:
      'Our own galaxy: a barred spiral with a central bar (~27° to the Sun line), four main arm segments, and a WARPED, twisted outer disk — the twist mapped directly by Cepheids (Chen et al. 2019).',
    credit: 'model — no face-on photograph of the Milky Way is possible',
    img: null,
    // Single source of truth: src/data/milkyWay/milkyWayGalaxyParams.ts. The
    // main-app renderer imports the same constant, so the tool and the app
    // can never quietly render two different "Milky Way"s.
    params: MILKY_WAY_GALAXY_PARAMS,
    view: { az: 0.5, el: 0.5, dist: 30 },
  },
];
