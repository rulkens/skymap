# The antique look in the dome — design

Status: spec, 2026-11-08, on `worktree-antique-map-spike`. Parent:
[`2026-11-07-antique-atlas-look-design.md`](2026-11-07-antique-atlas-look-design.md), which put the dome out
of scope. Design study and offline prototype (2026-11-07, shots `dome-master.png` and
`planisphere-cellarius.png` seen by the owner): session scratchpad `dome-antique/DESIGN.md`. Where this
spec and that study disagree, this spec wins: the ground prep found five things the study missed (see
"Ground preparation").

## Why

The dome is where skymap meets an audience: the desktop app's dome install (`/?dome&remote`, see
`docs/DESKTOP.md`) projects the sky onto a planetarium. A 1690 star chart filling that dome is the
look's strongest teaching moment ("this is how the sky was charted") and today it is impossible:
`antiqueLookOn` is `enabled && viewRig === 'mono'`. The rule from the parent holds: it stays a chart of
the real data, every glyph from the catalogue the frame draws.

## Goal

With `?dome&antique`, the dome master shows the antique plate: inverted paper sky, catalogue star
glyphs, the wash and its outline band, engraved bodies, the RA/Dec rulings and the parent's ornaments,
all registered with the fisheye sky, framed by a ring inside the rim. Mono frames do not change.

## Non-goals

- **Per-face stylizing.** Every feature the look draws is screen-space (hairlines, glyph sizes, grain,
  hatch phase). Per face it would cost 5× the pixels and bend at the seams. Rejected in the study, §1.
- **The print planisphere** (a fisheye sky inside a rectangular sheet with Cellarius corners, roundels,
  side compartments; the study's §3). Parked: no output needs it yet (see Delivery, "Parked").
- **Pixel floors in output pixels** (star glow floor, sprite clamp, ring band, constellation width:
  the other half of `docs/backlog/2026-09-23-dome-output-space-overlays.md`). They affect the plain
  dome as much, and this feature does not need them.
- **4K masters.** The first ship size is a 2K-class disc (see Budget).

## Architecture

### One rule: the dome hands the look mono-shaped inputs

The look runs once, in `STYLIZE`, on the output image. Everything it reads must therefore already be in
output pixels, as it is in mono. The dome breaks that for every row a `SCENE` pass writes: those run per
face, so after the face loop each holds the last face (top) in that face's pinhole frame. The study saw
two such inputs; nine reach the output in the code today.

| Row the look reads | Written by | Content | How the dome brings it to the output |
|---|---|---|---|
| `hdr` → `print` | `SCENE` | scene light | already: `dome-cube` + `DOME_RESAMPLE`, then `POST` tone-maps into `print` |
| `foreground:0` colour + depth, `antique-land` | `SCENE` | bodies, land share | read only by the per-view passes below; never cross |
| `mask` layer of `antique-full` | mask pass | cover, land, mapped, limb ink | gather, `nearest` |
| `antique-relief` | Moon pass / relief pass | ground relief | gather, `linear` |
| `antique-moon` | `moon-print` | maria, rims | gather, `linear` |
| `antique-geography` | `earth-antique-map` | realm code, borders, ink | gather, `nearest` (r is a category) |
| `antique-lines` | moved passes | constellations, trails, filaments | gather, `linear` |
| `antique-structures` | moved passes | marker rings, half res | gather, `linear` |
| `cosmic-web-density` | `-print` (steady jitter, 6d2ade9bd) | density, reduced res | gather, `linear` |
| `antique-print-points` | star and galaxy print passes | one record per print cell: NDC xy, magnitude | gather, `points` |

`print-points` cannot be filtered: its texels are records. The `points` gather gives each output cell
the brightest record among the face cells under its footprint and rewrites the record's position from
face NDC to output NDC (face basis → world ray → `pxOfRay`). That is mono's own rule, one star per
print cell, so the glyph pass needs no dome knowledge and a 4K face never prints more stars per output
area than mono.

### The look's two halves

> [!DECISION] A look pass that reads a per-view raster runs per view; everything else runs once.
> Two passes inside today's `stylize` read per-view rasters: the mask pass (`foreground:0` colour and
> depth, `antique-land`) and the relief pass (body depth, unprojected through its row's own `vp`).

Both move out of `stylize` into a new line at the end of `SCENE`, `{ kind: 'stylize-view' }`, which
expands to nothing with the look off, like `stylize`. In mono it runs once (one view) and writes what it
writes today. In the dome `SCENE_TO_DOME_CUBE` inherits it from `SCENE.steps`, so it runs per face.
`stylize` keeps reduce, glow, nebula, sky floor, land blur, glyphs, decor, web and plate.

The mask pass's limb taps are spaced by the local ratio of the view's pixel scale to the output's,
`pxPerRadAt(viewProjection, px) / pxPerRadAt(outputProjection, ray)`: 1 everywhere in mono, 1.6 to 3 on
a dome face, so the limb comes out at the plate's width after the gather.

### The gather: face rows into output rows

Per face, after the `copy` of `hdr` into `dome-cube`, one `{ kind: 'look-gather' }` line draws over the
output image. Each output pixel computes its world ray (`rayOfPx(outputProjection)`), keeps only if this
face owns that ray (the same face choice `domeResample` makes, from the shared WGSL lib), maps it into
the face (`pxOfRay(faceProjection)`) and samples the face row with the row's filter. It writes a
dome-only **output twin** of each gathered row. Once, after the face loop, `DOME_RESAMPLE` gains one
`copy` per twin back into its row. The plate, glyphs and web then bind the same rows they bind in mono.

- The filter is data on the gathered-row list (`nearest | linear | points`), not a branch per row.
- Twins are `allocateWhen: dome && antiqueLookOn`. Mono allocates nothing new; phones never see them.
- A row no face drew this frame stays cleared, so `renderedTargets.has(row)` keeps its meaning.
- The gather is a program line of the dome rig only. Mono skips it by composition, not by a branch.

> [!DECISION] `hdr` stays on `dome-cube` + `DOME_RESAMPLE`; look rows use the gather.
> The `hdr` resample's 3×3 box (#800, fireflies) needs taps across face seams, which only the 5-layer
> cube holds. Look rows take nearest or 2×2 taps that one face holds, and a single output twin costs a
> fifth of a cube. Moving `hdr` onto the gather would free most of `dome-cube` (671 MB at 4096²); that
> waits on seam evidence and is a backlog candidate, not part of this feature.

### One projection value, CPU and GPU

P1 gave the CPU `ViewProjection` (`rectilinear | fisheye`), `rayOfPx`, `pxOfRay`, `pxPerRadAt`,
`outputProjection(ctx, rig)`. The GPU gets its twin: one WGSL lib (`shaders/lib/viewProjection.wesl`)
with `rayOfPx`, `pxOfRay`, `insideProjection` and `boundaryInset` (distance in px to the image's edge:
the rect's four edges, or the disc's rim), reading one packed record. Every switch on the projection's
mode lives in that lib. Its readers: the plate (`viewRay`, `neatline`, inside-plate test, toning, foxing,
numeral skip, focus), `plateBodies.wesl`, `web.wesl` (today a private copy of the corner-ray blend),
the gather, and `domeResample` (today its own equidistant formula).

`ViewProjectionRecord`, 80 bytes, packed by one `packViewProjection(proj)`:

| Offset | Field | `rectilinear` (mode 0) | `fisheye` (mode 1) |
|---|---|---|---|
| 0 | `r0: vec4<f32>` | top-left ray xyz, 0 | basis right xyz, 0 |
| 16 | `r1: vec4<f32>` | top-right ray | basis zenith |
| 32 | `r2: vec4<f32>` | bottom-left ray | basis front |
| 48 | `r3: vec4<f32>` | bottom-right ray | centre x, y (px), radius (px), 0 |
| 64 | `mode: u32`, `size: vec2<f32>`, pad | | |

The corner rays' `w` lanes carry the eye and the density flag today (`web.wesl:6`); they move to an
`eye: vec4<f32>` of their own in `AntiqueUniforms`, so no lane means two things.

### Data flow per frame

| Step | Mono | Dome |
|---|---|---|
| `SCENE` | once, canvas | per face (`SCENE_TO_DOME_CUBE`) |
| `stylize-view` (mask, relief) | once, writes the rows directly | per face, into the face-size rows |
| `copy` `hdr` → `dome-cube` layer | — | per face |
| `look-gather` → twins | — | per face |
| `DOME_RESAMPLE`: `hdr` from the cube; twins copied back | — | once |
| `POST` (bloom, tone-map into `print`) | once | once |
| `OVERLAYS` (labels into `overlay`) | once | — until slice 2 |
| `STYLIZE` (`stylize`: reduce … plate, on `outputProjection`) | once | once |

### The look's CPU side on the projection

Everything placed per frame reads `outputProjection(ctx, state.viewRig)` and nothing else of the view:

- **Focus** (the colour's subject falloff): centred on `pxOfRay(proj, basis.forward)`. Mono: the
  screen centre, as today. Dome: the camera's forward, where the audience looks, below the zenith.
- **Terminator hatch**: one angle per frame as today, measured at the subject body,
  `pxOfRay(body + ε·sun) − pxOfRay(body)`. In mono this is today's angle when the subject is centred.
- **Units**: `unitPx = height / 900` in both rigs. On an inscribed disc 900 u spans 180°, so
  **1 u = 0.2°**: the dome's angular sizes come out of print units with no second unit system.
- **Ornaments**: sky-anchored figures and beasts already place through the pair (P1). Sheet-anchored
  ones (the cartouche) take anchors from the sheet (below); the disc has none in slice 1.

## The sheet

The sheet's shape is the projection's: a rectilinear image gets today's rect sheet, a fisheye image a
disc. No sheet-kind setting exists until a second sheet needs one (the parked print planisphere).

### The disc (slice 1)

- **Ring inside the rim**: the rect neatline's `engravedFrame` bent round the circle, outside in:
  heavy rule, chequered degree ladder, hairline, then a numeral band. Starting sizes from the study,
  in print units: ladder ≈ 5.5 u (1.1°), numerals ≈ 13 u (2.6°); tuned on a real dome.
- **What the ring counts.**

  > [!DECISION] The ring numbers the graticule lines it cuts, as the rect border does; not azimuth.
  > `placeAntiqueNumerals` walks the sheet boundary as a sampled closed path (rect: four edges; disc:
  > the circle) and sets each RA or Dec value where its line crosses. The ladder's parity reads the
  > same coordinates. One rule for both sheets and no pole fallback: the study's azimuth ring
  > degenerated near the celestial pole and needed an RA mode there.

  Which family a boundary sample numbers belongs to the path: by edge on the rect (today's split), the
  family crossing closer to perpendicular on the circle. The crowding gap thins converging lines.
- **Toning and foxing** fall off from `boundaryInset`, light on the disc (a dome is not a sheet).
- **No plate mark, no corners.** Outside the disc the master is black.
- **Cardinals and the frieze** (SEPTENTRIO … at the spring-line points toward the celestial pole; an
  engraved cloud bank, wind heads, a title cartouche ≈ 50° from the front) arrive together in slice 3:
  lettering and ornament of one band, using the Mercator wind heads already in the atlas.

### Front at the bottom

`outputProjection` puts the front at the bottom of the master (`domeBasis`), as the dome test grid
does. Everything upright (numerals, later names and frieze) turns its top toward the zenith; at the
front this is identical to mono. The planetarium must confirm front-at-bottom before anything with text
ships (the backlog item's ruling; open question 1).

## Labels in the dome (slice 2)

Names are a large part of the plate (the look inks captions from `overlay`), and the plain dome has
none either. Slice 2 takes the **label half** of `docs/backlog/2026-09-23-dome-output-space-overlays.md`,
whose open choice ("a second `FrameView` or a projection object") P1 settled: a projection object.

- The label director projects through `pxOfRay(outputProjection)` instead of `cosmoLabelProjection`'s
  pinhole, and declutters in output px. Sizes stay CSS px × dpr (64afa7984).
- Each quad turns its top toward the zenith; within ~2° of the centre it falls back to image-up. The
  rotation enters the MSDF quad pass as a per-label angle.
- The dome program gains a once-scope label section after `POST`. Labels' body occlusion samples
  `foreground:0` depth today, which in the dome holds one face; the section reads output-space cover
  instead (the gathered `mask` under the look; the plain dome needs a cover row of its own, priced in
  the slice's plan).
- When slice 2 starts, the backlog detail file is trimmed to its pixel-floor half and its index line
  reworded, in the same change.

## Ground preparation

Ran `refactor-ground` via the study's §5. Prep refactors are their own commits ahead of the feature.

### Done on this branch

| # | Commits | What changed | Mono |
|---|---|---|---|
| P1 projection pair | b20ee4c70, 3ea5c4e6e, a7d004a44 | `ViewProjection`, `rayOfPx`, `pxOfRay`, `pxPerRadAt`, `outputProjection` in `utils/camera/projection/viewProjection/`; numerals, ornaments, ruling interval, screen north and the uniform pack read one projection | pixel-identical on 9 lookbench views |
| P2 mask row | 28c72eab9 | mask pass packs `foreground:0` + land into a `mask` layer of `antique-full` (r cover, g land share, b mapped, a limb ink incl. `depthEdge`); reduce, glyphs and plate read only that; plate 10 → 9 textures | ≤ 2 LSB on body discs (rgba8 quantizing), sky identical; +20.2 MB at 2800×1800 |
| P3 `STYLIZE` | 020271707 | `stylize` leaves `OVERLAYS` for a once section ending both rigs | byte-identical; stylize 0.26–0.6 ms faster |

Corrections the prep found against the study:

- `pxPerRadAt` is analytic per arm (the tangential scale), not a finite difference; `rayOfPx` returns a
  non-unit ray; the fisheye basis is a `Mat3`.
- The mask pass needs `foreground:0` depth as well as alpha (`depthEdge` for the limb), and the relief
  pass reads per-face body depth: both are per-view passes, hence P6.
- `web.wesl` carries its own copy of the corner-ray blend: it joins the WGSL lib in P5.
- `packAntiqueUniforms` throws on a fisheye projection (deliberate gate until the shader has the mode).
- Five placement helpers still read basis and frustum: `antiquePlateRulings`, `antiqueGlobeCoverage`,
  `antiqueGlobeCastable`, `antiqueTitleGlobe`, `antiquePlateCartouche`; and `antiquePlateBodies` packs
  corner rays.
- Seven more per-face rows than the study listed (the table above).

### Still to do (each mono-neutral)

| # | Step | Visible change |
|---|---|---|
| P4 | **Inscribed-disc resample**, now required: `domeResample` reads centre and radius from the packed record of `outputProjection`, black outside the disc; dome faces render square at the disc's diameter. Today the resample maps uv straight to NDC, so any non-square dome display shows an ellipse while `outputProjection` assumes a circle: the ring and rulings would not register with the sky. Fixes the plain dome on 16:9 panels and cuts `dome-cube` by 44% there. | plain dome: circle instead of ellipse on non-square canvases |
| P5 | **Finish the port**: the five helpers and `antiquePlateBodies` onto `ViewProjection`; `viewProjection.wesl` + `ViewProjectionRecord` read by plate, `plateBodies.wesl`, `web.wesl`, `domeResample`; the eye leaves the corner rays' `w`; `packAntiqueUniforms` accepts a fisheye. Focus and hatch measured as above. | none in mono (lookbench A/B) |
| P6 | **`stylize-view`**: mask and relief passes move from `stylize` to the new line ending `SCENE` | none (same passes, same inputs) |

P4 to P6 touch the plate files the look's other streams edit (`fragment.wesl`, `antiqueLook.ts`,
`createAntiqueLookGpu.ts`): sequence them after the current review round lands.

## Budget and how it is measured

Measured with the perf harness: `npm run perf -- --gate dome --gate antique --dpr 2` (the harness
adds each gate to the boot URL; its fixed 1400×900 viewport at dpr 2 gives a 2800×1800 canvas and,
after P4, an 1800² disc: the 2K class). Reference runs: the same with `--gate dome` alone, and mono
`--gate antique`. The report's MEMORY section is the memory number (`trackGpuMemory` ledger). No
viewport flag is added until a 4K venue asks for one.

| Quantity | Budget | Estimate |
|---|---|---|
| Mono, look on or off | unchanged: same steps, same bytes | — |
| `stylize` slot, dome vs mono at the same canvas | ≤ mono + 15% (the plate early-outs outside the disc) | ≈ mono |
| `stylize-view` × 5 + `look-gather` × 5 + copy-back | ≤ 2.5 ms | mask/relief ≈ 0.2 ms per face, gather ≈ 0.1 ms per row group per face, copies ≈ 0.3 ms |
| Twins (memory) | ≤ +175 MB over the mono look at 2800×1800 | ≈ 30 B/px × 5 MP ≈ 150 MB |
| Plain-dome `dome-cube` after P4 | — | 5 × 1800² × 8 B ≈ 130 MB, down from 200 MB |

Evidence over budget halts the slice (leanness): land or park is the owner's ruling. The look already
holds ≈ 380 MB in mono; nothing here adds to it, and every new row is gated to `dome && antique`.

## Testing

Per `testing.md`: test what can break unseen; leave the rest to shots and the compiler.

- **Frame expansion** (`expandFrameOrder`, pure): dome + look emits `stylize-view` and `look-gather`
  in every face, after the face's `copy`; one copy-back per twin in `DOME_RESAMPLE`; `stylize` last.
  Dome without the look emits exactly today's steps. Mono with the look: `stylize-view` once, ending
  `SCENE`, and no gather.
- **Record layout** (keep-rule): `ViewProjectionRecord` and the grown `AntiqueUniforms` in the existing
  `antiqueLookRecords.parity.test.ts`, both modes.
- **Boundary path and numerals** (pure, hand-computed): the disc path's numerals at a pole-up pose set
  the RA meridians at hand-worked angles round the ring; at an equator-up pose Dec values appear where
  parallels cut the circle; nothing is numbered outside the projection.
- **Points gather footprint** (pure CPU twin of the tap pattern, hand-computed): an output cell at a face
  corner, where the face is 3× finer, covers every face cell under it (no dropped star).
- **Registration** is by construction (one record read by resample, plate and gather) and checked by
  shot: a lookbench dome view where the graticule's crossing lands on Polaris and a body straddles a
  face seam (limb continuous, no doubled line).
- **Mono acceptance** for P5 and P6: lookbench A/B on its nine stable views, pixel-identical.
- **Visual**: lookbench gains dome views (`?dome&antique` at a sky pose, a Moon pose, a cosmos pose);
  the fidelity reviewer compares each with the plain `?dome` shot of the same pose; the owner rules.
- Not tested: the gate predicate, twin allocation predicates, constants.

## Delivery

| Phase | Content | Estimate |
|---|---|---|
| Prep | P4, P5, P6 (commits on this branch, after review round 9) | 3–4 d |
| **Slice 1: the dome sky as a period chart** | gather + twins + copy-back, `antiqueLookOn` drops the rig, plate fisheye mode through the lib, disc sheet: ring with ladder and graticule numerals, light toning, black outside; sky ornaments; no cartouche, no names | 5–7 d |
| Slice 2: names in the dome | the backlog item's label half, both looks (above) | 3–4 d |
| Slice 3: horizon frieze | cardinals, engraved cloud bank deepest at the front, 4 or 8 wind heads with their names, title cartouche in the frieze | 3–5 d |
| Real-dome tuning | letter sizes, frieze depth, paper ground, after the front convention is confirmed | 1–2 d on site |

Slice 1 is the smallest dome worth shipping: a projectionist can show the real sky as a 1690 chart,
and every later slice adds to it without reshaping it. It ships behind the existing `?dome&antique`
gates; the desktop app needs no change.

**Parked** (backlog entries written when slice 1 lands, design kept in the study): the print
planisphere (layout util for corner boxes and side strips, roundels drawn from real heliocentric
longitudes, Cellarius putti and banners cut from uncoloured scans; ≈ 8–12 d) and export at print
resolution via the recorder; 4K masters (viewport flag, memory); `hdr` onto the gather.

## Risks

> [!RISK] Gather taps at face seams
> A tap that falls across a seam clamps to its own face. Harmless for nearest and 2×2 filters; checked
> by the seam shot. If a limb doubles there, the mask gather takes its limb from the face that owns the
> pixel only, which it already does.

> [!RISK] Limb and line widths vary across a face
> The mask pass scales its taps by the local ratio, but `antique-lines` carries face-pixel widths
> (1.6–3× finer than the output; the backlog's pixel-floor half). Constellation lines may thin toward
> face corners until that half lands.

> [!RISK] A parchment dome is a white dome
> Cross-reflection greys the darks and drowns the ink. Slice 1 ships the paper as in mono; the first
> real-dome viewing decides whether a darker ground is needed (open question 2).

> [!RISK] Hatch direction off the subject
> One hatch angle per frame, measured at the subject. A second large body far across the dome hatches
> at the subject's angle. Rare (bodies on a dome are small but for the subject); revisit if seen.

> [!RISK] Memory on the venue machine
> A 3840×2160 panel makes every canvas row 8.3 MP: the look's rows plus twins pass 800 MB before the
> scene's own. P4's square faces win back some; the perf MEMORY section on the venue's resolution is
> the check before shipping there.

> [!RISK] The look is moving
> Several streams edit the plate files now. P4–P6 wait for the review round; slice 1's plan lists its
> files so the controller can fence them.

## Open questions for the owner

1. **Front and panel shape.** Does the venue take a front-at-bottom master, on a square or a 16:9
   panel? Recommendation: build P4 either way (it fixes the plain dome on any non-square display) and
   get front-at-bottom confirmed before slice 2 ships text.
2. **Paper ground in the dome.** Recommendation: no dimming in slice 1; if the first real-dome viewing
   washes out, add one `paperGround` value to the look's tuning (not a per-rig default).
3. **Names in the dome as slice 2 of this spec**, closing the backlog item's label half for the plain
   dome too? Recommendation: yes; its plan is written after slice 1 lands.
4. **Park the print planisphere** until an export or print need exists? Recommendation: park; the
   study's `layout.js` and shots are the reference when it returns.
5. **Ship size.** Recommendation: 2K-class disc (≤ 2160 px) first; a 4K master only with a measured
   budget on the venue's GPU.
