# Screenshots

This directory holds PNGs / GIFs embedded in the top-level
[`README.md`](../../README.md).  The captures themselves are added by
hand — this file is a checklist of what to capture and roughly what
each shot should show.

Suggested file names and naming convention: lower-case kebab,
`.png` for stills, `.gif` for short loops, kept under ~3 MB each.

## Captures to record

- [ ] `synthetic-data.png` — first launch with no `.bin` files, showing
      the 100,000-galaxy synthetic-sphere fallback.  Demonstrates that
      the renderer works end-to-end without any data setup.
- [ ] `sdss-only.png` — single-survey workflow with just
      `public/data/sdss.bin` present.  Show the SDSS wedge with the Sloan
      Great Wall visible.  Settings panel should confirm only SDSS is on.
- [ ] `all-three-surveys.png` — SDSS + 2MRS + GLADE all loaded and
      rendered together.  Camera positioned to show how 2MRS fills the
      local volume and GLADE fills outside the SDSS footprint.
- [ ] `zoomed-thumbnail-infocard.png` — close approach to a famous
      galaxy (M31, M51, NGC 5128 — anything with a curated thumbnail).
      The textured quad replaces the dot, and the InfoCard (right side)
      shows pinned metadata: coordinates, redshift, lookback time,
      catalog row, NED link.
- [ ] `density-correction-modes.png` — the Settings panel expanded to
      show the four density-correction modes (None / Volume-limited /
      1/V_max alpha / Schechter LF) plus the angular-isotropy toggle.
      Helps readers see what's tunable without launching the app.

## Optional extras

- [ ] `hero.gif` — short (~5 s) animated capture for the top-of-README
      placeholder.  Camera orbit + a focus tween onto a galaxy works
      well as a hero shot.
- [ ] `command-palette.png` — Cmd+K / Ctrl+K palette open with
      famous-galaxy results.

After dropping a capture in here, embed it from the README via a
relative path, e.g.:

```markdown
![All three surveys](docs/screenshots/all-three-surveys.png)
```
