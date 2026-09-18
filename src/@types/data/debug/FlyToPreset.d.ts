/**
 * One named landmark for the Surface Tiles fly-to shortcuts.
 */

import type { SurfaceTileBodyId } from '../SurfaceTileBodyId';

export type FlyToPreset = {
  readonly label: string;
  /** Which body it is ON — not whichever the section happens to be reporting.
   *  A landmark is a place, and flying to Everest's degrees on Mars lands in
   *  Amazonis Planitia. Narrower than `BodyId` on purpose: a landmark only
   *  reads as one where tiles are baked. */
  readonly body: SurfaceTileBodyId;
  readonly lonDeg: number;
  readonly latDeg: number;
  /** Altitude to arrive at, km. Required, unlike the action's own optional
   *  field: a button that kept the current altitude would only spin the globe
   *  when pressed from far out, which is never what a landmark shortcut means. */
  readonly altKm: number;
  /** Why this one earns a button — shown as the button's tooltip. */
  readonly title: string;
};
