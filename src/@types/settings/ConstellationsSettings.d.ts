/**
 * ConstellationsSettings — constellation stick-figure overlay controls. A
 * singleton overlay like `filaments` / `milkyWay` / `flow`: master toggle +
 * intensity scale, seeded from the `SOURCE_REGISTRY` constellations row. The
 * one `enabled` toggle governs BOTH the stick figures and their name
 * captions — no separate names gate. `intensity` has no panel control; a
 * store-only dial the line-brightness math reads.
 */

export type ConstellationsSettings = {
  enabled: boolean;
  intensity: number;
};
