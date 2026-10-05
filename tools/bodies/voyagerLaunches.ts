/**
 * VOYAGER_LAUNCHES — per craft, the cited launch instant (NASA, UTC) and the first minute
 * Horizons will answer for it (its error text names 13:58:36 and 15:31:44; the query takes
 * whole minutes, so the first sample sits a few seconds past that).
 */

export const VOYAGER_LAUNCHES: Readonly<
  Record<string, { launchIso: string; firstSample: string }>
> = {
  voyager1: { launchIso: '1977-09-05T12:56:00.000Z', firstSample: '1977-09-05T13:59' },
  voyager2: { launchIso: '1977-08-20T14:29:00.000Z', firstSample: '1977-08-20T15:32' },
};
