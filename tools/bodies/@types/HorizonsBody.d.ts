/**
 * HorizonsBody — one row of the Horizons fetch table: which target, queried against which
 * centre, over which span, at which raw step, returning position or position + velocity.
 */
export type HorizonsBody = {
  /** Scene body id, as in `ORBITAL_ELEMENTS`. */
  id: string;
  /** Horizons COMMAND target (NAIF id). */
  target: string;
  /** Horizons CENTER, e.g. '500@10' (Sun centre); also the raw sub-directory name. */
  centre: string;
  /** UT calendar dates `YYYY-MM-DD`, both endpoints fetched. */
  span: readonly [startIso: string, stopIso: string];
  /** Raw fetch step in whole minutes. */
  stepMinutes: number;
  /** VEC_TABLE '1' (position) or '2' (position + velocity). */
  vectors: 'position' | 'state';
};
