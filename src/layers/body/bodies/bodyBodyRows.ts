/**
 * bodyBodyRows — the planet, moon and small-body rows, each carrying identity, orbit and rotation.
 * Orbits: JPL SSD approx_pos.html Table 1 (planets), sats/elem (moons); JPL's `L`/`ϖ` columns
 * are converted inline (`ω = ϖ − Ω`, `M = L − ϖ`, likewise the rates) so every transcription
 * stays checkable against the source. Rotation (Archinal et al. 2018): Ẇ is live everywhere;
 * pole rates α̇/δ̇ only for Earth, nutation/libration nowhere (under 1′ over 250 years).
 * Albedos are plausible flat linear-RGB colours, inline because each is read once per body.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { EARTH } from './planets/earth';
import { MERCURY } from './planets/mercury';
import { VENUS } from './planets/venus';
import { MARS } from './planets/mars';
import { JUPITER } from './planets/jupiter';
import { SATURN } from './planets/saturn';
import { URANUS } from './planets/uranus';
import { NEPTUNE } from './planets/neptune';
import { MOON } from './moons/earthMars/moon';
import { PHOBOS } from './moons/earthMars/phobos';
import { DEIMOS } from './moons/earthMars/deimos';
import { IO } from './moons/jupiter/io';
import { EUROPA } from './moons/jupiter/europa';
import { GANYMEDE } from './moons/jupiter/ganymede';
import { CALLISTO } from './moons/jupiter/callisto';
import { MIMAS } from './moons/saturn/mimas';
import { ENCELADUS } from './moons/saturn/enceladus';
import { TETHYS } from './moons/saturn/tethys';
import { DIONE } from './moons/saturn/dione';
import { RHEA } from './moons/saturn/rhea';
import { TITAN } from './moons/saturn/titan';
import { IAPETUS } from './moons/saturn/iapetus';
import { PLUTO } from './planets/pluto';
import { CHARON } from './moons/neptunePluto/charon';
import { MIRANDA } from './moons/uranus/miranda';
import { ARIEL } from './moons/uranus/ariel';
import { UMBRIEL } from './moons/uranus/umbriel';
import { TITANIA } from './moons/uranus/titania';
import { OBERON } from './moons/uranus/oberon';
import { PUCK } from './moons/uranus/puck';
import { TRITON } from './moons/neptunePluto/triton';
import { PROTEUS } from './moons/neptunePluto/proteus';
import { NEREID } from './moons/neptunePluto/nereid';
import { VESTA } from './smallBodies/vesta';
import { CERES } from './smallBodies/ceres';
import { BENNU } from './smallBodies/bennu';

export const BODY_BODY_ROWS: readonly LayerBody[] = [
  EARTH,
  MERCURY,
  VENUS,
  MARS,
  JUPITER,
  SATURN,
  URANUS,
  NEPTUNE,
  MOON,
  PHOBOS,
  DEIMOS,
  IO,
  EUROPA,
  GANYMEDE,
  CALLISTO,
  MIMAS,
  ENCELADUS,
  TETHYS,
  DIONE,
  RHEA,
  TITAN,
  IAPETUS,
  PLUTO,
  CHARON,
  MIRANDA,
  ARIEL,
  UMBRIEL,
  TITANIA,
  OBERON,
  PUCK,
  TRITON,
  PROTEUS,
  NEREID,
  VESTA,
  CERES,
  BENNU,
];
