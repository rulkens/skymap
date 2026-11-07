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
    lettering: 'capitals',
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
      // The five Saturn moons known by 1684, numbered outward as Cassini did;
      // the names they carry today date from 1847.
      'sceneBody-tethys': 'Saturni Satelles I',
      'sceneBody-dione': 'Saturni Satelles II',
      'sceneBody-rhea': 'Saturni Satelles III',
      'sceneBody-titan': 'Saturni Satelles IV',
      'sceneBody-iapetus': 'Saturni Satelles V',
    },
  },
  starCatalog: {
    unlisted: 'keep',
    lettering: 'italic',
    names: {
      'sceneBody-sun': 'Sol',
      // Named after 1690: discoverers, navigators' coinages, 2016+ IAU adoptions
      // from outside the Arabic and Latin tradition. Bayer designations too: an
      // atlas of the period lettered the star, it did not write the name out.
      'sceneBody-alpha-centauri': null,
      'sceneBody-epsilon-eridani': null,
      'sceneBody-tau-ceti': null,
      'sceneBody-epsilon-centauri': null,
      'sceneBody-eta-centauri': null,
      'sceneBody-gamma-cassiopeiae': null,
      'sceneBody-delta-cephei': null,
      'sceneBody-nunki': null,
      'sceneBody-sargas': null,
      'sceneBody-ankaa': null,
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
    lettering: 'capitals',
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
  milkyWay: { unlisted: 'keep', lettering: 'capitals', names: { milkyWay: 'Via Lactea' } },
  famousGalaxy: {
    unlisted: 'hide',
    lettering: 'capitals',
    names: {
      'famous-lmc': 'Nubecula Major',
      'famous-smc': 'Nubecula Minor',
      // Simon Marius described it in 1612.
      'famous-m31': 'Nebula in Cingulo Andromedae',
    },
  },
  structure: {
    unlisted: 'hide',
    lettering: 'capitals',
    names: {
      'open-cluster-pleiades': 'Pleiades',
      'open-cluster-hyades': 'Hyades',
      'open-cluster-praesepe': 'Praesepe',
      'nebula-orion': 'Nebula in Ense Orionis',
    },
  },
  missions: { unlisted: 'hide', lettering: 'capitals', names: {} },
  blackHole: { unlisted: 'hide', lettering: 'capitals', names: {} },
  lightTime: { unlisted: 'hide', lettering: 'capitals', names: {} },
};
