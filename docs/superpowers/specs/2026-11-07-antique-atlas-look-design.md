# Antique atlas look — design

Status: in progress on `worktree-antique-map-spike` (2026-11-07). Owner brief: "a version of
skymap that looks like old 17th / 18th century maps … dragons, sea monsters, shader techniques
and compositing", researched and compared, graded by a cartographer, a UI/UX map designer, a
historian and an art critic until the grades are high enough. Ruled the same day: properly
implemented with all skymap conventions, not a throwaway spike.

## Why

Skymap is a map of the measured universe. Rendering it the way a 1660 Amsterdam atelier would
have engraved it is a teaching device (planetarium shows, exhibits: "this is how the sky was
charted") and a showcase of the renderer. It must stay a *chart of the real data*: every star
glyph, contour and wash is derived from the rendered frame, nothing is painted over it.

## Period: one atelier, held throughout

Research (session scratchpad `research/cartography.md`, 40-item checklist) is explicit that
mixing periods is the strongest tell of a fake. Monsters, coloured cartouches and outline-colour
bands exist together only in the **mid-17th-century Dutch** look, so that is the look:
Cellarius' *Harmonia Macrocosmica* (Amsterdam, 1660) for the sky and the planets, Blaeu for the
Earth. Consequences: coasts get the hatched halo (water-lining is 18th-century), regions get
outline colour (not German area washes), the cartouche is coloured, lettering is IM Fell
(digitised from 17th-century Fell types).

## Architecture

### Frame routing — one new step kind, zero cost when off

- `settings.antique.enabled` (`state/settings/core/antiqueSlice.ts`; boots from the `?antique`
  URL gate; the Settings panel's toggle dispatches `setAntiqueEnabled`).
- `antiqueLookOn(state)` = enabled **and** `viewRig === 'mono'` (a dome face resolves `swap` to
  its own output, which the rerouting would leave unwritten).
- `FrameInputs.antique` makes `expandFrameOrder` retarget the `swap` lines: the tone-map lands
  in `print`, the overlay render lines in `overlay` (transparent), so the look can ink captions
  as lettering instead of treating them as scene light.
- A new `FRAME_ORDER` line, `{ kind: 'stylize', source: 'print', overlay: 'overlay' }`, last in
  `OVERLAYS`, expands to nothing with the look off. On, the executor hands the encoder to
  `state.gpu.antiqueLook.encode(...)`, which opens its own ordered passes (the `runBloom`
  precedent: a fixed pass sequence the `(target, slab)` model cannot express).

### Passes (`services/gpu/passes/antiqueLook/`, shaders in `shaders/antiqueLook/`)

| # | Pass | Writes | Res | Notes |
|---|------|--------|-----|-------|
| 1 | paper bake | `antique-paper` rgba8 | full | sheet albedo rgb + relief a; only when the row is reallocated |
| 2 | reduce | `antique-wash`, `antique-peaks` rgba16f (MRT) | 1/4 | block mean colour + land share; brightest sky texel |
| 3 | glow | `antique-glow` rgba16f | 1/16 | the low band past star scale |
| 4 | peaks | `antique-stars` rgba16f | 1/4 | non-max suppression; contrast over local mean |
| 5 | plate | swap | full | everything below |

All rows are `allocateWhen: antiqueLookOn` (`antiqueLookTargetRows.ts`), so a session that never
opens the look allocates nothing.

### The plate: two regimes split by `foreground:0` alpha

- **Sky is inverted** (every period chart): empty space is bare paper; each surviving peak stamps
  a glyph from the Bayer/Flamsteed ladder (dot → 5 → 6 → 8 → 12 rays → glory) sized by contrast,
  with a paper knock-out 1.3× its size; the low band becomes a pigment wash with a Dutch
  outline-colour band and pooled rim, sparse stipple for bright extended light, and isophote
  contours at doublings (Hevelius' wavy Milky Way edge). Never solid ink from a glow.
- **Bodies are engraved**: ink ∝ darkness via tone-width hatching (crossing set past 0.42, a
  third past 0.75), night found by the brightest channel, seas by hue, the hatched coast halo
  from the quarter-res land share, one firm limb line from the alpha gradient.
- **Rulings**: RA/Dec graticule per pixel from the four corner rays (`viewCornerRays`; the world
  frame is equatorial), spacing following the zoom; equator and ecliptic as chequered graduated
  bands; the neatline's degree ladder inked by the parity of the coordinate the edge cuts.
- **Sheet**: margin, embossed plate mark with plate tone inside, laid/chain lines, toning from
  the edges, clustered foxing, paper tooth breaking thin lines.
- **Colour** is always one of seven period pigments (`pigments.wesl`), applied as transmittance,
  offset from the line by a smooth misregistration field.

### Ornaments (compositing)

- Source art: genuine public-domain engravings (Commons PD-Art scans; provenance per sprite),
  packed by a tool into one atlas whose channels are **ink, fill, wash** (greyscale each); the
  hue comes from the instance's pigment, so ornaments stay inside the palette.
- **Sheet-anchored**: the cartouche (title in IM Fell, Latin with period V-for-U) and the compass
  rose (rotated each frame to celestial north at its position).
- **Sky-anchored**: the sky's own beasts — sea monsters and dragons placed at sky directions in
  the Zone of Avoidance, the band behind the galactic plane where the catalogs are genuinely
  empty (the honest *terra incognita*), each with its own wave strokes. Projected per frame on
  the CPU from the corner-ray basis; faded out when too large or too small on screen.
- "HIC SVNT DRACONES" appears at most once and only attributed (Hunt–Lenox globe), never as a
  generic period label.

## Ground preparation

None needed — because the frame program already has the two joints this rides: expansion is a
pure function of `FrameInputs` (so rerouting `swap` is one input, not a new code path), and the
executor already hosts a self-sequencing multi-pass step (`bloom`). The feature adds one step
kind (`stylize`) and one GPU handle row; no Layer contract, `ReconcileEffects` or `SagaContext`
change. Watch item: `lookTarget`'s `'swap'` special case is the only place the look knows a
target name; a second look would make it a table.

## Success criteria

- The four reviewers each grade the current shots ≥ 8/10, against the cartography checklist
  (`research/cartography.md` §9) for the cartographer, period accuracy for the historian.
- Look off: frames byte-identical to main (no step, no allocation).
- The look costs ≤ 2 ms GPU at 1600×900 @2× on the M-series perf poses (`npm run perf`).
- No modern UI bleed with the look on: the app chrome takes the sheet's theme.

## Out of scope

Sky-anchored constellation figures from Flamsteed/Bode plates (backlog item
`2026-09-14-antique-atlas-constellation-figures`, a separate pipeline); the dome rig; a second
period look (18th-c. German) — the target/step shape allows it, nothing is built for it.
