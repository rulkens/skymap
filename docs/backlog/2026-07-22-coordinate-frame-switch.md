# Switchable global coordinate frame (ecliptic / equatorial / galactic)

`needs-design`

## The problem

The world frame is fixed right-handed **equatorial J2000** (+x vernal equinox, +z celestial north — `src/utils/math/raDecDistToCartesian.ts:11-14`). The solar system is placed in the ecliptic frame, which is tilted 23.44° from equatorial, so with a default camera the planets sit on a visibly slanted line. There is no way to view the scene "ecliptic-up" (planets horizontal) or "galactic-up" (MW disc horizontal). Wanted: a user-facing switch between global orientation frames.

## Verified current state

- Ecliptic tilt: `src/data/bodies/orbitPlaneFrames.ts:65` — `OBLIQUITY_DEG = 23.44`; `ECLIPTIC_FRAME` at `:73-78` is equatorial rotated by ε about +x. Planets/Moon reference it; planet moons reference per-planet Laplace-plane frames (`:80-82`).
- Galactic frame: `src/services/gpu/galaxy/milkyWayModelMatrix.ts:62-85` — fixed basis `GAL_X_EQ`/`GAL_Y_EQ`/`GAL_Z_EQ` building the MW model matrix; **shader mirror of the same literals** in `src/services/gpu/shaders/lib/util.wesl` (`worldToGalactic`, `galacticToShader`).
- No frame toggle exists anywhere; every consumer assumes equatorial world coordinates.

## Directions to explore (design decides)

- **View-side rotation (likely winner)** — keep world data equatorial; insert a frame rotation between world and view (camera up-vector / orientation convention). Pure camera concern, no data rebake, no shader changes. The switch selects which frame's +z is "up".
- **World rebase** — rotate the world itself. Touches everything (tours, deep links, shader galactic constants, pick math); almost certainly the wrong artifact.

## Open questions

- Does the frame affect only the rendered orientation, or also orbit-control semantics (what "pan horizontally" and pole-lock mean)?
- Scope of the switch: global, or auto-select by scale (ecliptic inside the solar system, galactic inside the MW, equatorial for the survey)?
- Transition: snap vs animated slerp between frames?
- Persistence: settings + URL sync?
- Interaction with baked tour poses (recorded in equatorial camera coordinates).

## Related

- Duplicated galactic basis literals (TS + WESL) — a frame registry would be the natural single home.
- Solar-system time control effort (memory `project_solar_system_time_control`) shares the "solar system as a first-class sub-scene" framing.
