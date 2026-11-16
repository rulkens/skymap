# Sky mode: what remains after entry and HUD

**Readiness:** `needs-design`. Entry, the `sky` takeover, the HUD and search while standing are specced in
`docs/superpowers/specs/completed/2026-11-07-sky-mode-entry-design.md`. What is left comes from the 2026-10-28 draft
spec, archived with its code as tag `archive/sky-mode`
(`git show archive/sky-mode:docs/superpowers/specs/2026-10-28-sky-mode-design.md`).

## What remains (draft spec sections)

- **`skyGrids` Layer**: cardinal points, alt-az grid, equatorial grid + celestial equator, ecliptic +
  meridian, visible by day, hidden behind terrain (draft §5, R2, R8, R9). The tag holds tested geometry for
  it: `src/utils/sky/sphericalGridLines.ts`, `meridianLine.ts`, `parallelLine.ts`, `hostEquatorialFrame.ts`
  and `tests/utils/sky/` (commit `976f7a650`; every import still resolves on main as of 2026-11-07).
- **The `sky=` URL row** carrying the spot, look and lens, written on enter, settle and exit (draft §6).
- **The lens on the URL pose codec and the recorder** (draft §3.2, deferred from the lens move).
- **Perf** at a sky pose at 60° and 1′ (draft §7): a narrow lens pushes terrain LOD, the disk planner
  and star constants tuned at 60°.
