/**
 * ExhibitId — the ids `APP_EXHIBITS` carries and `openExhibit` resolves. A Layer's exhibit is
 * listed here by hand (the `FadeId` / `DriverId` precedent), so a row with an unlisted id fails to
 * compile; a listed id with no row fails `appExhibits.test.ts`.
 */

export type ExhibitId =
  | 'solarSystem'
  | 'zoneOfAvoidance'
  | 'cosmicFlows'
  | 'cosmicWeb'
  | 'observableUniverse'
  | 'voyager-missions';
