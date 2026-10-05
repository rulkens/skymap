/**
 * HorizonsBody — one row of the Horizons fetch/fit table: which body, queried against which
 * centre, at which raw step, fitted on every `fitStep`-th row, with which out-of-span policy.
 */
export type HorizonsBody = {
  /** Scene body id, as in `ORBITAL_ELEMENTS`. */
  id: string;
  /** Horizons COMMAND target (NAIF id). */
  target: string;
  /** Horizons CENTER, e.g. '500@10' (Sun centre); also the raw sub-directory name. */
  centre: string;
  /** Raw fetch step, in days. */
  stepDays: number;
  /** Every n-th raw row goes on the fit grid. */
  fitStep: number;
  outside: 'hold' | 'off';
};
