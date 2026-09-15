# Earth point in the URL hash

**Raised:** 2026-09-15, by the user during the terrain F1/F2 eye-checks — "it
would be nice if we could have a url hash (like `body-*`) where we could
navigate to a point on earth".

## Current state

- `HASH_PARAM_SOURCES` (`src/state/url/hashParamSources.ts`) carries `focus`,
  `t` and `orientation` only. `focus=body-earth` frames the planet; nothing
  places the camera over a coordinate.
- The snap already exists as a debug instrument: `flyToLonLat({ lonDeg, latDeg })`
  (`src/state/camera/flyToLonLatActions.ts`) → `watchFlyToLonLatSaga.ts` commits
  a body-arm pose over the point at the camera's CURRENT altitude and heading,
  via `lonLatFocusPose`. The Earth Tile Atlas debug section is its only caller.
- The current point can be read back from
  `surfaceTiles.getDebugSnapshot().subCamera` (engine handle) while the tile
  subsystem is engaged, and from the body arm's `bodyFixedEyeM` otherwise.

## Shape

One param, e.g. `#site=12.53,55.67` or `#site=12.53,55.67,2000` (lon, lat,
optional altitude in metres above the datum; heading north, pitch nadir-ish by
default). Read: dispatch `flyToLonLat` once the body arm can host it (the
saga's `hostOf` needs body states; boot focus is Earth already). Write: on the
trailing edge of a camera commit at rest, from the sub-camera point, rounded
to ~5 decimals (about 1 m) — or read-only in a first cut, like `t` was.

## Open before it can be spec'd

- Altitude default when the param carries none (the saga keeps the current
  altitude, which at boot is the 27,587 km framing — useless for a point).
- Earth only (`SCENE_EARTH` is hard-wired in the saga) or `site=<body>:lon,lat`
  now that Mars terrain is planned.
- Ordering against `focus=body-earth` in the same hash, and against the
  wider camera-pose codec in
  [`2026-09-14-camera-pose-url-hash.md`](2026-09-14-camera-pose-url-hash.md):
  this is the human-typable subset of that codec, and should not become a
  second pose authority once it lands.
