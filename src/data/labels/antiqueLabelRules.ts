/**
 * ANTIQUE_LABEL_RULES — what a c.1690 Amsterdam plate calls each label, per
 * producer `label` entry (`antiqueLabel` applies it; a name with a digit is a
 * catalog number and hides on top of this). Keys are label ids: `sceneBody-<body
 * id>`, `famous-<famous id>`, `<category>-<seed id>` for structures, the IAU name
 * for constellations. A producer absent here keeps its labels. Constellations
 * Lacaille drew in the 1750s hide; Argo Navis was still one ship.
 */

import type { AntiqueLabelRule } from '../../@types/rendering/AntiqueLabelRule';
import type { LabelName } from '../../@types/animation/LabelName';

export const ANTIQUE_LABEL_RULES: Readonly<Partial<Record<LabelName, AntiqueLabelRule>>> = {
  body: {
    unlisted: 'hide',
    names: {
      'sceneBody-earth': 'Terra',
      'sceneBody-moon': 'Luna',
      'sceneBody-mercury': 'Mercurius',
      'sceneBody-venus': 'Venus',
      'sceneBody-mars': 'Mars',
      'sceneBody-jupiter': 'Iupiter',
      'sceneBody-saturn': 'Saturnus',
      'sceneBody-io': 'Io',
      'sceneBody-europa': 'Europa',
      'sceneBody-ganymede': 'Ganymedes',
      'sceneBody-callisto': 'Callisto',
      // Saturn's moons found by 1684: Titan (1655), Iapetus, Rhea, Tethys, Dione.
      'sceneBody-titan': 'Titan',
      'sceneBody-iapetus': 'Iapetus',
      'sceneBody-rhea': 'Rhea',
      'sceneBody-tethys': 'Tethys',
      'sceneBody-dione': 'Dione',
    },
  },
  starCatalog: {
    unlisted: 'keep',
    names: {
      'sceneBody-sun': 'Sol',
      // Named after 1690: discoverers, navigators' coinages, 2016+ IAU adoptions
      // from outside the Arabic and Latin tradition, and Bayer letters in
      // constellations drawn later.
      'sceneBody-proxima-centauri': null,
      'sceneBody-barnards-star': null,
      'sceneBody-kapteyns-star': null,
      'sceneBody-ez-aquarii': null,
      'sceneBody-epsilon-indi': null,
      'sceneBody-acrux': null,
      'sceneBody-gacrux': null,
      'sceneBody-avior': null,
      'sceneBody-atria': null,
      'sceneBody-peacock': null,
      'sceneBody-tiaki': null,
      'sceneBody-larawag': null,
      'sceneBody-alpha-lupi': null,
      'sceneBody-girtab': null,
      'sceneBody-gamma-velorum': null,
      'sceneBody-eta-carinae': null,
      'sceneBody-vy-canis-majoris': null,
      'sceneBody-uy-scuti': null,
      'sceneBody-t-coronae-borealis': null,
    },
  },
  constellations: {
    unlisted: 'keep',
    names: {
      Carina: 'Argo Navis',
      Puppis: null,
      Vela: null,
      Scutum: 'Scutum Sobiescianum',
      Vulpecula: 'Vulpecula cum Ansere',
      Antlia: null,
      Caelum: null,
      Circinus: null,
      Fornax: null,
      Horologium: null,
      Mensa: null,
      Microscopium: null,
      Norma: null,
      Octans: null,
      Pictor: null,
      Pyxis: null,
      Reticulum: null,
      Sculptor: null,
      Telescopium: null,
    },
  },
  milkyWay: { unlisted: 'keep', names: { milkyWay: 'Via Lactea' } },
  famousGalaxy: {
    unlisted: 'hide',
    names: {
      'famous-lmc': 'Nubecula Major',
      'famous-smc': 'Nubecula Minor',
      // Simon Marius described it in 1612.
      'famous-m31': 'Nebula in Cingulo Andromedae',
    },
  },
  structure: {
    unlisted: 'hide',
    names: {
      'open-cluster-pleiades': 'Pleiades',
      'open-cluster-hyades': 'Hyades',
      'open-cluster-praesepe': 'Praesepe',
      'open-cluster-h-persei': 'h Persei',
      'open-cluster-chi-persei': 'Chi Persei',
      'globular-cluster-omega-centauri': 'Omega Centauri',
      'nebula-orion': 'Nebula in Ense Orionis',
    },
  },
  missions: { unlisted: 'hide', names: {} },
  blackHole: { unlisted: 'hide', names: {} },
  lightTime: { unlisted: 'hide', names: {} },
};
