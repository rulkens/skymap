# REGALADE raw data — all-sky galaxy compilation to 2000 Mpc

This directory holds **REGALADE v2** (Tranin et al. 2026, A&A 706, A284;
[arXiv:2508.13267](https://arxiv.org/abs/2508.13267)), VizieR catalog
[J/A+A/706/A284](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/706/A284).
Nothing here is committed apart from this README; the files are pulled by
hand (no fetcher yet — the parser landed ahead of the build wiring).

## What's here

| File                    | Size                    | Source                                                                        |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `regalade.dat`          | ~25 GB, 71,485,705 rows | gunzipped `https://cdsarc.cds.unistra.fr/ftp/J/A+A/706/A284/regalade.dat.gz` |
| `J_A+A_706_A284_ReadMe` | ~10 KB                  | `https://cdsarc.cds.unistra.fr/ftp/J/A+A/706/A284/ReadMe` — byte layout       |

## How to populate it

```
cd data/raw/regalade
curl -O https://cdsarc.cds.unistra.fr/ftp/J/A+A/706/A284/ReadMe && mv ReadMe J_A+A_706_A284_ReadMe
curl https://cdsarc.cds.unistra.fr/ftp/J/A+A/706/A284/regalade.dat.gz | gunzip > regalade.dat
```

Both are gitignored (`/data/**`). No `.sha256` sidecar is recorded yet: the
catalog is re-issued in place (the 2026-09-02 revision replaced the February
one under the same name), so pin the `ReadMe`'s "updated version" date when
you record one.

## Format notes the parser relies on

348-byte fixed-width rows, 1-based byte offsets in the ReadMe. Landmines:

- **`Dist` is a luminosity distance** (verified against the pipeline cosmology:
  `Dist / D_L(z)` ≈ 0.99 for every redshift source, `Dist / D_C(z)` drifts
  10–30 % with z). `tools/parsers/regalade.ts` inverts it through
  `luminosityDistanceMpcToRedshift` rather than trusting `z`.
- `Refzin` / `r_DistInput` / `r_R1` index the paper's **Table 1** (0 SGA,
  1 GLADE1, 2 HECATE, 3 DESI-PV, 4 DESI-DR1, 5 Cosmicflows, 6 NED-LVS-D,
  7 NED-LVS-zsp, 8 NED-LVS-rest, 9 GLADE+, 10 LS DR9, 11 Pan-STARRS, 12 SDSS,
  13 GSC blue, 14 LS DR10, 15 DELVE, 16 Simbad) — **not** the `IdCat` bit
  values in the ReadMe's Note (1).
- Missing values are dash runs padded to the column (`---`), handled by
  `parseFloatOrNaN`.
- `R1 = R2 = 3.0` with `PA` 0 or 90 is the no-ellipse placeholder.
- The "thin" CSV RA bins the authors' GitHub README advertises
  (`regalade_thin_0_36.csv` on blackpearl.blackgem.org) 404 as of 2026-10-08.

## Licence

None stated on VizieR, the paper, or the GitHub repository
(<https://github.com/htranin/regalade>). Ask the authors
(htranin at icc.ub.edu) before redistributing derived `.bin` files.
