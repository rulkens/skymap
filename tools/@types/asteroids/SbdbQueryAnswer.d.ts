/**
 * SbdbQueryAnswer — the JPL SBDB Query API's JSON answer (data/raw/sbdb/README.md): `data` rows hold the
 * requested `fields` in order, each value a string or null.
 */
export type SbdbQueryAnswer = {
  readonly signature: { readonly version: string; readonly source: string };
  readonly fields: readonly string[];
  readonly count: number;
  readonly data: readonly (readonly (string | null)[])[];
};
