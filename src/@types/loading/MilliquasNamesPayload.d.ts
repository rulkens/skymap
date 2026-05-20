/**
 * MilliquasNamesPayload — the in-memory shape of `milliquas-<tier>_names.json`.
 *
 * The Milliquas v8 catalogue (Flesch 2023) ships through the same per-tier
 * `.bin` pipeline as SDSS / GLADE, but the human-readable AGN names
 * (e.g. `"3C 273"`, `"PKS 0405-12"`) live alongside in a parallel JSON
 * sidecar rather than inside the binary.  Embedding them in the .bin would
 * inflate the per-row byte stride (variable-length strings break the
 * fixed-stride layout `pointRenderer.ts` depends on), and the names are only
 * consulted on hover/click — so paying the JSON parse cost once per page
 * load is fine.
 *
 * ### Why per-tier (unlike the famous sidecar's tier-agnostic single JSON)
 *
 * Each tier subsamples the brightest N quasars (200k for medium, all 943k
 * for large).  The kept indices differ between tiers, so the `names` array
 * has to line up with whichever tier's bin is currently loaded — index 0
 * in `milliquas-medium.bin` is NOT the same row as index 0 in
 * `milliquas-large.bin`.  A per-tier sidecar keeps the contract simple
 * (`names[localIdx]` always matches `bin[localIdx]`).
 *
 * `classes` is the per-row classification letter (`Q` quasar, `A` BL Lac,
 * `B` candidate, `K` type-II AGN, `N` Seyfert-1, `S` Seyfert-1 core); v1
 * doesn't surface class-specific behaviour but the data is plumbed in
 * lockstep with names so v2 (class-aware InfoCard sentence) doesn't need
 * another sidecar revision.
 */
export type MilliquasNamesPayload = {
  /** Display names parallel to the per-tier bin's records by localIdx. */
  readonly names: readonly string[];
  /** Classification letters (Q/A/B/K/N/S) parallel to names. */
  readonly classes: readonly string[];
};
