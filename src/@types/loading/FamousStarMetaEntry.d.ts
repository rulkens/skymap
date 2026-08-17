/**
 * FamousStarMetaEntry — one record in the `famous_stars_meta.json` sidecar: the
 * curated physical properties of a famous star that the InfoCard shows but the
 * renderer never needs.
 *
 * This mirrors `FamousGalaxyMetaEntry` for galaxies. The split is deliberate: the
 * render-critical primitives (position, temperature, radius) travel with the
 * generated `FamousStarRow` so a star is drawable and selectable the instant
 * the table loads, while these narrative/physical fields — spectral type, mass,
 * luminosity, age, variability, the prose description — arrive asynchronously in
 * the gitignored sidecar (a build artefact) and are folded into the card when
 * ready. Keeping them off the hot path means the sidecar can grow richer over
 * time without bloating the runtime table.
 *
 * Fields are mutable and non-`readonly` because this is the decoded JSON shape
 * (parsed once, not a domain value carried through the store), matching the
 * `FamousGalaxyMetaEntry` convention. `radiusSolar`/`temperatureK` are required — they
 * duplicate the row's render values so the card can present them without a
 * cross-lookup — while `massSolar`/`luminositySolar`/`ageGyr`/`oblateness` and
 * `variable` are optional: the card omits the corresponding line when a value is
 * absent rather than showing a placeholder, the same absent-row pattern the
 * galaxy card uses.
 */

export type FamousStarMetaEntry = {
  id: string;
  names: string[];
  constellation: string;
  spectralType: string;
  distancePc: number;
  magV: number;
  absMag: number;
  radiusSolar: number; // required
  temperatureK: number; // required
  massSolar?: number; // optional — card omits the line when absent
  luminositySolar?: number; // optional
  ageGyr?: number; // optional
  oblateness?: number;
  variable?: { type: string; magRange: [number, number] };
  description: string;
};
