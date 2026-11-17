# `data/raw/galstreams/` — stellar stream tracks

## Provenance

|         |                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Paper   | Mateu 2023, _galstreams: a library of Milky Way stellar stream footprints and tracks_, MNRAS 520, 5225 ([arXiv:2204.10326](https://arxiv.org/abs/2204.10326)) |
| Code    | [github.com/cmateu/galstreams](https://github.com/cmateu/galstreams) at commit `6a304c05bea7f774390a11082ea127719e99b70a` (2026-06-03) |
| Licence | BSD-3-Clause (the repository's `LICENSE`); each track also credits its own discovery paper, named in `master_log.txt`            |
| Fetched | 2026-11-06                                                                                                                      |
| Fetcher | `npm run fetch-galstreams`                                                                                                      |

The fetcher pulls the GitHub tarball of that commit, keeps only `galstreams/tracks/` and
`galstreams/lib/master_log.txt`, and discards the tarball. Its checksum is the committed sidecar
`galstreams-<commit>.tar.gz.sha256`:

```
0aef914bbd30f4ef01a0d7c5fcaa68f45e5807b900c298c9d65488d70eb52f35  galstreams-6a304c05bea7f774390a11082ea127719e99b70a.tar.gz
```

## Layout

- `lib/master_log.txt`: one whitespace-separated row per track, header
  `# Imp On TrackName Name TrackRefs TrackRefsLatex Notes from-Members width_phi2 …`. Split on
  whitespace, `Imp` (the track kind) is column 0, `On` (1 = the stream's preferred track) column 1,
  `TrackName` 2, `Name` (the stream) 3, `TrackRefs` 4 and `width_phi2` (deg) 8. `-9.0`, `-1.0` and
  dashes mean missing.
- `tracks/track.<Imp>.<Name>.<TrackRefs>.ecsv`, one per master-log row, with a `.summary.ecsv` sibling
  (end points, mid point, pole, widths). ECSV is a `#`-prefixed YAML header, then CSV with columns
  `ra, dec` (deg), `distance` (kpc), `pm_ra_cosdec, pm_dec` (mas/yr), `radial_velocity` (km/s). A
  sky-only track carries a placeholder distance of 1.0 kpc on every row.

Kinds: `st` = stream track (192 rows), `ep` and `po` = other footprints (15 and 10). 217 tracks of 147
streams; 82 streams other than Sagittarius have an `st` track with real distances.
