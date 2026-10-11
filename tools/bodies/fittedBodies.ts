/**
 * FITTED_BODIES — the `HORIZONS_BODIES` rows `buildEphemerisCorrections` fits. A planet's
 * `fitStep` keeps ≥ ~20 fit samples across the shortest period its residual carries. A moon is
 * fitted at ≈ P/8 (Iapetus every 2 days: its residual carries Titan's ~16-day pull, which a
 * P/8 grid aliases) and switches its correction off outside the span.
 */
import type { FittedBody } from './@types/FittedBody';

export const FITTED_BODIES: readonly FittedBody[] = [
  { id: 'mercury', fitStep: 2, outside: 'hold' },
  { id: 'venus', fitStep: 4, outside: 'hold' },
  { id: 'earth', fitStep: 4, outside: 'hold' },
  { id: 'mars', fitStep: 6, outside: 'hold' },
  { id: 'jupiter', fitStep: 10, outside: 'hold' },
  { id: 'saturn', fitStep: 10, outside: 'hold' },
  { id: 'uranus', fitStep: 10, outside: 'hold' },
  { id: 'neptune', fitStep: 10, outside: 'hold' },
  { id: 'io', fitStep: 2, outside: 'off' },
  { id: 'europa', fitStep: 2, outside: 'off' },
  { id: 'ganymede', fitStep: 2, outside: 'off' },
  { id: 'callisto', fitStep: 2, outside: 'off' },
  { id: 'mimas', fitStep: 2, outside: 'off' },
  { id: 'enceladus', fitStep: 2, outside: 'off' },
  { id: 'tethys', fitStep: 2, outside: 'off' },
  { id: 'dione', fitStep: 2, outside: 'off' },
  { id: 'rhea', fitStep: 2, outside: 'off' },
  { id: 'titan', fitStep: 4, outside: 'off' },
  { id: 'iapetus', fitStep: 2, outside: 'off' },
  { id: 'triton', fitStep: 2, outside: 'off' },
  { id: 'proteus', fitStep: 2, outside: 'off' },
  { id: 'miranda', fitStep: 2, outside: 'off' },
  { id: 'ariel', fitStep: 2, outside: 'off' },
  { id: 'umbriel', fitStep: 2, outside: 'off' },
  { id: 'titania', fitStep: 2, outside: 'off' },
  { id: 'oberon', fitStep: 2, outside: 'off' },
];
