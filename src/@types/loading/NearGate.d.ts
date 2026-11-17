/**
 * One band edge of the shown entry, measured from the band's `from`. `out`: load within
 * out[1]·lead, release beyond out[1]·release. `in`: load beyond in[0]/lead, release below
 * in[0]/release. `both`: load only inside both load limits, release past either release
 * limit. `release ≥ lead ≥ 1`, so the gap between the two is the hysteresis.
 */
export type NearGate = {
  readonly band: string;
  readonly edge: 'in' | 'out' | 'both';
  readonly lead: number;
  readonly release: number;
};
