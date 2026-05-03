/**
 * Map a lookback time in gigayears to a human-readable Earth-history anchor.
 *
 * The motivation: "1.3 Gyr ago" is hard to fathom; "during Earth's
 * Mesoproterozoic" gives the reader a concrete reference point. This function
 * is the bridge between the cosmological lookbackTimeGyr() value and the
 * plain-language string shown in the info card.
 *
 * The mapping is approximate and educational, not authoritative — the goal is
 * to make cosmic distances feel relatable to a non-technical viewer.
 */

/**
 * Map a lookback time (in Gyr) to a human-readable Earth-history anchor.
 *
 * The motivation: "1.3 Gyr ago" is hard to fathom; "during Earth's
 * Mesoproterozoic" gives the reader a concrete reference point.
 *
 * The mapping is approximate and educational, not authoritative — the goal is
 * to make cosmic distances feel relatable to a non-technical viewer.
 *
 * Boundary semantics: each band is half-open [lower, upper). A value at
 * exactly a boundary belongs to the *upper* band (the one with the higher
 * lower bound). For example, 0.066 Gyr belongs to "before the dinosaurs
 * went extinct", not "before the first humans".
 *
 * Era boundaries and their approximate sources:
 *   0.001 Gyr = 1 Ma  — earliest writing / agriculture (c. 10,000 BCE)
 *   0.0026 Gyr = 2.6 Ma — earliest Homo habilis fossils
 *   0.066 Gyr = 66 Ma  — Cretaceous–Palaeogene extinction event
 *   0.25  Gyr = 250 Ma — Triassic–Jurassic boundary (first dinosaurs)
 *   0.54  Gyr = 540 Ma — Cambrian explosion onset
 *   1.0   Gyr = 1000 Ma — Mesoproterozoic begins
 *   1.6   Gyr = 1600 Ma — Mesoproterozoic ends / Neoproterozoic begins
 *   2.4   Gyr = 2400 Ma — Great Oxidation Event onset
 *   3.5   Gyr = 3500 Ma — earliest credible microfossils (stromatolites)
 *   4.5   Gyr = 4500 Ma — Earth's approximate formation age
 *   13.7  Gyr — approximate age of the observable universe
 *
 * @param gyrAgo  Lookback time in gigayears. Use `lookbackTimeGyr(z)` to
 *                obtain this from a redshift.
 */
export function earthEraForLookback(gyrAgo: number): string {
  if (gyrAgo < 0.001) return 'essentially now (modern era)';
  if (gyrAgo < 0.0026) return 'during the rise of human civilisation';
  if (gyrAgo < 0.066) return 'before the first humans';
  if (gyrAgo < 0.25) return 'before the dinosaurs went extinct';
  if (gyrAgo < 0.54) return 'before the dinosaurs evolved';
  if (gyrAgo < 1.0) return 'before the Cambrian explosion';
  if (gyrAgo < 1.6) return "during Earth's Mesoproterozoic";
  if (gyrAgo < 2.4) return 'before complex life appeared on Earth';
  if (gyrAgo < 3.5) return "before Earth's atmosphere had oxygen";
  if (gyrAgo < 4.5) return 'near the time the first life emerged on Earth';
  if (gyrAgo < 13.7) return 'before Earth even existed';
  return 'near the dawn of the universe';
}
