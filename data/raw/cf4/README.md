# Cosmicflows-4 raw data

Source: CDS Vizier table [J/ApJ/944/94](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJ/944/94),
Tully et al. 2023, *Cosmicflows-4*.

## Files

- `table2.dat` — fixed-width ASCII, 55,877 rows (~10.6 MB). Each row is one
  galaxy with a homogenised redshift-independent distance modulus +
  uncertainty, cross-IDed against PGC and 2MASS XSC. Produced by
  decompressing `table2.dat.gz` (CDS only serves the gzipped form);
  the parser in `tools/parsers/cosmicflows4.ts` (sub-plan 02) reads
  byte ranges according to the `ReadMe` byte-offset spec.
- `table2.dat.gz` — the as-shipped gzipped artefact from CDS (~2.5 MB).
  Kept on disk so a re-run of `npm run fetch-cf4` hits the Range: 416
  fast-path instead of pulling the bytes again. Downloaded via
  `npx tsx tools/fetch/fetchCosmicflows4.ts`.
- `ReadMe` — the CDS column-offset spec. The parser cross-checks byte
  positions against this file; if CDS ever re-issues the table with a
  different layout, re-download both files together.
- `table2.dat.sha256` — checksum of the decompressed `table2.dat`,
  written by the fetcher. The parser cross-checks before parsing; a
  mismatch aborts with a clear error.

The CF-4 *density* cube intermediates (`d_mean_CF4pp.npy`, related `.sav`,
`.meta.json`) are produced separately for the volume-rendering pipeline
and live in this same directory; see `tools/volumes/buildCf4Density.ts`.

## How CF4 is used

CF4 supplies redshift-independent distance moduli for ~55k local-volume
galaxies. The build pipeline applies them as a position override for
galaxies inside 30 Mpc (where peculiar velocities dominate the cz signal).
See `docs/superpowers/specs/2026-05-27-local-volume-distances.md` and
`docs/superpowers/plans/2026-05-27-local-volume-distances.md` for the
full design.

## Citation

Tully, R. B., Kourkchi, E., Courtois, H. M., et al. 2023, ApJ, 944, 94.
DOI: [10.3847/1538-4357/ac94d8](https://doi.org/10.3847/1538-4357/ac94d8).
