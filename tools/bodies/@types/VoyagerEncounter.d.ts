/**
 * VoyagerEncounter — one flyby: the craft, the UT calendar date its dense window is centred
 * on, and the Horizons body centre (NAIF id) whose closest approach is measured.
 */
export type VoyagerEncounter = {
  /** Scene body id of the craft, e.g. 'voyager1'. */
  craftId: string;
  /** Window centre, `YYYY-MM-DD` UT. */
  date: string;
  /** Flown-by body, e.g. 'Titan'; names the event label. */
  bodyName: string;
  /** Horizons COMMAND of the body centre (never the system barycentre). */
  bodyTarget: string;
};
