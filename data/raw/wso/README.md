# `data/raw/wso/` — Wilcox Solar Observatory source-surface maps

## Provenance

|          |                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Source   | Wilcox Solar Observatory (WSO), Stanford University                                                       |
| Upstream | <http://wso.stanford.edu/synsourcel.html> (maps), <http://wso.stanford.edu/Tilts.html> (rotation starts)  |
| Licence  | No formal licence. WSO Data Use Policy: <http://wso.stanford.edu/DataPolicy.html> (see below) |
| Fetched  | 2026-10-05                                                                                                |
| Fetcher  | `npm run fetch-wso`                                                                                       |

## Terms of use

WSO publishes a data use policy rather than a licence. It asks three things of anyone using
the data: notify them, acknowledge the source, and send a copy of resulting reports or papers.
The policy is written for research use and says nothing either way about redistribution or
non-research use, so ask J. T. Hoeksema (contact on the policy page) before shipping WSO-derived
data in the public app.

Acknowledgement wording WSO supplies (<http://wso.stanford.edu/src/ack.html>):

> Wilcox Solar Observatory data used in this study was obtained via the web site
> http://wso.stanford.edu at 2026:10:05_07:51:58 PDT courtesy of J.T. Hoeksema.

Reference for the coronal (source-surface) synoptic maps: Hoeksema et al., J. Geophys. Res. 88,
9910 (1983).

## What is held

- `synoptic/WSO-R250.<cr>.txt` — the radial potential-field source-surface model with the
  source surface at 2.5 R☉, one file per Carrington rotation, CR 1642–2302 (May 1976 →).
  Some are incomplete upstream; a rotation past the end of the dataset holds only an error line
  (`SS250_R: Start time after end of dataset`).
- `synoptic/WSO-S.<cr>.txt` — the classic line-of-sight model, fetched only for CR 2215, 2216
  and 2217, where R250 has gaps the classic chart covers.
- `Tilts.html` — the heliospheric current sheet tilt table; its `CR <n> <yyyy>:<mm>:<dd> <hh>h`
  rows give each rotation's start time (UT).

## File format

A header line, then one block per Carrington longitude:

```
CT2300:360           -2.308   -1.216   -0.580 ...
    0.292    0.372 ...
```

`CT<cr>:<lon>` is the Carrington longitude in degrees (0–360 in 5° steps; `360` is `0`), followed
by 30 field values in microtesla at equal steps of sine latitude from +14.5/15 (north) to
-14.5/15 (south), wrapped over four lines. Consumed by `tools/parsers/parseWsoSynopticChart.ts`
and `tools/parsers/parseWsoRotationStarts.ts`.
