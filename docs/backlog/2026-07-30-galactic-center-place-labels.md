# Galactic Center place labels

The S-star feature shipped Sgr A\* itself as a labelled, focusable body
("Galactic Centre"), so the centre is no longer an unlabelled smear. What is
still missing is the surrounding place: the four structures a viewer needs to
read the region as somewhere rather than as a bright patch of star field.

## The data

Four hand-authored rows. No catalog fetch, no parser, no `.bin`.

| Name                   | Offset from Sgr A\*      | Note                                            |
| ---------------------- | ------------------------ | ----------------------------------------------- |
| Central cluster        | ~0.5 pc                  | young massive stars, the WR/O census            |
| Arches                 | ~27 pc projected (11.4′) | 2–3 Myr, ~2×10⁴ M☉                              |
| Quintuplet             | ~30 pc projected         | ~4 Myr                                          |
| Central Molecular Zone | ~200 pc                  | the nuclear stellar disk both clusters orbit in |

Distances are the _projected_ separations. The line-of-sight component is
unconstrained for the two clusters — Hosek+2022 let it float ±300 pc from
Sgr A\* when fitting their orbits and called it the weakest constraint in the
model. Placing them at zero line-of-sight offset is the honest default, but it
is a choice the marker should not silently imply is measured.

## Why it needs design

The existing four marker categories are cluster / supercluster / void / group.
Arches and Quintuplet are genuinely clusters and could take that category as-is.
The CMZ is a ~200 pc gas structure and the nuclear stellar disk is a diffuse
extent, so neither fits, and both want a different marker treatment from a
cluster ring. So the question is whether this is:

- a new `poi` / `landmark` category taking all four rows, or
- Arches + Quintuplet into the existing `cluster` category, with the two
  diffuse rows deferred until that category exists anyway.

The second is less new machinery but splits four conceptually-adjacent rows
across two homes — and Sgr A\* already sits in a third (the body path).

Scale band matters too: these are pc-scale markers at 8.18 kpc, so they route
through NEAR0, not the COSMO slab (see the constellations-label precedent).

## What the S-star work already settled

Sgr A\* rides the **body** path — a `SCENE_BODIES` row labelled "Galactic
Centre", positioned, focusable, pickable, with its own `galactic-centre`
`BodyRegion` — see
[the S-star spec](../superpowers/specs/completed/2026-07-30-s-star-orbits-design.md).
That is a precedent, not a constraint: a single compact object landed in the
body domain, which is an argument for keeping the diffuse structures out of it.

## Reuse path

The `add-data-source` skill maps the full edit surface for a new featured
structure category. No new renderer: marker rings + labels already exist.
