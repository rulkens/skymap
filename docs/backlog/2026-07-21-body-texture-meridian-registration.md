# Body texture prime-meridian registration (non-Earth)

**Surfaced:** 2026-07-21, during the solar-system time-control terminator fix
(PR #472, commit `48a8f263`).

## Context

Equirectangular planet maps conventionally paint the prime meridian at the
image centre (u = 0.5), but the shared `uvSphereMesh` maps it to u = 0. For
Earth this produced a 180-degree day/night error the moment the live clock
gave a ground truth, and was fixed Earth-scoped: `cubeSphereMesh` +
`earth/fragment.wesl` + `cloudShell/fragment.wesl` now apply
`EARTH_TEXTURE_PRIME_MERIDIAN_U` (see `src/data/bodies/earthTexturePrimeMeridianU.ts`).

Every other textured body still renders its map 180 degrees rotated about its
spin axis. There is no observable consequence today: no other body has a
rotational-phase ground truth (no city lights, no terminator the user can
check against a wall clock), so the offset is invisible.

## The work

Decide whether to shift the shared `uvSphereMesh` (or the per-body samplers)
to the centre-registered convention, verify each body's map actually follows
the centre convention (most NASA/USGS maps do; confirm per source), and do a
visual pass per body. Becomes user-visible the moment any feature exposes a
body's absolute rotational phase (e.g. Great Red Spot longitude, Mars albedo
features against ephemeris predictions).
