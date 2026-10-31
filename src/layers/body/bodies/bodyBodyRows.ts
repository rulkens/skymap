/**
 * bodyBodyRows — the planet and moon rows, each carrying identity, orbit and rotation.
 * Orbits: JPL SSD approx_pos.html Table 1 (planets), sats/elem (moons); JPL's `L`/`ϖ` columns
 * are converted inline (`ω = ϖ − Ω`, `M = L − ϖ`, likewise the rates) so every transcription
 * stays checkable against the source. Rotation (Archinal et al. 2018): Ẇ is live everywhere;
 * pole rates α̇/δ̇ only for Earth, nutation/libration nowhere (under 1′ over 250 years).
 * Albedos are plausible flat linear-RGB colours, inline because each is read once per body.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { EARTH } from './earth';
import { MERCURY } from './mercury';
import { VENUS } from './venus';
import { MARS } from './mars';
import { JUPITER } from './jupiter';
import { SATURN } from './saturn';
import { URANUS } from './uranus';
import { NEPTUNE } from './neptune';
import { MOON } from './moon';
import { PHOBOS } from './phobos';
import { DEIMOS } from './deimos';
import { IO } from './io';
import { EUROPA } from './europa';
import { GANYMEDE } from './ganymede';
import { CALLISTO } from './callisto';
import { MIMAS } from './mimas';
import { ENCELADUS } from './enceladus';
import { TETHYS } from './tethys';
import { DIONE } from './dione';
import { RHEA } from './rhea';
import { TITAN } from './titan';
import { IAPETUS } from './iapetus';
import { PLUTO } from './pluto';
import { CHARON } from './charon';
import { MIRANDA } from './miranda';
import { ARIEL } from './ariel';
import { UMBRIEL } from './umbriel';
import { TITANIA } from './titania';
import { OBERON } from './oberon';
import { PUCK } from './puck';
import { TRITON } from './triton';
import { PROTEUS } from './proteus';
import { NEREID } from './nereid';
import { EXOPLANET_PLANETS } from './exoplanetPlanets';

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
  // Planets of other stars: appended last, so every solar body keeps its pick index.
  ...EXOPLANET_PLANETS,
];
