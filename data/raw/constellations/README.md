# Constellations — d3-celestial stick-figure line data

Vendored source for the true-3D constellation overlay. The build stage
(`tools/stars-rs/src/constellations.rs`) reads `constellations.lines.json`,
resolves every polyline vertex to a real 3D star position, and emits
`public/data/constellations.json`.

## Upstream

- **Project:** d3-celestial by Olaf Frohn (`ofrohn/d3-celestial`)
- **Repo:** <https://github.com/ofrohn/d3-celestial>
- **File:** `data/constellations.lines.json`
- **Pinned commit:** `7e720a3de062059d4c5400a379146a601d9010e0` (master HEAD at fetch time)
- **Raw URL:** <https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.lines.json>
- **Fetched:** 2026-07-22

## License

d3-celestial is BSD-3-Clause. The data files ship under the same license.

```
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the conditions of the
BSD 3-Clause License are met (see the upstream LICENSE for the full text).
```

## Shape

GeoJSON `FeatureCollection`. 89 `Feature`s — one per IAU constellation, except
Serpens, which appears twice (Serpens Caput + Serpens Cauda) so it has two
features sharing the id `Ser`.

Each feature:

- `id` — the 3-letter IAU abbreviation (`"Ori"`, `"UMa"`, `"And"`, …). The build
  maps this to the full Latin constellation name for the artifact's `name` field.
- `properties.rank` — a brightness/prominence rank string (`"1"`, `"2"`, `"3"`),
  unused by the build.
- `geometry` — a `MultiLineString`. `coordinates` is an array of polylines; each
  polyline is an array of `[ra_deg, dec_deg]` vertices tracing one stroke of the
  stick figure. A constellation's segments are the union of all its polylines'
  consecutive-vertex pairs; segments never cross a polyline boundary.

Coordinate conventions in the raw file:

- RA is in **degrees, range −180…180** (not 0…360). The parser normalises RA to
  0…360 before any angular comparison against the famous-star seed (0…360) and
  before storing.
- Dec is in degrees, −90…90.
- Frame is equatorial J2000 (matches the star catalog + famous seed).

## Checksum

`constellations.lines.json.sha256` is the committed SHA-256 sidecar (one
`<hex>  <filename>` line), so a truncated or drifted re-fetch fails loudly.
