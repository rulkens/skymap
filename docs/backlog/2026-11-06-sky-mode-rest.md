# Sky mode: what remains after look-around

**Readiness:** `needs-design`, with the design largely written: sky mode's spec
`docs/superpowers/specs/2026-10-28-sky-mode-design.md` on branch `sky-mode`.

## State

The `{ sky }` camera arm stands a person at a frame-tagged spot (#1032) and, since sky look-around
(spec `specs/2026-11-06-sky-look-around-design.md`), answers drag (look), wheel (lens 0.5°–120°)
and an exit past 120°. The lens is camera state (`camera.fovYRad`, #1059). Only clips enter the arm.

## What remains (sky-mode spec sections)

- **Entry**: "Sky from here" palette row + `s`, `enterSky(target)`, `skyEntry` resolved in the engine
  with `terrainPickAt` at the view centre, the arrival tween (§4.2).
- **Place picker**: a typed or picked lon/lat (§6, `rankPaletteMatches` sky rows).
- **`skyGrids` Layer**: cardinal points, alt-az grid, equatorial grid + celestial equator, ecliptic +
  meridian, visible by day, hidden behind terrain (§5, R2, R8, R9).
- **The `sky` takeover** with Esc restoring the entry `camera.base` (§4.3, D2, R5).
- **Readout** and the `sky=` URL row carrying the lens (§6).
- **The lens on the URL pose codec and the recorder** (§3.2, deferred from the lens move).
- **Perf** at a sky pose at 60° and 0.5° (§7): a narrow lens pushes terrain LOD, the disk planner
  and star constants tuned at 60°.

## When it resumes

The sky-mode spec and plan take the frame-tag shape (place in `{ sky: SkySpot }`, pose = look) and
the look-around arm as built; its §4.1/§4.3 camera sections are done.
