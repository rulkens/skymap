# Antique chrome kit — engraved frames, cartouches and controls for the HUD

**Goal.** Under `data-look="antique"` the HUD reads as part of the engraved sheet: engraved
frames with acanthus corners, a title cartouche astride each panel's top rule, tablet buttons,
engraved check boxes, a scale-of-miles track and an engraved thumbnail. With the look off, the
app is pixel-identical.

**Person and job.** As a planetarium presenter or visitor with `?antique` on, I need the
controls to read as part of the engraved sheet and still work as in the plain look, so that the
plate stays the subject.

**Owner rulings (2026-11-07).** The full kit; panels over the plate (no margin layout, no
canvas inset, no shader flag); acanthus corners. Owner feedback on the prototype: the title
cartouche straddles the frame's top rule, the rules stop at its edges, and the gap is made by
the generator, not by an overlay, so it holds at any width.

**Source.** The prototype `antique-ui.html` and its `PROPOSAL.md` (session scratchpad
`antique-ui/`). This plan ships the proposal's full step minus the margin layout.

## Ground preparation

None needed, because the look already switches by token: `App` stamps `data-look`, and
`styles/antique.css` re-points tokens while no component reads the look. The kit extends that
contract with image tokens. Each touched module gains `var(--hook, <today's value>)`, so
the plain look keeps its exact computed values. The generated tokens are injected by the same
`App` layout effect.

## Architecture

- **Generator** (`src/utils/antiqueChrome/`, one function per file): `engravedFrameLayout`,
  `engravedFrameSvg`, `engravedEdgeSvg`, `acanthusCornerSvg`, `cartoucheSvg`, `tabletSvg`,
  `checkBoxSvg`, `scaleTrackSvg`, `scalePointerSvg`, `hatchTileSvg`, `svgDocument`,
  `svgNumber`, `svgDataUrl`, and `antiqueChromeCss`. `antiqueChromeCss` assembles every image
  token as one `:root[data-look='antique'] { … }` rule.
- **Constants** in `src/data/ui/antiqueChrome.ts`: one fixed parameter set, plus ink, ground and
  wash colours. The live knobs stay in the prototype (`leanness.md`). Only the acanthus corner
  ships; strapwork and fleuron stay in the prototype.
- **Types** in `src/@types/ui/antiqueChrome/`: `EngravedFrameParams`, `EngravedFrameLayout`,
  `EngravedEdgeTile`, `SliceImage`.
- **Placement tokens** in `styles/antique.css`: the static half, for example the title row's
  margins derived from `--frame-slice` and `--frame-border`.
- **The open-top frame.** `engravedFrameSvg(…, openTop: true)` clips out the top edge between
  the corner slices. The panel's title row spans corner slice to corner slice: `::before`, the
  title button with the cartouche as its 3-slice `border-image`, then `::after`. The two
  pseudo-elements are `flex: 1` strips of `engravedEdgeSvg`'s tile, repeated with `round`. So
  the gap in the rules is always the cartouche's width. The edge tile starts on the ink cell
  the corner's ladder phase expects.

## Tasks

### Task 1: Generator core, the framed Panel and the token injection

**Files:** `src/@types/ui/antiqueChrome/{EngravedFrameParams,EngravedFrameLayout,EngravedEdgeTile,SliceImage}.d.ts`,
`src/utils/antiqueChrome/{svgNumber,svgDocument,svgDataUrl,engravedFrameLayout,engravedFrameSvg,engravedEdgeSvg,acanthusCornerSvg,cartoucheSvg,antiqueChromeCss}.ts`,
`src/data/ui/antiqueChrome.ts`, `src/components/common/Panel/Panel.module.css`,
`src/components/App/{App.tsx,App.module.css}`, `src/styles/antique.css`,
`tests/utils/antiqueChrome/{engravedFrameLayout,engravedFrameSvg}.test.ts`

```ts
engravedFrameLayout(p: EngravedFrameParams): EngravedFrameLayout
engravedFrameSvg(p: EngravedFrameParams, ink: string, openTop: boolean): SliceImage
engravedEdgeSvg(p: EngravedFrameParams, ink: string): EngravedEdgeTile
cartoucheSvg(height: number, ink: string, ground: string): SliceImage
antiqueChromeCss(): string
```

- [x] Test `lands the slice line a whole number of ladder cells past the band, so edges start on ink`.
- [x] Test `keeps the corner slice clear of the ornament box`.
- [x] Test `inks the top band only at even cell offsets from the slice line`.
- [x] Test `opens the top edge between the corner slices, and only there`.
- [x] Test `starts on the ink cell the frame's slice line expects, then a paper cell` (edge tile).
- [x] Panel hooks: `--frame-border`, `--frame-image`, `--framed-*`, `--panel-title-*`,
      `--panel-extra-*`, the flank pseudo-elements, a forced-colours fallback.
- [x] `App`'s look effect appends a `<style>` holding `antiqueChromeCss()` and removes it on exit.

### Task 2: The InfoCard frame and name cartouche

**Files:** `src/components/common/framedTitle.module.css` (new: the flanked row and the
cartouche, shared by Panel and CardHeader), `src/components/InfoCard/cardChrome.module.css`,
`src/components/InfoCard/InfoCard.module.css`, `src/components/InfoCard/CardHeader/{CardHeader.tsx,CardHeader.module.css}`,
`src/styles/antique.css`

The full card wears the open-top frame. CardHeader's name row moves above the eyebrow bar with
`order`, and becomes the cartouche astride the top rule, flanked like the Panel title. The card
drops by the cartouche's overhang (`--framed-overhang`) so the cartouche stays on screen. Tokens:
`--card-header-*`, `--card-headline-*`, `--card-badge-*`. The phone layout (`.compact`) resets
the framed tokens and keeps its own order. No new test: this is CSS-only and checked by the shots.

- [x] Done; the source badge becomes a subtitle line under the cartouche.

### Task 3: Engraved check box

**Files:** `src/utils/antiqueChrome/checkBoxSvg.ts`, `tests/utils/antiqueChrome/checkBoxSvg.test.ts`,
`src/components/SettingsPanel/pillToggle.module.css`, `antiqueChromeCss.ts`, `antique.css`

```ts
checkBoxSvg(checked: boolean, ink: string, wash: string, ground: string): string
```

The pill becomes a 15 px double-ruled square. On draws a saltire over a verdigris wash; off is
empty. Shape carries the state, so colour is never the only signal. Hooks: `--toggle-width`,
`--toggle-height`, `--toggle-image`, `--toggle-image-on`, `--toggle-thumb-display`.

- [x] Test `draws the saltire and the wash only when checked, so the state is a shape as well as a colour`.

### Task 4: Tablet buttons and washes

**Files:** `src/utils/antiqueChrome/tabletSvg.ts`, `src/components/common/PillButton/PillButton.module.css`,
`src/components/common/Button/Button.module.css`, `src/components/SettingsPanel/TierChip.module.css`,
`src/components/SearchTrigger/SearchTrigger.module.css`,
`src/components/InfoCard/CardHeader/CardHeader.module.css`, `antiqueChromeCss.ts`, `antique.css`

`tabletSvg(ink: string, ground: string): SliceImage` draws the incurved-corner tablet, used as a
9-slice `border-image` (`--tablet-image`) through the shared `common/tablet.module.css`. The
tablet's fill is the button's ground and paints over its background, so the states swap the
image's source to one with a wash baked in (`--tablet-source-{hover,pressed,selected}`), mixed
by `utils/color/multiplyWashHex(paper, pigment, strength)`. Text on a wash stays full ink. The
search trigger takes the title cartouche instead. No test for the tablet drawing (no logic).

- [x] Test `multiplyWashHex leaves bare paper at strength 0 and multiplies the full pigment in at 1`.

### Task 5: Scale of miles

**Files:** `src/utils/antiqueChrome/{scaleTrackSvg,scalePointerSvg}.ts`,
`tests/utils/antiqueChrome/scaleTrackSvg.test.ts`, `src/components/ScaleBar/ScaleBar.module.css`,
`src/components/SettingsPanel/SettingsPanel.module.css` (range row), `antiqueChromeCss.ts`

```ts
scaleTrackSvg(ink: string, ground: string): { svg: string; start: number; end: number } // as a type file
scalePointerSvg(ink: string, ground: string): string
```

A 3-slice track. The first unit is subdivided into quarters, as on Blaeu's scales, then whole
units follow in a two-row chequer that `round` repeats. The ScaleBar's bracket and the Settings
range track both take it; the range thumb is the lozenge pointer.

- [x] Test `repeats a two-unit chequer between the subdivided start and the end rule`
      (`start` = 1 unit, the middle slice = 2 units, `end` = the end rule).

### Task 6: Engraved thumbnail

**Files:** `src/components/EngravingFilter/{EngravingFilter.tsx,EngravingFilter.module.css}`,
`src/utils/antiqueChrome/{hatchTileSvg,svgDataUri}.ts`, `tests/components/App/App.antiqueLook.test.tsx`,
`src/components/App/App.tsx`, `antique.css`

`EngravingFilter` is a zero-size `<svg>` holding `#antique-engrave`, the prototype's
tone-width hatch filter. `App` mounts it only while the look is on. `antique.css` sets
`--thumbnail-filter: url(#antique-engrave)` and drops the multiply blend. The hatch tiles are
SVG linear gradients repeated at a fixed pitch, so no canvas is needed.

- [x] Test (in `tests/components/App/App.antiqueLook.test.tsx`) `injects the chrome tokens and the
      engraving filter while the look is on, and removes them after`; the filter id is read from
      `antique.css`.

### Task 7: Accessibility and colour contract

**Files:** `antique.css`, `tests/styles/antiqueChromeColours.test.ts`

- A 2 px rubric focus ring (`--focus-ring-width`) in every touched module.
- Each touched module has a forced-colours fallback (`border-image: none`) and a
  reduced-motion branch.
- [x] Test `bakes antique.css's ink and panel paper into the generated SVGs`: read `antique.css`,
      parse `--antique-ink` and `--antique-slip`, and compare them with `ANTIQUE_CHROME_INK` and
      `ANTIQUE_CHROME_GROUND`.

## Definition of Done

**Deliverables:** the generator files above; the framed Panel and InfoCard; engraved check
boxes, tablet buttons, the scale of miles and the engraved thumbnail, all under
`data-look="antique"` only.

**Smoke behaviours** (`?antique#focus=body-earth`, 1728 and 400 wide):

- Settings, Navigation and the InfoCard each wear an engraved frame with acanthus corners. The
  title cartouche sits astride the top rule, and the rules stop at its edges at every panel
  width.
- Folding Settings keeps the cartouche whole. Unfolding brings the body back. The chevron
  rotates, and does not with reduced motion.
- Layer check boxes show a saltire when on and an empty box when off. Space toggles one, and
  the focus ring is a 2 px rubric outline that is not clipped.
- Top-bar buttons and the search trigger are tablets. Hover adds a wash, and the label stays
  full ink.
- The scale bar is a scale of miles, and the Settings range sliders run on the same track.
- The InfoCard thumbnail is hatched in ink on the panel's paper.
- With the look off (`#focus=body-earth`), a shot matches the pre-change shot.

**Deferred:**

- The margin layout, the canvas inset and the shader "sheet continues" flag (ruled out).
- Keeping the plate's title cartouche clear of the panels, which needs the decor pass to know
  the panel rects (owner ruling).
- Strapwork and fleuron corners.
- Edge ornaments (shell, tablet) on the bottom rule.
- The lozenge divider rule.
