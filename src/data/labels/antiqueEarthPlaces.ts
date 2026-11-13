/**
 * ANTIQUE_EARTH_PLACES — the lands and seas a c.1690 Amsterdam globe names, as
 * Blaeu's 1648 world map and Visscher's globes spelled them, each anchored near
 * where the name sits on the globe. Australia is Blaeu's "Hollandia Nova" (Tasman
 * charted it in 1644; "Nova Hollandia" is the later order), and Antarctica keeps
 * the older "Terra Australis Incognita", the unseen south no Dutch globe had yet
 * dropped. Lands print before seas, so a sea crowded by a land is the one dropped.
 */

import type { AntiqueEarthPlace } from '../../@types/rendering/AntiqueEarthPlace';

export const ANTIQUE_EARTH_PLACES: readonly AntiqueEarthPlace[] = [
  { id: 'earthPlace-europa', name: 'Europa', kind: 'land', latDeg: 50, lonDeg: 18 },
  { id: 'earthPlace-asia', name: 'Asia', kind: 'land', latDeg: 50, lonDeg: 90 },
  { id: 'earthPlace-africa', name: 'Africa', kind: 'land', latDeg: 10, lonDeg: 3 },
  {
    id: 'earthPlace-americaSeptentrionalis',
    name: 'America\nSeptentrionalis',
    kind: 'land',
    latDeg: 45,
    lonDeg: -100,
  },
  {
    id: 'earthPlace-americaMeridionalis',
    name: 'America\nMeridionalis',
    kind: 'land',
    latDeg: -10,
    lonDeg: -60,
  },
  {
    id: 'earthPlace-hollandiaNova',
    name: 'Hollandia\nNova',
    kind: 'land',
    latDeg: -25,
    lonDeg: 133,
  },
  {
    id: 'earthPlace-terraAustralis',
    name: 'Terra\nAustralis\nIncognita',
    kind: 'land',
    latDeg: -80,
    lonDeg: 45,
  },
  {
    id: 'earthPlace-oceanusAtlanticus',
    name: 'Oceanus\nAtlanticus',
    kind: 'sea',
    latDeg: 30,
    lonDeg: -42,
  },
  {
    id: 'earthPlace-oceanusAethiopicus',
    name: 'Oceanus\nAethiopicus',
    kind: 'sea',
    latDeg: -22,
    lonDeg: -12,
  },
  {
    id: 'earthPlace-mareMediterraneum',
    name: 'Mare Mediterraneum',
    kind: 'sea',
    latDeg: 35,
    lonDeg: 18,
  },
  { id: 'earthPlace-marePacificum', name: 'Mare\nPacificum', kind: 'sea', latDeg: 0, lonDeg: -145 },
  {
    id: 'earthPlace-oceanusIndicus',
    name: 'Oceanus\nIndicus',
    kind: 'sea',
    latDeg: -20,
    lonDeg: 78,
  },
  { id: 'earthPlace-mareGlaciale', name: 'Mare Glaciale', kind: 'sea', latDeg: 77, lonDeg: 40 },
];
