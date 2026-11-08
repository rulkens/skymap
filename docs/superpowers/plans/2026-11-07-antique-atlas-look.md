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
- [x] Phase 2: the galaxy Layer writes the same target, so galaxy views keep their dots (60abf475a, Task 32).

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
- [x] Follow-up (owner rulings: ink vs light, 8 taps): the plain render's shade sets where ink goes and how much, the light the direction (`ground.wesl` `groundRelief`, shared with the Moon's close-ups): shade hatched in one family at the plate's hatch angle, toned from the smooth wash; only a steep landform below orbit (the mesh there is km facets) keeps fall-line hachures, cut with 8 taps each way 2.25 units apart (12 at 1.5 before, same reach); the albedo mask skipped inside the relief shell (no salmon paper).
- [x] Lines: lit crests (rims, ridges, ripples) from the wash's Hessian, crests the depth resolves from the fall field.
- [ ] Review panel to ≥ 7 (engraver, cartographer, art critic, fidelity): plateaued at 4.9 → 5.1 → 4.6 → 4.0; open: a closed rim at orbit (the mesh there is km facets, so only the wash's lit crest draws it), percy-low's lit ground near-empty.

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
- [x] Realms of 1690 from Natural Earth admin-1, cut along OpenHistoricalMap lines; dotted borders by rank, pigments no neighbour shares.
- [x] Earth labels cut by their text rects, not their anchors (bc461a73d); Amsteldam outranks every world city; glosses in brackets (5be604ad6).
- [x] Molehills fade out over detail 7..8, where the relief pass's Earth hachures fade in.
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

### Task 28: A title for every plate, hand-colouring, a hierarchy of lines (review 7 #5)
**Files:** `src/data/rendering/{antiqueTitles,antiqueTitleRegions,antiqueGlobeTitles}.ts`,
`src/utils/gpu/antiqueLook/{antiquePlateTitle,fitAntiqueTitle,drawAntiqueTitle,buildAntiqueGlyphSheet,placeAntiqueOrnaments}.ts`,
`passes/antiqueLook/antiqueTitleGlobe.ts`, `decor.wesl`, `ornaments.wesl`, `tools/antique/packOrnaments.ts`
- [x] Per-plate cartouche titles set at runtime on the lettering sheet (the cartouche sprite baked blank): the sky, the universe, the Earth (world, continent, the Seventeen Provinces, Holland by ground scale), Moon, Mars, Jupiter and Saturn; a change passes through a blank cartouche.
- [x] The cartouche takes the free corner from the view covers (desktop panels report rects, 4f36bc19b), shrinking into its corner when none is free; labels keep off panels.
- [x] Flat hand-colour washes laid inside each engraving's outline and pooling unevenly: the cartouche's frame in gamboge with a rose-madder moulding (a new pigment), figures and beasts in their row's pigment, a gamboge border band; realms stay the Earth lead's.
- [x] A constellation figure's wash follows its engraving (the atlas's level-3 mip as local ink density), so its lit parts and outline stay the plate's paper; the flat silhouette wash read as a tinted cut-out (owner: "not the same colour as the background"). Sprites were already ink-in-alpha; `figureSpritesAlpha.test.ts` guards that.
- [x] Line weights: an orbit's 5 px additive stroke eroded to a hairline at 0.45 ink (debug knob), a figure's line inked by coverage (the threshold cut regular dashes); graduated bands and the border ladder spaced by eye (±8% per boundary).
- Review (cartographer / historian / art critic): r7 5.5 → 6.5/6.5/6 → 7/7/6.5 → 7.5/7/7. Open: one cartouche engraving for every plate (a celestial and a terrestrial design need a second sprite); the cartouche may sit over a globe's land (corner choice reads panels, not content); Earth's land interior is paper outside the realm band (historian wants a light fill back; Earth lead's call); Cetus' smalt reads cool; ZoA hatch band pitch is machine-regular (cosmic-web stream); lettering sheet costs ~13 MB GPU.

### Task 29: Jupiter and its Great Red Spot (owner: "make sure the Great Red Spot is nicely rendered on Jupiter")
**Files:** `shaders/antiqueLook/bodies/jupiter.wesl`, `plateBodies.wesl` (a `spot` per record), `fragment.wesl`,
`src/data/rendering/antiquePlateBodies.ts` (`ANTIQUE_BODY_SPOTS`), `src/utils/gpu/antiqueLook/{antiquePlateBody,packAntiquePlateBodies}.ts`
- [x] Jupiter prints by its own module: belts as latitude bands weighted by line, ranked by the plain texture's zonal luma; the shade in the bands' own lines; a stipple cap past 58°; the spot as Hooke and Cassini drew it, an outlined hatched oval with a paper collar and a carmine wash, placed where the plain texture has it.
- Open: the plain texture is a fixed Cassini Dec-2000 map spun in System III, so its spot sits near 47° W (III) against the real spot's ~68° W (III) today (L2 ~100°), drifting ~118° a year apart; a date-driven placement of the texture (or the spot) needs an owner ruling. Rose madder: the box has carmine only (cartouche/wash stream asked).

### Task 30: Earth's mountains engraved up close (owner: "beautify the mountainous Earth views")
**Files:** `data/rendering/antiqueRelief.ts`, `@types/rendering/AntiqueReliefBody.d.ts`, `relief.wesl`,
`bodies/earth.wesl` (`earthRelief`), `antiqueReliefInput.ts`, `utils/gpu/antiqueLook/antiqueMapDetail.ts`, lookbench `mtn-*`
- [x] The relief pass runs per body (`ANTIQUE_RELIEF_BODIES`); the plate dispatches the ground on a print code in the flags.
- [x] Earth's depth normal differenced across one height cell (the km mesh's facets); steep facets kept as cliffs.
- [x] Shade cut as form-following lines along the height (isoLines), swelling with the shade; lit slopes and plains paper.
- [x] Hand-off with the map's molehills over `antiqueMapDetail` 7..8 (agreed with the Earth map stream).
- [ ] Panel plateaued at 5.5/5.5/5.5 (r9): patch ends cut, not tapered; no rim line; the Alps and Andes need finer heights than ETOPO z7.

### Task 31: Names ranked as a plate ranks them (review 7 #4)
**Files:** `services/engine/subsystems/label2DDirector.ts`, `utils/labels/{antiqueLabel,antiqueInkGapPx}.ts`,
`utils/math/rectMeetsCircle.ts`, `data/labels/antiqueLabelRules.ts`, `@types/rendering/AntiqueLabelRule.d.ts`, lookbench `sgra`
- [x] The subject's title outranks every name; a lifted name is judged just off its glyph's rim, where the look engraves it (Praesepe printed over MARS: the cull judged it at the plain look's lift).
- [x] A name never prints across the disc of a body nearer than its subject (a star on Jupiter's limb).
- [x] Constellation names over star names (`AntiqueLabelRule.priority`); names coined after 1690 (Avior, Peacock, Tiaki, Larawag) as Bayer's letter, the modern name as gloss.
- [x] The sgra view frames Sgr A* (its pose looked back at the Sun, the hole behind the camera).
- Open: Greek letters (τ Ceti) need Greek in the IM Fell atlas (rebake + R2 sync); a constellation name anchored off the plate or under the title is dropped, not moved along its figure; English galaxy titles (Whirlpool Galaxy) await a ruling on a Latin form or a catalogue title with the modern gloss.

### Task 32: Galaxies engraved, not contoured; route B phase 2 (review 7 #1 and #2)
**Files:** `shaders/antiqueLook/{fragment,printPoint,glyphs,glow,nebula}.wesl`, `galaxyCatalog/points/printVertex.wesl`,
`layers/galaxyCatalog/pointSprites/{passes/galaxyPointsPrintPass,render/galaxyPointPrintRenderer,render/printUniformBytesOf}.ts`,
`data/rendering/{antiqueLook,frameSections}.ts`, `executeFrame.ts`, `utils/gpu/antiqueLook/placeAntiqueOrnaments.ts`, `web.wesl`
- [x] Every point galaxy prints as a catalogue dot (`galaxy-points-print`, before the stars, forward Z); point sprites and the cosmic structure discs leave the print.
- [x] Resolved galaxies stippled by light and two-scale relief, a closing nucleus, dust lanes as a light net; iso-lines, the dotted outline and the coherence field deleted.
- [x] Stars past the naked eye print as dots to m 7.5 (the Via Lactea at Sgr A*); glyphs to m 5.75 unchanged.
- [x] Constellation figures only within 10–50 pc of the Sun; a replacing composite of an empty source clears its dest (black deep-space frames).
- [x] The Zone of Avoidance ruled lightest in the line hierarchy, its pitch and weight wandering by hand (`web.wesl`).
- [x] Panel r9 (cartographer 6, historian 6, art 5.5, fidelity 5; r7 galaxies 4.6).
- [x] Review 8 #2: the print carried bar, arms and gaps all along; the tone capped every arm and the jittered grid covered ~60% at most. `galaxyTone` (log surface brightness × relief, only the print's white closes up, tested from the shader's text) and `stippleDense` (dots thin by count, then grow); dust as whole-line hatching; nebula.wesl's lane window gone. Panel r1→r3: cartographer 6→6.5, printmaking 5.5→6, fidelity 5.5→6, a plateau.
- [x] The print keeps its highlights under the look (`printShoulder`, print only), so the bar prints as two tilted lobes over a lighter bulge (disc cap 0.55, bar 0.80–0.88 to solid); sgra, laniakea, north pixel-identical.
- [x] COSMO names (famous galaxies, the Milky Way) set off the subject's rim by the director's lift stage under the look; M51 titled "MESSIER 51 / (Whirlpool Galaxy)" (owner ruling 2026-11-08); field galaxy dots thinned within 0.05–0.12 screen heights of a resolved galaxy. Panel r1–r2: cartographer 6, printmaking 6, fidelity 6.5 (plateau).
- [ ] Open: NGC 5195 still out-inks M51 (about 1.6:1 in area, the plain about 2.5:1; the plate has no subject disc for a galaxy); the bar's two lobes merge without the lane between them; the title sits about 60 px over M51's disc (the catalogue diameter outruns the visible disc); dense-field dots cap at one per print cell; curved arm names; Latin names for other post-1690 objects.

### Task 33: The Moon engraved as Riccioli's plate (Moon review r3)
**Files:** `shaders/bodies/texturedBody/fragment.wesl` (`fsMoonPrint`, `fsMoonRelief`), `shaders/antiqueLook/{bodies/moon,fragment}.wesl`,
`layers/body/spheres/{data/antiqueMoon*,present/{pickMoonCraters,binMoonCraters},render/{packMoonPrint,texturedBodyRenderer},passes/moon*Pass}.ts`,
`layers/body/labels/{present/produceAntiqueMoonPlaces,utils/placeAntiqueCraterName}.ts`, `data/labels/antiqueMoonPlaceReveal.ts`
- [x] Crescents of tapered hachures on each ring's Sun-side wall, sided rims, an older ring yielding inside a younger; relief hachures only on the rings.
- [x] Clavius' floor chain; ~60 rings on the full disc, 40 in a close-up; Plato and Grimaldi dark-floored.
- [x] Copernicus, Keplerus and Aristarchus sit in their seas (`ANTIQUE_MOON_SEA_CRATERS`); mare holes bridged, line ends calmer.
- [x] Crater names beside the rim, sized by print weight; a wider knock-out on Moon plates; five more headline craters.
- [x] Rings binned by screen tile: the Tycho close-up at dpr 2 costs 22.8 ms a frame (23.6 before the round, 50 at its worst).
- [ ] Open: Plato, Aristarchus, Posidonius, Aristoteles and Petavius still lose the full-disc declutter (MARE IMBRIVM's name sits on Plato's ring); the terminator's flecks and moiré.

### Task 34: Ground under the close-ups (review 8 #1: "outlines on bare paper")
**Files:** `shaders/antiqueLook/{bodies/moon,ground,fragment}.wesl`, `shaders/bodies/texturedBody/fragment.wesl` (`craterRims`),
`layers/body/spheres/{data/antiqueMoonPrint,present/binMoonCraters}.ts`
- [x] The Moon's highland ground in a close-up stippled in the page's frame: denser on a slope turned from the Sun, where the albedo sinks under its surroundings and where the plain shows a shadow; seas keep their lines alone.
- [x] A rayed crater's ejecta blanket as short radial stipple to 2.4 radii (Tycho, Copernicus), the mare lines stopping raggedly at it; tiles bound the reach.
- [x] Mars ground shade measured down from the lit ground round it (brightest of the 8 taps, held to 1.3x their mean), a gravel stipple on lit flats, no crossing.
- [x] Dots vs short strokes along the relief, blind (art/history/fidelity): dots 5.5/6/5.5 (Tycho) and 6/6.5/6.5 (Copernicus) over strokes 6/5/5 and 6.5/6/6, so the dots stay; the stroke variant is deleted. The plain's dim ground (local wash luma 0.34 to 0.16) now adds up to half the stipple's range.
- [x] jz-orbit guard, blind: c5d2a1795 5.5/5/6 against its parent 3/3/3.5 (the parent left Jezero's floor bare), so the orbit keeps the denser hatching and no near-ground gate was added.
- [x] Tycho cost, scratch-worktree A/B over 6 alternating rounds (`moon-tycho` pose, 1400x900 @2x): merged total best 23.5 against 24.2 ms before 9f4aacf59, clean-round medians 23.5-24.9 against 24.2-24.6 (2 of 6 rounds per side hit 31-50 ms from contention), so the ground stipple costs nothing measurable and the view sits at the ~24 ms budget. A stroke variant measured the same (best 23.5).
- [ ] Open: craters hatched on the side the current Sun shades while the plain's albedo shows the mosaic's own shadows on the other (fidelity); Eratosthenes' dark floor carries mare lines; the historian wants an even ~10% highland floor instead of patches; Copernicus' mare ruling uniform and heavy (mare engine); rings as clean circles without floors or peaks; rover unshaded.

### Task 35: Jupiter by hand (review 8 #4: "ruled like a machine drew it")
**Files:** `shaders/antiqueLook/bodies/jupiter.wesl`, `shaders/antiqueLook/fragment.wesl` (its call), `tests/services/gpu/shaders/antiqueJupiter.parity.test.ts`
- [x] Line weight read off the plain render's own lightness per pixel (chroma-weighted, over the light across the bands), not fixed belt latitudes: belts swell, zones keep a light ruling, a belt's detail swells and thins its lines; no polar stipple.
- [x] Lines drift, taper, open and close, and bend round what stands out of their band; a small globe cut plainer (wider-set lines, near-paper zones).
- [x] Pale ovals and the darkest dark features outlined, broken; the Red Spot (not moved) a hatched core, a thin inner ring and a bold broken outline, rose madder pooling granular at the core.
- [x] Rose madder's pigment index pinned by a parity test. Panel (art/history/fidelity) 5.5/5/5.5 → 7.5/7/7, plateau at rounds 4-5. Shared `lineFamily` untouched, so Mars, Earth's mountains, the Moon and the rulings are unchanged. Cost: ~1.6 ms of `stylize` at the full-screen Red Spot close-up, dpr 2 (11.4 against 9.8 ms with the module stubbed; 11 quarter-res taps, the spot and outline work gated to where they show).
- [ ] Open: the spot still a clean ellipse (panel: one contour heavier on the shadow side; fidelity: the plain's spiral core and pale collar); festoon whorls as scattered loops, not long strokes; the southern rulings still even; the disc's belts finer than a period figure (historian wants 3-4 broad bands, an oblate profile, a hatched limb).

### Task 36: The title cartouche on a phone, in three designs (review 8 #3: "half the phone over Saturn", "mass-produced")
**Files:** `utils/gpu/antiqueLook/fitAntiqueCartouche.ts`, `passes/antiqueLook/{antiquePlateCartouche,antiqueTitleGlobe}.ts`, `utils/gpu/antiqueLook/placeAntiqueNumerals.ts`, `data/rendering/{antiqueCartouches,antiqueTitleCartouches}.ts`, `tools/antique/packOrnaments.ts`, `data/antique/sprites/{strapwork,tablet,scrollwork}.png`
- [x] Fitted to the canvas (at most 2/5 of its width), kept in its authored corner while shrinking (steps to half size) before moving, closing in on the neatline as it shrinks; clear of the open panels and, by a band's width, of the subject: the view's axis and the titled globe's limb (tan of its angular radius), which under a region's title is ground, not subject.
- [x] Three designs by kind of plate (Ortelius strapwork for sky and cosmos, de Wit scrollwork for Earth, Goos tablet for a globe), the new two cut from PD scans; a compact name-only title below 0.8 of authored size; neatline numerals the cartouche would cover or crowd are left out.
- [x] Washes stay inside the printed lines (pushed ink closed at half the silhouette's close), each enclosed part takes one pigment (no scroll cut along the accent oval); strapwork accent carmine; the strapwork's graticule gaps erased; the Moon plate keeps the cartouche's wash.
- [x] Panel on cart7 (phone 400×850 @2 + desktop; saturn, earth-europe, moon-full, laniakea): UI/UX 7, historian 7, art critic 7.
- [ ] Open: Europe desktop fits only half size above the Navigation panel (all three ask for more presence); the phone Moon tablet is small between neatline and limb; reviewers want one title scale across views and the strapwork lighter; a faint numeral ghost left of the strapwork's crest on laniakea desktop; Earth placement does not yet prefer sea.

### Task 37: Legible names (owner, 2026-11-08: "hard to read", "no anti-aliasing", "far labels a little bigger", "the selected label should animate")
**Files:** `shaders/antiqueLook/{fragment,io}.wesl`, `utils/gpu/antiqueLook/{packAntiqueUniforms,antiquePlateTune}.ts`, `data/rendering/{antiqueTuning,antiqueTuningSliderFields}.ts`, `data/labels/antiqueLabelStyle.ts`, `services/engine/subsystems/label2DDirector.ts`, `services/engine/presentation/createTitleGrowth.ts`
- [x] Captions ink the MSDF's anti-aliased coverage (the fill's luma, lifted for hairlines), not a hard alpha threshold; the rag and the paper dips reach lettering only as far as the Letter wear knob (debug board; 0 clean, 1 the old print, default 0.25).
- [x] The far sky's cuts a size up (capitals 23, roman 19, italic 21, spaced italic 19 px); placed map names keep their sizes.
- [x] A selected name grows to the title size over 220 ms and shrinks back when let go; the director's flush signature keys text, alignment and size so a reset name re-uploads.
- [x] The name slides from beside its glyph to centred over it (and back) on the same ramp: `alignX` takes a number, the share of the width left of the anchor, quantised to `titleSlideSteps` so the layout memo stays bounded. A wrong final position was not reproduced (Orion and Cetus stars off-centre and near the edge, dpr 1 and 2, phone, InfoCard open, window resized after load: centred each time); the hop was the report.

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

### Task 38: Cartouche colours inside the lines (owner, 2026-11-08: "the cartouche still has some colours that don't belong")

- [x] Measured on all three designs (desktop and phone): the sprites carry no scan colour (RGB 0 everywhere); the stray colour was each frame's wash landing on the paper 2 to 5 px past its outline, plus a lineless gamboge band round the scrollwork's field.
- [x] The packer pulls a frame's wash 1.5 px inside its outline and cuts the field's paper out to the frame's inner ink; decor.wesl keeps the brush's stray inside the wash's own outline. A guard test checks the packed atlas.
- [x] The strapwork and tablet extraction scripts moved to `tools/antique/sprites/` (they rebuild both sprites byte for byte).

### Task 39: Still at rest, rays that end (glyph-flicker investigation)

- [x] The cosmic-web chart shimmered at rest (~6k px per frame at dpr 1): `web.wesl` thresholds the density row, whose raymarch reseeds its step jitter every frame. With the look on, `cosmic-web-density-print` swaps in for the raymarch with its jitter held still (`steadyJitter`); the plain look's raymarch is untouched. Rest diff: 0 px per frame; no added pass.
- [x] `starGlyph`'s rays ran on past their tips as a half-ink hairline to the quad's edge (the AA band over a zero-width wedge); an anti-aliased cap ends each ray at its tip. A test evaluates the shader's own `starGlyph`.
