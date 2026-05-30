# MCXC — Meta-Catalogue of X-ray galaxy Clusters

| Field         | Value |
|---------------|-------|
| VizieR ID     | J/A+A/534/A109 |
| Reference     | Piffaretti et al. 2011, A&A 534, A109 |
| Upstream URL  | https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/ |
| Fetch date    | 2026-05-30 |
| Row count     | 1743 clusters |
| Record length | 323 bytes/row (fixed-width ASCII) |
| SHA-256       | `29806a5c854ce0898a9f767744b99fa382dae56fe342d108a82e6549470a5683` |

## How to obtain

```
npm run fetch-clusters
```

This downloads `mcxc.dat` and `ReadMe` from the CDS FTP archive and
verifies the table against the committed `mcxc.dat.sha256` sidecar.

## Column summary

Key columns (byte offsets from the VizieR ReadMe):

| Bytes   | Label    | Description |
|---------|----------|-------------|
| 1–12    | MCXC     | MCXC name (JHHMM.m+DDMM) |
| 14–31   | OName    | Other name |
| 33–86   | AName    | Alternative name (Abell/ACO/UGC/popular; often blank) |
| 88–89   | RAh      | RA hours (J2000) |
| 91–92   | RAm      | RA minutes |
| 94–97   | RAs      | RA seconds |
| 99      | DE-      | Dec sign |
| 100–101 | DEd      | Dec degrees |
| 103–104 | DEm      | Dec arcmin |
| 109–115 | RAdeg    | RA decimal degrees (J2000) |
| 117–123 | DEdeg    | Dec decimal degrees (J2000) |
| 141–146 | z        | Redshift |
| 180–188 | L500     | X-ray luminosity (10^44 erg/s, 0.1–2.4 keV band) |
| 190–196 | M500     | Total mass (10^14 M☉) |
| 198–204 | R500     | Characteristic radius (Mpc) |

All quantities are homogenised to overdensity δ = 500 relative to the
critical density. See the VizieR ReadMe for the full byte layout.
