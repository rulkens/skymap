/**
 * ShipState — a 1 g flip-and-burn ship at one Earth-frame instant of its trip, in years and
 * light-years with c = 1. A pure function of (trip length, Earth time since launch): see
 * `shipStateAt`.
 */

export type ShipState = {
  /** Proper (ship) time since launch. */
  readonly tauYr: number;
  /** Earth-frame distance along the line of flight from the launch point. */
  readonly xLy: number;
  readonly beta: number;
  readonly gamma: number;
  readonly phase: 'accelerating' | 'decelerating' | 'arrived';
};
