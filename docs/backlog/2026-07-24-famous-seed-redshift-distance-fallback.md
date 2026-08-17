# Famous-seed redshift-distance fallback breaks on cluster infall members

**Status:** needs-design (2026-07-24)

## Ask

M90 (NGC 4569) renders at `distanceMpc: 1.4714285714285715`, inside the Local
Group, when it is a Virgo Cluster member at roughly 16-17 Mpc. Every other
Virgo member in the famous seed sits at 11-20 Mpc. The wrong distance also
drags the wrong `diameterKpc` with it, so the point mispositions and
mis-sizes at once. Decide how the famous-seed pipeline should handle a galaxy
whose peculiar velocity swamps its Hubble-flow signal, since M90 is the
visible instance of a class, not a one-off.

## Current state

`tools/famous/expandFamousFromCatalogs.ts:384-392` (`distanceMpcFromHyperLeda`)
chains two HyperLEDA fields:

1. `mod0` (true distance modulus) if `e_mod0 < MAX_MOD0_ERROR` (`0.3`,
   `expandFamousFromCatalogs.ts:112`): `d_Mpc = 10^((mod0-25)/5)`.
2. else `v3k` (CMB-frame velocity) if positive: `d_Mpc = v3k / H0_KM_S_MPC`
   (`H0_KM_S_MPC = 70`, `expandFamousFromCatalogs.ts:106`).

The cached HyperLEDA row for NGC4569 (`data/raw/hyperleda/hyperleda_famous_cache.tsv:70`)
carries `mod0 = 30.37`, `e_mod0 = 0.35`, `v3k = 103`. `0.35 > 0.3` rejects
`mod0`, so the chain falls to `v3k / 70 = 103 / 70 = 1.4714285714285714…`,
which lands in the seed verbatim
(`data/seeds/famous_galaxies.seed.json:1275`, alongside `diameterKpc:
3.9035999332040086`). M89 and M91, the seed's immediate neighbours, sit at
`distanceMpc: 15.68…` and `15.62…` (`famous_galaxies.seed.json:1259,1292`),
both of which cleared the `mod0` gate.

The rejected `mod0` is worth pricing: `10^((30.37-25)/5) = 11.9` Mpc. So the
error gate discards a measurement that misses its threshold by 0.05 mag and
would have placed M90 within a factor of 1.4 of the cluster, in favour of an
estimator that misses by a factor of 11. The gate scores each estimator's
own stated uncertainty in isolation and never compares the two candidates
against each other, so it cannot notice that its fallback disagrees with the
value it just rejected by an order of magnitude.

The chain's own doc comment (`expandFamousFromCatalogs.ts:378-382`) already
names the failure mode for the opposite sign: Local Group galaxies with
`v3k < 0` are excluded by the `> 0` check because they're the ones falling
_toward_ us, and the comment assumes they always have a good `mod0` instead.
M90 is the counter-example the comment doesn't cover: it's a Virgo _infall_
member, close enough that its CMB-frame velocity (103 km/s, mostly peculiar
motion toward the cluster, not Hubble flow) is small and positive, so it
clears the `> 0` check and reads as a 1.5 Mpc Local Group object instead of a
16 Mpc cluster member with a large negative peculiar velocity relative to the
Hubble flow at its true distance. `v3k / H0` is invalid precisely where
peculiar velocity is comparable to Hubble-flow velocity: the Virgo infall
region generally, not something specific to this one galaxy.

**Blast radius beyond position.** `diameterKpc` is angular size times
distance, so the wrong distance also produces a diameter about 10x too
small. Both then feed the galaxy surface-brightness model
(`docs/backlog/2026-07-24-galaxy-surface-brightness-model.md`):
`src/utils/galaxy/galaxySbAmp.ts:36-41` divides by `(diameterKpc /
SB_REF_DIAMETER_KPC)^2`, and the absolute magnitude driving it is
`absoluteFromApparent(magB, distanceMpc)`
(`src/services/engine/bake/buildPointInterleavedBuffer.ts:308`, using
`magB` off the seed entry). Distance also sets the raw Cartesian position:
`tools/famous/buildFamous.ts:45-51` (`entryToXyz`) converts `(ra, dec,
distanceMpc)` directly to `(x, y, z)`. M90 currently renders in the wrong
place, undersized, and at the wrong brightness, all from the one bad
distance.

**Re-running the pipeline reproduces it, so a hand-edit doesn't stick.**
`npm run famous-seed-from-leda -- NGC4569` (`tools/famous/famousSeedFromHyperleda.ts`)
calls the same `mergeIntoFamousEntry` (`expandFamousFromCatalogs.ts:445`) that
`expand-famous` uses, and its merge rule explicitly overwrites
`distanceMpc`/`diameterKpc`/`axisRatio`/`positionAngleDeg`/mags on every run,
preserving only `id`/`names`/`description`
(`expandFamousFromCatalogs.ts:434-440`). A hand-corrected `distanceMpc` in
`famous_galaxies.seed.json` is reverted the next time `expand-famous` runs
over the seed.

**A precedent mechanism exists, but only on the survey path.**
`data/seeds/local_volume_distances.seed.json` is a curated
redshift-independent distance override for exactly this failure class:
entries already carry `method: "Tully-Fisher, Cosmicflows-3 (cz sign is bad
catalog data)"` and `method: "Virgo cluster mean"`
(`local_volume_distances.seed.json:24,36`). It's keyed by 2MASS `massId`
(not PGC, per its own header comment, `tools/catalog/loadLocalVolumeDistanceSeed.ts:15-17`)
and loaded into the survey bin build via
`loadLocalVolumeDistanceSeed()` (`tools/catalog/buildAllBins.ts:637`). The
famous seed path has no equivalent override, which is why M90 has nowhere
to be corrected that survives a re-run.

A related but narrower mechanism is already documented for a different
sub-case: `.claude/skills/add-famous/SKILL.md:151-166` tells a human curator
to co-locate an _interacting pair_ at a CF4 group distance
(`table3.dat.gz` `DMav`) when the pair's members land at mismatched HyperLEDA
depths. That procedure is scoped to pairs sharing a tidal bridge; it doesn't
address a lone infall member like M90, though the CF4 lookup it describes is
the same kind of redshift-independent source a general fix would need.

## Options

- **A distance-override seed for the famous path**, mirroring
  `local_volume_distances.seed.json`: a small curated file (keyed by PGC or
  NGC id) that `expand-famous`/`mergeIntoFamousEntry` consults before falling
  to `v3k`, and refuses to overwrite. Reuses a proven pattern, keeps the
  correction auditable with a `method` string per entry. Costs a second
  override file plus a merge-priority rule in the builder.
- **A guard in `distanceMpcFromHyperLeda`** that rejects the `v3k` fallback
  below some velocity floor and falls through to a CF4 group distance
  instead of `null`. Fixes the whole class, not one row, and the
  `add-famous` skill already half-describes the CF4 `table3` `DMav` lookup
  for pairs, so the machinery to reuse is partly built. Needs a defensible
  velocity floor (Virgo's velocity dispersion is a few hundred km/s, so a
  fixed cut has to clear that without also rejecting genuinely nearby, slow
  Hubble-flow galaxies) and a CF4-by-PGC lookup on a path (famous) that
  doesn't have one today.
- **Make the chain comparative rather than sequential.** Where both `mod0`
  and `v3k` resolve, take the `mod0` value even past its error gate when the
  two disagree by more than the gate could explain, on the reasoning that a
  noisy direct measurement beats a systematically invalid proxy. Smallest
  change of the three and it needs no new data source, but it only narrows
  the failure rather than closing it: a galaxy with no `mod0` at all still
  falls through to `v3k`.
- **Accept per-entry manual curation and document the trap.** Cheapest, but
  as shown above it doesn't survive the next `expand-famous` run unless
  paired with some preservation rule for the corrected field; without that
  it's not really an option, just a temporary state.

Landing any of these still requires `npm run build-famous`
(`tools/famous/buildFamous.ts`) and `npm run sync-r2-secure`: `famous.bin`
(`buildFamous.ts:220`) reaches production through R2, not git
(`docs/DEPLOY.md:16`).
