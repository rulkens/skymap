/**
 * SkyLook — how a search while standing turns the head (`skyLookFor`). Below the horizon it
 * faces where the target rises and keeps the lens; `riseAt` (sim days) is null when no rise
 * falls within `SKY_RISE_HORIZON_DAYS`, and `neverRises` says a fixed target never clears the
 * horizon from this latitude at all (D8).
 */
export type SkyLook =
  | {
      readonly kind: 'look';
      readonly azimuthRad: number;
      readonly altitudeRad: number;
      readonly fovYRad: number;
    }
  | {
      readonly kind: 'belowHorizon';
      readonly azimuthRad: number;
      readonly riseAt: number | null;
      readonly neverRises: boolean;
    };
