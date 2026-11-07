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
glyph comes from the catalogue the frame draws (by apparent magnitude), every contour and wash
from the rendered frame, and land and sea from the body's own ocean mask; nothing is painted
over it. A fidelity reviewer checks each plate against the plain render of the same view.

## Period: one atelier, held throughout

Research (session scratchpad `research/cartography.md`, 40-item checklist) is explicit that
mixing periods is the strongest tell of a fake. Monsters, coloured cartouches and outline-colour
bands exist together only in the **17th-century Dutch** look, so that is the look: the
Amsterdam trade of c.1690 (Cellarius' *Harmonia Macrocosmica* reissued by Valk & Schenk, Blaeu
for the Earth). c.1690 rather than 1660 because the Hevelius Cetus (1690) is the best figure we
have; older ornaments (Ortelius 1590) read as re-used plates, which the trade routinely did.
Consequences: coasts get the hatched halo (water-lining is 18th-century), regions get outline
colour (not German area washes), lettering is IM Fell (digitised from Fell types, c.1670), the
imprint reads "Amstelodami, ex officina Skymapiana, Anno MDCXC", and there is no compass rose
(no celestial chart carried one).

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
| 0 | star print (FRAME_ORDER, star Layer) | `antique-print-points` rgba16f + depth32f | 1 texel per 4 print units | each naked-eye star (m ≤ 5.75) of the cut's leaves and the seeded stars as one point: NDC xy, apparent magnitude; depth keeps the brightest per texel |
| 1 | paper bake | `antique-paper` rgba8 | full | sheet albedo rgb + relief a; only when the row is reallocated |
| 2 | reduce | `antique-wash` rgba16f | 1/4 | block mean colour + land share |
| 3 | glow | `antique-glow` rgba16f | 1/16 | the low band past star scale |
| 4 | glyphs | `antique-star-ink` rgba8 | full | one instanced quad per print-points texel, max-blended: glyph ink r, knock-out g; a star on a body never prints |
| 5 | decor | `antique-decor`, `antique-decor-hue` rgba8 (MRT) | full | one instanced quad per placed ornament: figure ink, plate ink, clear, wash; and the wash pigment |
| 6 | plate | swap | full | everything below |

Pass 0 is two look-only star Layer passes (`star-catalog-print`, `star-points-print`, in
`ANTIQUE_ONLY_PASSES`) on a `FRAME_ORDER` line of their own; the rest run inside `stylize`.

All rows are `allocateWhen: antiqueLookOn` (`antiqueLookTargetRows.ts`), and the pipelines,
buffers and assets are built on the look's first frame (`createAntiqueLookGpu`,
`loadAntiqueSheetAssets`), so a session that never opens it allocates nothing. Assets (~3.4 MB:
paper tile 2.2 MB, ornament atlas ~1.1 MB) are fetched from `public/antique/` then.

### The plate: two regimes split by `foreground:0` alpha

- **Sky is inverted** (every period chart): empty space is bare paper; each printed star stamps
  a glyph from the Bayer/Flamsteed ladder (dots for the faintest two classes, then 6 and 8 rays,
  16 for the brightest), one class per apparent magnitude (class 5 − round(m)),
  with a paper knock-out 1.3× its size; the low band becomes a pigment wash with a Dutch
  outline-colour band and pooled rim, sparse stipple for bright extended light, and two
  contours, the boundary and one inner one (Hevelius' wavy Milky Way edge). Never solid ink from
  a glow.
- **Bodies are engraved**: ink ∝ darkness via tone-width hatching parallel to the terminator
  (one direction per frame, across the Sun's on-screen direction — a per-pixel direction cannot
  keep a hatch's phase), crossed at about 50° for lozenges, width from a smoothed tone so lines swell
  rather than break; night found by the brightest channel, seas by hue and left pale with the
  hatched coast halo, one firm limb line from the alpha gradient.
- **Rulings**: RA/Dec graticule per pixel from the four corner rays (`viewCornerRays`; the world
  frame is equatorial), spacing following the zoom; equator and ecliptic as chequered graduated
  bands; the neatline's degree ladder inked by the parity of the coordinate the edge cuts.
- **Sheet**: margin, embossed plate mark with plate tone inside, laid/chain lines, toning from
  the edges, clustered foxing, paper tooth breaking thin lines.
- **Colour** is always one of seven period pigments (`pigments.wesl`), applied as transmittance,
  offset from the line by a smooth misregistration field.

### What the look hides and renames

- `ANTIQUE_HIDDEN_PASSES` (filtered in `expandFrameOrder`): cloud shells (no period globe drew
  weather), caption leader stems and the selection rings.
- Labels (`label2DDirector`, rules in `data/labels/antiqueLabelRules.ts`): period names where
  one existed (Nubecula Minor, Saturnus, Nebula in Cingulo Andromedae, Argo Navis…), modern and
  post-1690 names hidden (digits, spacecraft, voids, moons found after 1690, Lacaille's
  constellations), the selected subject always kept. A star with no period name keeps its
  modern one in the star italic (owner ruling, 2026-11-07).
- The camera's roll (`StepInputs.northUp`, `northUpArm`): held at zero in the world arm, so
  the orientation frame's pole is up (owner ruling, 2026-11-07, the crude form: no projection).

### Ornaments (compositing)

- Source art: genuine public-domain engravings (Commons PD-Art scans; provenance per sprite),
  packed by a tool into one atlas whose channels are **ink, fill, wash** (greyscale each); the
  hue comes from the instance's pigment, so ornaments stay inside the palette.
- **Sheet-anchored**: the cartouche (Frederik de Wit's, c.1680; title engraved in IM Fell by
  the packer, Latin with period V-for-U).
- **Sky-anchored**: inside the Galaxy, constellation figures over their own stars (Hevelius'
  Cetus, a Kircher dragon as Draco, an Aldrovandi serpent as Hydra) — stars print over them
  with their knock-out halos and they take a light wash; out among the galaxies, sea-chart
  fauna and a ship in the Zone of Avoidance, the band behind the galactic plane where the
  catalogs are genuinely empty (the honest *terra incognita*). Projected per frame through the
  view basis; faded out when too large or too small on screen.

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
- The look's GPU cost, measured with `npm run perf -- --gate antique` (the `stylize` slot spans
  all its passes): 3.2–3.6 ms at 1400×900 @2× on M-series (local-group, solar-system), down from
  ~9 ms before the glyphs and ornaments were scattered. The 2 ms first set here is not met; the
  open levers are merging the glyph and decor scatter passes into one MRT pass and skipping the
  limb taps off-body.
- No modern UI bleed with the look on: the app chrome takes the sheet's theme.

Where the grades stand (2026-11-07): round 1 all 5; rounds 4 to 6 all 6 from every reviewer,
so the ≥ 8 criterion is not met. What the reviewers agree caps the grade needs more than
shader tuning:

- **Star glyphs by magnitude.** Addressed (2026-11-07, route B): glyphs now come from the
  star catalogue at a fixed print-cell size, so count and class no longer follow device pixels.
  Galaxy views lose their image-detected galaxy dots until the galaxy Layer prints into the
  same row (phase 2).
- **Engraving that follows the form.** Hatching along a globe's parallels, a globe
  graticule, and water lines offset from the coast need a surface-parameter target from the
  body shaders. Saturn's ring needs its own id to be hatched lighter than the ball.
- **App chrome on the plate.** The cards, toggles and photo thumbnail still read as modern UI
  over the sheet.
- **Owner rulings.** Latin glosses for modern names, and dotted versus solid glow outlines.

## Out of scope

Sky-anchored constellation figures from Flamsteed/Bode plates (backlog item
`2026-09-14-antique-atlas-constellation-figures`, a separate pipeline); the dome rig; a second
period look (18th-c. German) — the target/step shape allows it, nothing is built for it.
