/**
 * FamousStarRow — the decoded, ready-to-consume projection of one famous star,
 * as it leaves the generated `famousStars.generated.ts` table and enters the
 * runtime.
 *
 * A famous star is authored once in the seed JSON and baked into a generated
 * TS table (never hand-edited — see the GENERATED banner on that file). This
 * row is the shape the runtime reads: exactly the fields the star maker needs
 * to turn an authored record into a drawn `StarBody`, plus the identity/name
 * fields the command palette and search index key on. Nothing here is derived —
 * every derived quantity (world-space `positionMpc`, linear-RGB `color`,
 * `radiusM`) is a pure function of these primitives, computed by the maker so
 * the authored data stays close to its catalogue units.
 *
 * The units are the units the catalogues publish, kept verbatim so a curator
 * reading the seed sees the same numbers as the source: sky angles in degrees,
 * distance in parsecs, temperature in kelvin, radius in solar radii. The maker
 * converts (RA/Dec/distance → `positionMpc`, `temperatureK` → linear RGB via
 * `temperatureToLinearRgb`, `radiusSolar` → `radiusM`) at the boundary rather
 * than baking pre-converted values, so the row remains legible against its
 * source and a unit change is one function, not a re-bake of the whole table.
 */

export type FamousStarRow = {
  readonly id: string;
  readonly commonName: string; // → StarBody.label
  readonly names: readonly string[]; // palette aliases (Bayer, catalogue names)
  readonly constellation: string; // palette secondary chip
  readonly raDeg: number; // → positionMpc via the star maker
  readonly decDeg: number;
  readonly distancePc: number;
  readonly absMag: number;
  readonly temperatureK: number; // → color via temperatureToLinearRgb
  readonly radiusSolar: number; // → radiusM
  readonly oblateness?: number; // → StarBody.oblateness (per-axis MVP scale)
};
