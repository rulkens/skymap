/**
 * FITTED_BODIES — the `HORIZONS_BODIES` rows `buildEphemerisCorrections` fits. A planet's
 * `fitStep` keeps ≥ ~20 fit samples across the shortest period its residual carries. A moon is
 * fitted at ≈ P/8 (Iapetus every 2 days: its residual carries Titan's ~16-day pull, which a
 * P/8 grid aliases) and switches its correction off outside the span. Vesta, Ceres and Bennu
 * take a ΔM series first, like the moons: a fixed conic loses them along-track within decades.
 * Bennu fits only 2007–2054, between Earth encounters, and every 4 days: at 10 the fit stalls
 * at the 900 km stop.
 */
import type { FittedBody } from './@types/FittedBody';

export const FITTED_BODIES: readonly FittedBody[] = [
  { id: 'mercury', fitStep: 2, outside: 'hold', fitMeanAnomaly: false },
  { id: 'venus', fitStep: 4, outside: 'hold', fitMeanAnomaly: false },
  { id: 'earth', fitStep: 4, outside: 'hold', fitMeanAnomaly: false },
  { id: 'mars', fitStep: 6, outside: 'hold', fitMeanAnomaly: false },
  { id: 'jupiter', fitStep: 10, outside: 'hold', fitMeanAnomaly: false },
  { id: 'saturn', fitStep: 10, outside: 'hold', fitMeanAnomaly: false },
  { id: 'uranus', fitStep: 10, outside: 'hold', fitMeanAnomaly: false },
  { id: 'neptune', fitStep: 10, outside: 'hold', fitMeanAnomaly: false },
  { id: 'io', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'europa', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'ganymede', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'callisto', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'mimas', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'enceladus', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'tethys', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'dione', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'rhea', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'titan', fitStep: 4, outside: 'off', fitMeanAnomaly: true },
  { id: 'iapetus', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'triton', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'proteus', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'miranda', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'ariel', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'umbriel', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'titania', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'oberon', fitStep: 2, outside: 'off', fitMeanAnomaly: true },
  { id: 'vesta', fitStep: 10, outside: 'hold', fitMeanAnomaly: true },
  { id: 'ceres', fitStep: 10, outside: 'hold', fitMeanAnomaly: true },
  { id: 'bennu', fitStep: 4, outside: 'hold', fitMeanAnomaly: true },
];
