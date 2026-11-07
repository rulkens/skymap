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

### Task 13: Place names on the globe (owner: "so places actually have names")
**Files:** `src/data/labels/{antiqueEarthPlaces,antiqueAreaLettering,antiqueEarthPlaceReveal,antiqueLabelStyle}.ts`,
`src/@types/rendering/AntiqueEarthPlace.d.ts`, `src/layers/body/labels/present/produceAntiqueEarthPlaces.ts`,
`src/layers/body/{layer.ts,labels/data/bodyCaptionRows.ts}`, `src/utils/labels/antiqueLabel.ts`, `label2DDirector.ts`
- [x] Thirteen period names: seven lands in spaced capitals, six seas in IM Fell italic, at 16 px under the planets' 20 px.
- [x] A body-Layer screen-label row under `label:body`; it returns before any work with the look off.
- [x] Shown when the globe is 200–250 px or more across, the name's box fits inside the rim, and the anchor is in daylight or twilight.
- [x] A name carries Earth as subject (focus emphasis) but is never set as Earth's title; tests for the producer, the cut and the director.

### Task 14: Engraved bodies (recipe: the five-round offline model, round 5)
**Files:** `src/services/gpu/shaders/antiqueLook/{engraving,fragment,plateBodies,landBlur}.wesl`,
`src/services/gpu/passes/antiqueLook/{antiquePlateBodies,antiqueLook,createAntiqueLookGpu,antiqueLookTargetRows}.ts`,
`src/utils/gpu/antiqueLook/{antiquePlateBody,packAntiquePlateBodies}.ts`, `src/data/rendering/antiquePlateBodies.ts`,
`src/@types/rendering/{AntiquePlateBody,AntiquePlateRing}.d.ts`
- [x] `PlateBodies` uniform: up to four of the widest resolved globes plus Earth, from `ctx` body states at the drawn (inner-bound) radius; no Layer contract change; packing tested against the WGSL struct.
- [x] Burin hatching on four widths, rank-ordered arrival, bowed half-way toward the globe; 27° second set only past tone 0.8; reflected light on the night limb.
- [x] Saturn's ring as paper: C, B, Cassini and A ellipses plus the dotted C hairline; the ball's shadow hatched along the ring, the ring's shadow on the ball one solid stroke.
- [x] Water lines from a probit of the land share blurred in two quarter-res passes (run only under Earth's land map); land and sea washes only on a record flagged Earth, so Saturn's yellow fringe is gone.
- [x] No record within 1.02× a body's highest peak, so surface views (Jezero) keep the plain path and their real horizon.

Open for the owner: reflected light lightens Earth's night side near the limb (the period convention).

### Task 15: Engraved galaxies (recipe: the galaxy spike, RECIPE.md Part 2)
**Files:** `src/services/gpu/shaders/antiqueLook/{nebula,skyFloor,structureGlow,glow,reduce,engraving,fragment}.wesl`,
`src/services/gpu/passes/antiqueLook/{antiqueLook,createAntiqueLookGpu,antiqueLookTargetRows}.ts`,
`src/data/rendering/antiqueLook.ts`, `src/@types/rendering/AntiqueLookGpu.d.ts`
- [x] Galaxies cut as swelling iso-lines on their isophotes (octave-nested, integer lines so nothing pops), tone stipple in the faint disc, a dotted outline at the field-adaptive level, a solid core, dust lanes left as paper, smalt/gamboge wash.
- [x] A quarter-res nebula pass (Lxs, Lsm, line field, lane reference) and a one-workgroup compute for the field floor: the 30th percentile of the glow's sky texels, read by the plate in the same submit; a planet's day sky is its own field and stays paper.
- [x] Iso-lines only where the glow's isophotes are coherent (structure tensor per 4×4 block); a star field's speckle (the band from Sgr A*) gets tone stipple.
- [x] Structure markers moved to their own half-res row; their eroded low band keeps the old Dutch outline colour and dotted contour, so no cluster or void disc is engraved. The old print-glow contours stay for light the galaxy gate rejects.
- [x] Deviations from the recipe, measured on the app's real frames: reduce floor factor 1.0 (not 1.15), line field Lxh 2 cells, Lsm 2.2, unsharp 1.5 (not 1.3, 1.6, 2.5): the recipe's values left M87 as fingerprints.

Open for the owner: the Sombrero and the Clouds still don't read (a content gap, per the spike); dense field clumps near M51 print as small stippled patches.

### Task 16: Mars and Moon in the look (owner approval 2026-11-07; rulings "own shaders", "Earth has water edges, Mars and Moon don't")
**Files:** `src/services/gpu/shaders/antiqueLook/{cover,reduce,glyphs,fragment,plateBodies,landBlur,engraving}.wesl`,
`src/services/gpu/shaders/antiqueLook/bodies/{earth,mars,moon}.wesl`, `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl`,
`src/layers/body/spheres/{passes/bodyAlbedoMaskPass,present/texturedBodyUniforms,present/ringRatios}.ts`,
`src/data/rendering/{antiqueAlbedoMask,antiquePlateBodies}.ts`, `src/@types/rendering/AntiqueBodyPrint.d.ts`
- [x] Inside an atmosphere the look reads body coverage from foreground:0's depth, not its alpha (the day sky's alpha is ~1), via a uniform flag; surface views keep rulings, stars and horizon.
- [x] A depth second-difference contour inks occluding edges inside an atmosphere: the rover, crater rims, skylines.
- [x] `body-albedo-mask` draws Mars's albedo (a lightness ramp about mean − 0.7σ of its map) into the land row on its `surfaceMask` line; the `landness()` colour guess is gone; land is read with a body-masked bilinear, so no false coast rings a limb.
- [x] Per-body print modules behind a record code (`ANTIQUE_BODY_PRINTS`, parity-tested): Earth's coasts and water moved to `bodies/earth.wesl`; Mars's dark markings are a level burin family of their own plus a red-lead wash, with no coast or water; the Moon is a stub (its convention belongs to the Moon lead).

Open: the depth cover holds only the last body row's depth, so a second globe in a surface sky (the Moon from Earth's ground) reads as sky.

### Task 17: The Milky Way from outside, named (owner brief 2026-11-07)
**Files:** `src/data/labels/{antiqueMilkyWayNames,antiqueMilkyWayNameReveal,antiqueAreaLettering,antiqueLabelStyle,antiqueEarthPlaceReveal}.ts`,
`src/@types/rendering/{AntiqueMilkyWayName,AntiqueLettering}.d.ts`, `src/utils/labels/antiqueLabel.ts`,
`src/layers/milkyWay/{layer.ts,card/present/produceAntiqueMilkyWayNames.ts,card/present/produceMilkyWayLabel.ts}`,
`src/layers/milkyWay/card/utils/{milkyWayDiscPoint,antiqueMilkyWayNameAlpha}.ts`, `tools/antique/look/views.json`
- [x] Nine period names on the generated disc: Brachium Persei, Sagittarii, Scuti-Centauri, Normae, Exterius on the generator's own arm ridges (lopsided bend as the sprites draw it), Ramus Orionis and Sol hic at fixed places, Trabs and Nucleus by the bar and bulge; a test holds the arm order against the Sun–centre line crossings.
- [x] A new `spacedItalic` cut (IM Fell italic capitals, 0.3 em tracking, V for U), set as area lettering: centred, never a title.
- [x] A second milkyWay screen-label row under `label:milkyWay`; names fade in with the disc's size on screen (420–560 px), the eye outside the disc (20–26 kpc) and the view off edge-on (face cosine 0.3–0.5); no Layer contract change. "You are here" yields to Sol hic while the names show.
- [x] Lookbench views `mw-face` (32 kpc), `mw-oblique` (35°, 40 kpc) and `mw-edge` (50 kpc).

Owner ruling 2026-11-07: keep the generic galaxy engraving with these names; the offline arm-steered engraving is not ported. Open: the names are straight (no text-on-path).

### Task 18: The cosmic web charted (owner pick: variant D, spines + isobaths; void names cosmos-only)
**Files:** `src/data/rendering/antiqueLook.ts`, `src/services/gpu/shaders/antiqueLook/fragment.wesl`,
`src/services/gpu/shaders/filaments/*.wesl`, `src/layers/cosmicWebFilaments/filaments/{passes,render}/*`,
`src/services/gpu/passes/antiqueLook/{antiqueLook,createAntiqueLookGpu}.ts`, `src/data/labels/antiqueLabelRules.ts`,
`tools/antique/look/views.json`
- [x] `cosmic-web-filaments` moved onto the lines row (`ANTIQUE_MOVED_PASSES`): the print's 4×4 reduce no longer drops them.
- [x] Isobaths: the density raymarch's own row charted by a `web.wesl` pre-pass into `star-ink`'s spare b/a as log₂ contours (outermost dotted), walls scattered, voids left paper and lifting field galaxies; the upsample hidden, so the galaxy engraving no longer inks the density; drawn only in the cosmos regime with the density live.
- [ ] Spines: the filament width and ink follow density on the plate; the faint tendrils lift. PARKED: the shipped `filaments.bin` carries density 0 at every vertex (no DisPerSE field values), so the ramp has nothing to read; needs a filament rebuild first.
- [x] Latin names for the web (Laniakea, Perseus-Pisces, Virgo, Coma Berenices, Attractor Magnus, Murus Hydrae); VACVVM LOCALE and VACVVM SCVLPTORIS only past `ANTIQUE_REGIME_MPC[1]`.
- [ ] A cluster glyph from the structures row.
- [x] The Zone of Avoidance ruled where most of a sight line within the survey runs through 2MRS's dust wedge (`web.wesl`), so it no longer reads as a void. Its name on the plate is still open.

### Task 19: Mars terrain engraved, treatment (d) (owner rulings 2026-11-07: shadow hachures, halo, stipple, thinning; Hevelius plate light from orbit)
**Files:** `src/services/gpu/shaders/antiqueLook/{relief,engraving,fragment}.wesl`, `src/services/gpu/shaders/antiqueLook/bodies/mars.wesl`,
`src/data/rendering/{antiqueRelief,antiqueLook}.ts`, `src/services/gpu/passes/antiqueLook/{antiqueLook,antiqueReliefInput,antiqueLookTargetRows,createAntiqueLookGpu}.ts`,
`src/utils/gpu/antiqueLook/packAntiqueRelief.ts`, `src/@types/rendering/{AntiqueReliefInput,AntiqueLook,AntiqueLookGpu}.d.ts`, `src/services/engine/frame/executeFrame.ts`
- [x] A look-only relief pass reads foreground:0's depth through the row that wrote it (the stylize step now gets `sampledDepthFor('foreground:0')`), and writes per pixel the screen fall line, a noise pinned to the ground (anchor cells as integers, so f32 never carries the body radius) and the stroke share; the depth normal is exaggerated ×2 on the ground, ×3 from orbit.
- [x] Plate light: from orbit the real Sun's azimuth at 18° over each point's horizon; the ground keeps the real Sun (blend over 8–25 km altitude).
- [x] The plate's Mars module cuts hachures by line-integral convolution of that noise along the fall line (12 taps each way, stopping at halos), a contour-wise second set in the deepest shade, stipple on the flats from the plain render's darkness, dotted at the ground noise's peaks; lines thin with range over eye height; a paper halo behind every nearer profile.
- [x] The albedo marking and the generic light hatching yield to the relief on the engraved ground; the land blur runs only under an Earth record.

### Task 20: The ruling follows the frame (owner rulings 2026-11-07: ecliptic default as Hevelius; Earth numbered from the Pico de Teide)
**Files:** `src/services/gpu/shaders/antiqueLook/{graticule,fragment,io}.wesl`, `src/data/rendering/antiqueRulings.ts`,
`src/services/gpu/passes/antiqueLook/antiquePlateRulings.ts`, `src/utils/gpu/antiqueLook/{rulingLonLat,antiqueGraticuleSteps,antiqueGlobeCastable,antiqueGlobeCoverage,placeAntiqueNumerals,formatAntiqueDegrees,setAntiqueDigits,packAntiqueUniforms}.ts`,
`src/@types/rendering/{AntiqueRulingFrame,AntiqueRulingStep,AntiquePlateRulings}.d.ts`
- [x] One `AntiqueRulingFrame` value (axes, prime-meridian offset, optional globe centre, net ink, steps) drives the shader's rulings and ladder and the border numerals; no per-frame code paths.
- [x] The sky's frame follows the orientation setting: ecliptic by default, equatorial, galactic.
- [x] A globe under the view (Earth, the one listed in `ANTIQUE_GLOBE_RULINGS`) rules its own body-fixed lat/lon net, faded in by its share of the plate and the ground scale; the border reads the globe where the band lies over it. Earth's longitude counts from the Pico de Teide.
- [x] Numerals in degrees and minutes (° and ’ added to the IM Fell glyph sheet).
- [x] A side number runs inward from the inner rule, shrunk to fit the plate's numeral strip (`ANTIQUE_SIDE_NUMERAL_REACH_UNITS` = the shader's `NUMERAL_SIDE_REACH`), so "52°40’" is never clipped.

### Task 21: Earth up close, c.1690 (owner: "earth when zoomed in should have more detail, i.e. borders, cities, probably within that time period")
**Files:** `tools/antique/earth/**` (bake: `npm run build-antique-earth` → `public/antique/earth-1690.bin`), `tools/fetch/{fetchNaturalEarth,fetchOhm1690}.ts`, `data/raw/{naturalearth,ohm}/`, `src/data/labels/antiqueEarthRealms.ts`
- [x] The map file's geography row, town signs and period names on the globe (7efa5150d, ea90f2cf5).
- [x] Rivers from Natural Earth (canals after 1690 dropped, chained source to mouth, tapered) and molehills from ETOPO relief, nested by reveal level.
- [ ] Realms of 1690 from Natural Earth admin-1, cut along OpenHistoricalMap lines; dotted borders by rank, pigments no neighbour shares.
- [ ] Earth labels cut by their text rects, not their anchors.
- [ ] Five-reviewer loop (cartographer, map designer, historian, art critic, fidelity) to ≥ 8.

### Task 22: Paper knock-out behind lettering (owner-approved debt fix)
**Files:** `src/services/gpu/shaders/antiqueLook/{captionHalo,fragment}.wesl`
- [ ] A caption's halo is round (eight directions, two radii) and clears the wash as well as the ink; bare paper skips the taps.

### Task 23: Plate textures packed into arrays (owner GO 2026-11-07)
**Files:** `src/data/rendering/antiqueLook.ts`, `src/services/gpu/passes/antiqueLook/{antiqueLook,antiqueLookTargetRows,createAntiqueLookGpu}.ts`,
`src/services/gpu/shaders/antiqueLook/fragment.wesl`, `tests/services/gpu/shaders/antiquePlateBindings.parity.test.ts`
- [x] The nine rows the look writes and the plate reads become layers of `antique-full` (rgba8), `antique-quarter` and `antique-low` (rgba16f): the plate samples 10 textures, budget 12, a new row is a layer (62ece682d).

### Task 24: The chrome weathered (owner: "too clean … do something with its background")
**Files:** `src/utils/antiqueChrome/{inkWearSvg,paperTileSvg,paperNoiseFilter,foxingSvg,tabletSvg,cartoucheSvg,checkBoxSvg,antiqueChromeCss}.ts`,
`src/data/ui/antiqueChrome.ts`, `src/styles/antique.css`, the `--sheet-ground` hook in Panel, cardChrome, MobileSheet and Dock
- [x] Slips on laid paper (fibre, mottle, chain and wire lines, edge toning, foxing and a tide-line varied by panel size); ink thins and breaks, wobbles off the repeating edges; washes laid by hand (40df88d68).

### Task 25: Stars on their own path (owner: "they need their own way to reach the screen, so they read as stars")
**Files:** `src/data/rendering/antiqueLook.ts`, `src/services/gpu/shaders/antiqueLook/{glyphs,engraving}.wesl`,
`tests/services/engine/frame/expandFrameOrder.test.ts`, `tests/services/gpu/shaders/antiqueStarClass.test.ts`
- [x] Resolved stars reach the plate only as catalogue glyphs: `star-points` and `star-catalog` are hidden under the look, so bloom and the glow filters no longer ring them; the aggregate keeps its hdr line (c7e829f2f).
- [x] Seven glyph classes by whole magnitude, with wedge rays that survive at 1x (r7 cartographer) (c7e829f2f).

### Task 26: A debug section to tune the look live (owner: "make a debug section for the antique look")
**Files:** `src/components/DebugPanel/AntiqueTuningSection/`, `src/data/rendering/antiqueTuning{,SliderFields}.ts`, `antiqueSlice.ts`,
`io.wesl` (`tune`, `tint`, `hidden`), `fragment.wesl` (`HIDE_*`, `rowOn`)
- [x] Hatch spacing and angle, sky wash, ink density, relief light, paper tint, sky ruling frame, a switch per plate row; Reset, and Copy of the moved knobs; defaults print the plate as before (653c0f990).

### Task 27: The Moon named as Riccioli named it (recipe: moon/names/RECIPE.md)
**Files:** `src/data/labels/{antiqueMoonPlaces,antiqueMoonPlaceReveal,antiquePlaceLettering,antiqueLabelStyle}.ts`,
`src/layers/body/labels/{present/produceAntiqueMoonPlaces,present/antiqueBodyView,utils/*}.ts`, `src/utils/labels/antiqueLabel.ts`
- [x] 16 maria, 5 Terrae and 69 craters in the 1651 spelling; seas fitted across their extent as seen and moved inward off the limb, craters on the floor or right of the rim (left at the limb or terminator), one rank ladder for reveal and declutter, none at night; Earth's box estimate shares the measured advance.
- Open: Procellarum is culled by Aristarchus at full Moon (rank 5 beats 6 under the 8 px rect pad); Earth keeps its own producer (a generic body producer would need a callback spec for little shared code).

## Definition of Done

**Deliverables:** the `stylize` FRAME_ORDER line and `antiqueLook` pass; the `antique` settings
slice with its Display switch and `?antique` gate; `public/antique/{paper.webp,stains.webp,ornaments.png}`;
`tools/antique/packOrnaments.ts` (`npm run pack-ornaments`) and `tools/antique/paper/`; the period
label rules; `styles/antique.css`.

**Observable behaviours (smoke):**
- `?antique#focus=body-earth`: cream laid paper with plate mark; numbered chequered neatline;
  ecliptic rulings running edge to edge; star glyphs by brightness with paper halos; Earth with cut
  coasts, washed land and sea, hatching only in shade, night side cross-hatched; "Terra" as the
  largest name; the cartouche top-left; the chrome as paper slips in IM Fell.
- Toggling the Display switch on and off swaps looks live, with no reload and no black frame.
- Saturn: "Saturnus" and *Saturni Satelles*; the Milky Way core as an outline line.
- Look off: identical to main; no `antique-*` target allocated, no asset fetched.
- `npm run perf -- --gate antique`: the look's `stylize` slot at the cost the spec records (~3.5 ms at 1400×900 @2×).

**Deferral boundary:** Flamsteed/Bode constellation figures for every constellation (backlog
`2026-09-14-antique-atlas-constellation-figures`); the dome rig; a second period look; true
globe-space (lat/lon) hatching, which needs a surface-parameter target from the body shaders.
