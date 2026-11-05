/**
 * famousStarsIndex — the single derivation of the famous stars' search identity,
 * projected off the generated seed table once: `FAMOUS_STAR_SEARCH` (read by
 * `constellationOfBody`) for the constellation a palette row shows as its chip.
 *
 * Deriving here — rather than re-walking `FAMOUS_STARS_GENERATED` at each call
 * site — keeps the table the one source of the star identity: a seed edit
 * re-bakes the generated table and every consumer picks the change up.
 *
 * Keyed by the star's `id` (the same `id` the `star` maker copies onto its
 * `StarBody`, so a star row looks up its search identity directly).
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';

/** Per-star search identity: the full alias list to score, plus the constellation
 *  the palette row shows as its secondary chip. */
export const FAMOUS_STAR_SEARCH: ReadonlyMap<
  string,
  { readonly names: readonly string[]; readonly constellation: string }
> = new Map(
  FAMOUS_STARS_GENERATED.map((row) => [
    row.id,
    { names: row.names, constellation: row.constellation },
  ]),
);
