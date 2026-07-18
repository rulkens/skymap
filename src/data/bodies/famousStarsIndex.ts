/**
 * famousStarsIndex — the single derivation of the famous stars' search identity,
 * projected off the generated seed table once and consumed in two places:
 *
 *   - the command palette's ranking pipeline (`rankPaletteMatches`), which scores
 *     a star body over its full `names[]` so a Bayer designation ("Alpha Canis
 *     Majoris") surfaces the same row as its common name ("Sirius"), and renders
 *     the constellation as the row's secondary chip; and
 *   - `buildFocusable`, which needs the set of star ids to tag which scene bodies
 *     are famous stars.
 *
 * Deriving both structures here — rather than re-walking `FAMOUS_STARS_GENERATED`
 * at each call site — keeps the table the one source of the star identity: a seed
 * edit re-bakes the generated table, and both consumers pick up the change with
 * no parallel list to keep in sync.
 *
 * Keyed by the star's `id` (the same `id` the `star` maker copies onto its
 * `StarBody`, so a `SceneBody` looks up its search identity directly).
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';

/** The ids of every famous star — the membership test `buildFocusable` keys on. */
export const FAMOUS_STAR_IDS: ReadonlySet<string> = new Set(
  FAMOUS_STARS_GENERATED.map((row) => row.id),
);

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
