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
    lettering: 'roman',
    // The planets take the title capitals, Cassini's numbered moons the italic.
    letteringOf: {
      'sceneBody-earth': 'capitals',
      'sceneBody-moon': 'capitals',
      'sceneBody-mercury': 'capitals',
      'sceneBody-venus': 'capitals',
      'sceneBody-mars': 'capitals',
      'sceneBody-jupiter': 'capitals',
      'sceneBody-saturn': 'capitals',
      'sceneBody-tethys': 'italic',
      'sceneBody-dione': 'italic',
      'sceneBody-rhea': 'italic',
      'sceneBody-titan': 'italic',
      'sceneBody-iapetus': 'italic',
    },
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
      'sceneBody-tethys': 'Saturni satelles I',
      'sceneBody-dione': 'Saturni satelles II',
      'sceneBody-rhea': 'Saturni satelles III',
      'sceneBody-titan': 'Saturni satelles IV',
      'sceneBody-iapetus': 'Saturni satelles V',
    },
  },
  // A star with no period name keeps its modern one (owner ruling, 2026-11-07).
  starCatalog: {
    unlisted: 'keep',
    lettering: 'italic',
    names: {
      'sceneBody-sun': 'Sol',
      // As Bayer and the Amsterdam globe makers spelled them.
      'sceneBody-polaris': 'Stella Polaris',
      'sceneBody-alkaid': 'Benetnasch',
      'sceneBody-schedar': 'Schedir',
      'sceneBody-fomalhaut': 'Fomahant',
      // Names coined after the plate (1930s almanac, IAU 2016-18) yield to Bayer's
      // letter, spelled out until the italic carries Greek; the modern name glosses it.
      'sceneBody-avior': 'Epsilon Argus\n(Avior)',
      'sceneBody-peacock': 'Alpha Pavonis\n(Peacock)',
      'sceneBody-tiaki': 'Beta Gruis\n(Tiaki)',
      'sceneBody-larawag': 'Epsilon Scorpii\n(Larawag)',
    },
  },
  constellations: {
    unlisted: 'keep',
    lettering: 'capitals',
    // A figure's name is the plate's frame: over its stars' names (10), under the planets'.
    priority: 12,
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
    lettering: 'roman',
    names: {
      'famous-lmc': 'Nubecula Major',
      'famous-smc': 'Nubecula Minor',
      // Simon Marius described it in 1612.
      'famous-m31': 'Nebula in Cingulo Andromedae',
    },
  },
  structure: {
    unlisted: 'hide',
    lettering: 'roman',
    names: {
      'open-cluster-pleiades': 'Pleiades',
      'open-cluster-hyades': 'Hyades',
      'open-cluster-praesepe': 'Praesepe',
      'nebula-orion': 'Nebula in Ense Orionis',
      // The cosmic web, Latinised as the plate would have charted it.
      'supercluster-laniakea-sc': 'Laniakea',
      'supercluster-perseus-pisces-sc': 'Perseus-Pisces',
      'galaxy-cluster-virgo-m87': 'Virgo',
      'galaxy-cluster-coma-a1656': 'Coma Berenices',
      'galaxy-cluster-norma-great-attractor': 'Attractor Magnus',
      'supercluster-hydra-wall': 'Murus Hydrae',
      'void-local-void': 'Vacuum Locale',
      'void-sculptor-void': 'Vacuum Sculptoris',
    },
    letteringOf: { 'void-local-void': 'spacedItalic', 'void-sculptor-void': 'spacedItalic' },
    // A void is named only where the web is charted (owner ruling, 2026-11-07).
    cosmosOnly: ['void-local-void', 'void-sculptor-void'],
  },
  missions: { unlisted: 'hide', lettering: 'capitals', names: {} },
  blackHole: { unlisted: 'hide', lettering: 'capitals', names: {} },
  lightTime: { unlisted: 'hide', lettering: 'capitals', names: {} },
};
