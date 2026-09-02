# Second DESI deep cone

> **Backlog item** · `awaiting-decision` · area: Data
> **Promote to:** a small spec + plan of its own once the target is chosen.

## Problem

A second drill-core cone was requested through the Coma cluster, alongside the shipped Corona Borealis cone (`docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`).

## Current state (verified 2026-07-09, measured against the local DR1 LSS files)

**Coma is DR2-blocked.** A 2.5° cone on the stored `coma-a1656` anchor (194.954, +27.983) contains 1,195 BGS rows and **zero** LRG/ELG/QSO rows. DR1's dark-time programs left a hole exactly on Coma — coverage surrounds it (r < 6° returns 7-12k rows per tracer just off-center), but the cluster core itself has no dark-time spectroscopy until DR2 (~2027).

**Ready-now alternative: Stripe 82.** The bright patch at (334.42, +0.15) — a real z ≈ 0.1 cluster complex the user spotted in SDSS — is spike-verified viable in all four DESI tracers, ~30.5k rows/cone. Caveat: it falls in the SGC (South Galactic Cap), and the current fetch is NGC-only (the shipped cone is entirely north), so this needs the four SGC clustering files fetched as well — roughly the same size as the existing NGC fetch.

## Implementation scope

`tools/catalog/desiPatches.ts` (#421) has since generalized cones into a
`DESI_PATCHES` table — adding a drill geometry is "one row here plus one
`Source` registration," not a cloned pipeline path (`desiPatches.ts`'s own
docstring). The single-cone cost list this section used to carry is
largely obsolete; what remains is the Coma-vs-Stripe-82 target decision
below, plus the SGC clustering-file fetch Stripe 82 specifically needs.

## Decision needed

Stripe 82 now (SGC fetch + generalization work, ready today) vs. park the whole second-cone effort until DR2 makes Coma viable (~2027).
