# MSCC — Main SuperCluster Catalogue

| Field         | Value |
|---------------|-------|
| VizieR ID     | J/MNRAS/445/4073 |
| Reference     | Chow-Martinez et al. 2014, MNRAS 445, 4073 |
| Upstream URL  | https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/ |
| Fetch date    | 2026-05-30 |
| Row count     | 601 superclusters |
| Record length | max 324 bytes/row (variable-length ASCII; the trailing member-cluster list varies) |
| SHA-256       | `c87871dfbe30e8b00acbe377bab4098108f8d5dec62f26b9cdc3fbe2cebd0729` |

## How to obtain

```
npm run fetch-clusters
```

This downloads `mscc.dat` and `ReadMe` from the CDS FTP archive and
verifies the table against the committed `mscc.dat.sha256` sidecar.

## Column summary

Key columns (byte offsets from the VizieR ReadMe):

| Bytes   | Label   | Description |
|---------|---------|-------------|
| 1–3     | Seq     | Identification number (MSCC NNN) |
| 4       | f_Seq   | [c] candidate flag |
| 6–21    | SCLs    | Matching Einasto+2001 superclusters |
| 24–25   | Nm      | Number of member clusters |
| 27–32   | RAdeg   | Supercluster center RA decimal degrees (J2000) |
| 34–39   | DEdeg   | Supercluster center Dec decimal degrees (J2000) |
| 41–45   | z       | Mean redshift |
| 47–51   | dmax    | Maximum member-pair separation (h₇₀⁻¹ Mpc) |
| 53–324  | memCl   | Comma-separated member cluster IDs (ACO designations) |

Built from Abell/ACO A-clusters only (z ≤ 0.15) using a Friends-of-Friends
algorithm tuned for the declining cluster density with redshift. See the
VizieR ReadMe for the full byte layout.

## Feature design

See `docs/superpowers/specs/2026-05-30-cluster-supercluster-coverage-design.md` for how MSCC is parsed, filtered, and rendered in skymap, and `docs/superpowers/plans/2026-05-30-cluster-supercluster-coverage-1-data-pipeline.md` for the build-pipeline implementation plan.
