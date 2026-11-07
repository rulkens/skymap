# Antique atlas look — plan

Spec: [`2026-11-07-antique-atlas-look-design.md`](../specs/2026-11-07-antique-atlas-look-design.md).
Executed in one session with a review loop (cartographer, UI/UX map designer, historian, art
critic) driving the visual tasks; the review briefs and round summaries live in the session
scratchpad, the grades in the PR description.

## Tasks

### Task 1: Frame routing and the `stylize` step
**Files:** `src/@types/settings/AntiqueSettings.d.ts`, `src/state/settings/core/antiqueSlice.ts`,
`src/state/settings/coreSettingsSlices.ts`, `src/@types/engine/frame/{StylizeStepSpec,FrameStep,FrameStepSpec}.d.ts`,
`src/services/engine/frame/{expandFrameOrder,executeFrame,renderFrame,checkFrameOrder}.ts`,
`src/services/engine/frame/timing/maxFrameInputs.ts`, `src/data/rendering/frameSections.ts`,
`src/utils/render/{antiqueLookOn,lookTarget}.ts` · review: yes
- [x] `settings.antique.enabled`, booting from `?antique`.
- [x] `FrameInputs.antique` retargets the tone-map to `print` and the overlay lines to `overlay`; `stylize` emits only with the look on.
- [x] Test `the antique look moves every swap write to its own rows and inks them last`; test `with the look off nothing is rerouted and no stylize step runs`.

### Task 2: Target rows, GPU handle, lazy pass
**Files:** `src/services/gpu/passes/antiqueLook/{antiqueLook,antiqueLookTargetRows,createAntiqueLookGpu,loadAntiqueSheetAssets}.ts`,
`src/@types/rendering/{AntiqueLook,AntiqueLookGpu,AntiqueSheetAssets}.d.ts`, `src/services/gpu/renderTargets.ts`,
`src/services/engine/gpuHandles/gpuHandleRegistry.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`
- [x] Rows `print`, `overlay`, `antique-paper`, `-wash`, `-glow`, `-peaks`, `-stars`, `-star-ink`, `-decor`, `-decor-hue`, all `allocateWhen: antiqueLookOn`.
- [x] Passes paper, reduce, glow, peaks, then the instanced glyphs and decor scatters, then the plate; one `stylize` timing slot across them.
- [x] Pipelines, buffers and assets built on the look's first frame.

### Task 3: The plate shaders
**Files:** `src/services/gpu/shaders/antiqueLook/*.wesl`, `src/@types/rendering/{AntiqueUniformInput,AntiqueRulings}.d.ts`,
`src/utils/gpu/antiqueLook/packAntiqueUniforms.ts`, `src/utils/camera/projection/{viewBasis,viewCornerRays,projectDirToPx,rayThroughPx}.ts` · review: yes
- [x] Paper bake, quarter-res reduce (capped sky light), 1/16 glow, peak suppression (line rejection, DPR-stable reach), plate.
- [x] Sky inverted: six-class star ladder with knock-out; Dutch outline colour; boundary + one inner contour.
- [x] Bodies: terminator-parallel hatching (`terminatorHatchAngle`), shade only; coasts cut from the land share; halo; washes from smoothed light.
- [x] Rulings with one interval per plate (`antiqueGraticuleSteps`); graduated equator/ecliptic; neatline ladder square to the edge; embossed plate mark.
- [x] Captions inked from their fill on a paper halo.

### Task 4: Ornaments and lettering
**Files:** `src/data/rendering/{antiqueOrnaments,antiqueOrnamentAtlas}.ts`, `src/@types/rendering/AntiqueOrnament*.d.ts`,
`src/utils/gpu/antiqueLook/{placeAntiqueOrnaments,packAntiqueOrnaments,placeAntiqueNumerals,setAntiqueDigits,packAntiqueGlyphs,buildAntiqueGlyphSheet,fetchAntiqueBitmap}.ts`,
`src/utils/render/{onScreenShare,offScreen}.ts`, `src/utils/camera/projection/screenNorthAngle.ts`,
`tools/antique/packOrnaments.ts`, `data/antique/`, `public/antique/` · review: yes
- [x] Sheet and sky anchors, regime split, mirrored figures, off-plate fade.
- [x] Test `puts a sky row straight ahead at the canvas centre, upright, at its angular width` (+ north-left turn, east-left, regime, mirror, off-plate, too-small).
- [x] Border numbered at the ruling crossings in IM Fell.
- [x] Re-pack with the c.1690 Dutch cartouche / ship / whale once sourced (round 3).

### Task 5: Paper
**Files:** `tools/antique/paper/`, `public/antique/{paper,stains}.webp`, `src/services/gpu/shaders/antiqueLook/paperBake.wesl`
- [x] Tile quilted from CC0 1687 laid-paper margins; stain mask; decoded unpremultiplied.

### Task 6: Labels for the period
**Files:** `src/data/labels/{antiqueLabelRules,antiqueLabelStyle}.ts`, `src/utils/labels/antiqueLabel.ts`,
`src/services/engine/subsystems/label2DDirector.ts` · review: yes
- [x] Period names, modern names hidden, subject kept and largest, no leader stems, close placement.

### Task 7: Chrome theme and toggle
**Files:** `src/styles/{antique,tokens,global}.css`, component CSS modules, `src/components/App/App.tsx`,
the Display section container
- [x] "Antique atlas" switch with its interaction test; `data-look="antique"` theme; IM Fell; paper slips.

### Task 8: Docs and harness
**Files:** `packages/website/src/data/docs{Settings,UrlParams,Commands}.ts`, `tools/perf/{measurePerf.ts,README.md}`
- [x] The switch, `?antique` and `pack-ornaments` documented; `npm run perf -- --gate antique`.

### Task 9: Fidelity fixes (owner ruling 2026-11-07, after a 4/10 fidelity review)
**Files:** body earth pass + shader, `shaders/antiqueLook/{reduce,fragment}.wesl`, `tools/antique/look/`
- [x] Earth's land share from its ocean mask (written by the Earth pass while the look is on), not from colour (0e0455d63).
- [x] Glows keep full brightness (block mean held near its dimmest texel, no per-texel cap); stipple follows the quarter-res band with relief (9cc398c58).
- [x] `lookbench`: plain/antique pairs of pinned views, sheets, compares, crops (9cc398c58).
- [x] Hevelius figures print the scan's own lines: cetus, dragon, seaSerpent packed at 1024 px with a `[0.1, 0.8]` push, the atlas mipped, coverage turned into density in `decor.wesl`.

### Task 10: Star glyphs from the catalogue (route B; ruling 2026-11-07, rides this feature)
**Files:** `starCatalog/vertex.wesl` (prep: `leafRecord(ii)`), star Layer print passes, `antiqueLookTargetRows.ts`, `frameSections.ts`, `shaders/antiqueLook/{printPoint,glyphs,reduce}.wesl`; delete `peaks.wesl`, the `peaks`/`stars` targets, `STAR_FLOOR`
**Contract:**
```ts
export const ANTIQUE_PRINT_CELL_UNITS = 4;   // one print-point texel per 4 print units
// target 'antique-print-points': rgba16float + depth32float, allocateWhen antiqueLookOn
// texel: xy NDC, z apparent magnitude, w 1 = a star; reversed-Z depth so the brightest per cell wins
```
- [ ] Prep: `leafRecord(ii)` shared by the visual, pick and print stages; test they decode alike.
- [ ] `star-points-print` (seeded, own instance buffer) and `star-catalog-print` (leaf stream) draw m ≤ 5.75.
- [ ] Glyph class = 5 − round(m); stars behind a body never print; peak detection deleted.
- [ ] Test: apparent magnitude → class; Fomalhaut, Polaris, Dubhe are class ≥ 3 in `north`/`earth` at 1× and 2× (lookbench).
- [ ] Phase 2: the galaxy Layer writes the same target, so galaxy views keep their dots.

### Task 11: North-up and names (rulings 2026-11-07)
- [x] Camera roll held at zero (celestial north up) while the look is on.
- [x] Modern names shown where no period name exists; period names kept where they do.

### Task 12: Constellation lines engraved
- [x] With the look on, the constellation pass draws into its own target; the plate inks it as a fine rule behind bodies, stars knocked out of it.

## Definition of Done

**Deliverables:** the `stylize` FRAME_ORDER line and `antiqueLook` pass; the `antique` settings
slice with its Display switch and `?antique` gate; `public/antique/{paper.webp,stains.webp,ornaments.png}`;
`tools/antique/packOrnaments.ts` (`npm run pack-ornaments`) and `tools/antique/paper/`; the period
label rules; `styles/antique.css`.

**Observable behaviours (smoke):**
- `?antique#focus=body-earth`: cream laid paper with plate mark; numbered chequered neatline;
  RA/Dec rulings running edge to edge; star glyphs by brightness with paper halos; Earth with cut
  coasts, washed land and sea, hatching only in shade, night side cross-hatched; "Terra" as the
  largest name; the cartouche top-left; the chrome as paper slips in IM Fell.
- Toggling the Display switch on and off swaps looks live, with no reload and no black frame.
- Saturn: "Saturnus" and *Saturni Satelles*; the Milky Way core as an outline line.
- Look off: identical to main; no `antique-*` target allocated, no asset fetched.
- `npm run perf -- --gate antique`: the look's `stylize` slot at the cost the spec records (~3.5 ms at 1400×900 @2×).

**Deferral boundary:** Flamsteed/Bode constellation figures for every constellation (backlog
`2026-09-14-antique-atlas-constellation-figures`); the dome rig; a second period look; true
globe-space (lat/lon) hatching, which needs a surface-parameter target from the body shaders.
