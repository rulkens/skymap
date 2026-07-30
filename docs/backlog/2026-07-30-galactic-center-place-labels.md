# Galactic Center place labels

The Galactic Center currently renders as an unlabelled bright smear. Five POI
markers would turn it into a named place, which is what makes anything else
placed there legible — a viewer who flies to the centre today has no way to tell
Sgr A* from the surrounding star field.

## The data

Five hand-authored rows. No catalog fetch, no parser, no `.bin`.

| Name | Offset from Sgr A* | Note |
| --- | --- | --- |
| Sgr A\* | 0 | 4.3×10⁶ M☉ black hole; RA 266.41684, Dec −29.00781 |
| Central cluster | ~0.5 pc | young massive stars, the WR/O census |
| Arches | ~27 pc projected (11.4′) | 2–3 Myr, ~2×10⁴ M☉ |
| Quintuplet | ~30 pc projected | ~4 Myr |
| Central Molecular Zone | ~200 pc | the nuclear stellar disk both clusters orbit in |

Distances are the *projected* separations. The line-of-sight component is
unconstrained for the two clusters — Hosek+2022 let it float ±300 pc from
Sgr A\* when fitting their orbits and called it the weakest constraint in the
model. Placing them at zero line-of-sight offset is the honest default, but it
is a choice the marker should not silently imply is measured.

## Why it needs design

The existing four marker categories are cluster / supercluster / void / group.
Arches and Quintuplet are genuinely clusters. Sgr A\* is a single compact
object and the CMZ is a ~200 pc gas structure; neither fits an existing
category, and both want a different marker treatment (a point vs a large
diffuse extent). So the question is whether this is:

- a new `poi` / `landmark` category taking all five rows, or
- Arches + Quintuplet into the existing `cluster` category, with Sgr A\* riding
  the body/famous-star path instead and the CMZ deferred.

The second is less new machinery but splits five conceptually-adjacent rows
across three homes.

Scale band matters too: these are pc-scale markers at 8.18 kpc, so they route
through NEAR0, not the COSMO slab (see the constellations-label precedent).

## Relation to the S-star work

The [S-star orbit feature](../superpowers/specs/) needs Sgr A\* to exist as a
positioned, focusable object regardless. If that lands first, this item shrinks
to the four remaining rows plus a category decision.

## Reuse path

The `add-data-source` skill maps the full edit surface for a new featured
structure category. No new renderer: marker rings + labels already exist.
