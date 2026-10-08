/**
 * FittedBody — how `buildEphemerisCorrections` fits one fetched row: every `fitStep`-th raw row
 * goes on the fit grid, with the given out-of-span policy.
 */
export type FittedBody = {
  /** `HorizonsBody.id` of the fetch row whose CSV is fitted. */
  id: string;
  fitStep: number;
  outside: 'hold' | 'off';
};
