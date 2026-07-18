# Second DESI deep cone

> **Backlog item** · `awaiting-decision` · area: Data
> **Promote to:** a small spec + plan of its own once the target is chosen.

## Problem

A second drill-core cone was requested through the Coma cluster, alongside the shipped Corona Borealis cone (`docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`).

## Current state (verified 2026-07-09, measured against the local DR1 LSS files)

**Coma is DR2-blocked.** A 2.5° cone on the stored `coma-a1656` anchor (194.954, +27.983) contains 1,195 BGS rows and **zero** LRG/ELG/QSO rows. DR1's dark-time programs left a hole exactly on Coma — coverage surrounds it (r < 6° returns 7-12k rows per tracer just off-center), but the cluster core itself has no dark-time spectroscopy until DR2 (~2027).

**Ready-now alternative: Stripe 82.** The bright patch at (334.42, +0.15) — a real z ≈ 0.1 cluster complex the user spotted in SDSS — is spike-verified viable in all four DESI tracers, ~30.5k rows/cone. Caveat: it falls in the SGC (South Galactic Cap), and the current fetch is NGC-only (the shipped cone is entirely north), so this needs the four SGC clustering files fetched as well — roughly the same size as the existing NGC fetch.

## Implementation scope

The shipped pipeline is deliberately single-cone: one `DESI_CONE` constant, one bin (`desi-deep.bin`), one `Source` enum entry. A second cone is not a config tweak — it needs:

- a new `Source` enum code (append-only, per `src/data/source.ts`'s docstring rule)
- a registry entry + settings row
- its own bin + an R2 `ALLOW` entry (`tools/deploy/syncR2.ts`)
- generalizing `loadDesi` from a single hardcoded cone to per-cone file/filter pairs (the SGC fetch is a second file set, not a filter change)

Small spec + plan of its own, not a fold into the existing plan.

## Decision needed

Stripe 82 now (SGC fetch + generalization work, ready today) vs. park the whole second-cone effort until DR2 makes Coma viable (~2027).
