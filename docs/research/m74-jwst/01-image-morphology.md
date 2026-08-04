# M74 (NGC 628) JWST/MIRI — what the image shows, feature by feature (2026-08-03)

Read alongside the branch docs in `docs/research/milky-way/` (on
`milky-way-analytic-field`; this folder lives on main because that worktree is
in active use). Source image: the PHANGS JWST/MIRI mosaic of M74
(`M74_Galaxy_JWST_MIRI.jpg`, Wikimedia). MIRI here is dominated by 7.7/11.3 μm
PAH emission plus 21 μm warm dust — this is dust seen in **emission**, not the
extinction lanes HST shows. At M74's ~9.8 Mpc, 1″ ≈ 48 pc; MIRI's PSF puts the
finest visible filaments at a few tens of pc — everything sharper exists but is
unresolved.

Labels follow the branch convention: OBSERVED (read directly off this image),
INFERRED (analysis), LITERATURE deferred to the three companion research docs.

## 1. The disc is a foam, not a field with holes in it

**OBSERVED.** Dark quasi-circular cavities tessellate the ENTIRE disc — arm,
interarm, everywhere outside the blue nuclear disc. Adjacent cavities **share
walls**: the bright PAH filaments are not free-floating streamers, they are
the septa between cells, meeting in Y-junctions like soap-film Plateau
borders. Cavity sizes span the resolution limit (~20 pc) up to ~1 kpc-class
voids, small cells nested inside the walls of large ones.

**INFERRED, the gap.** The renderer's discrete bubbles are ≤120 + 120
independent spheres carved as negative splats out of a positive dust bed —
isolated holes, walls owned by nobody, no nesting, no sharing. The SSPSF map
is the piece that CAN make foam (burnt-out gas voids fenced by advancing
ignition fronts are exactly shared-wall cells), so the question for the branch
is contrast and wall sharpness of the map-placed dust, not new machinery.
What no current piece supplies: walls that are **brighter than the ambient
medium because they hold the mass swept out of the cells** (§2).

## 2. Cavity walls are overdense, and one-sided

**OBSERVED.** Wall brightness is asymmetric per cavity — typically one arc of
the rim is a sharp bright ridge (in the crop at the big southern cavity, the
north-west arc) while the opposite side is ragged and fades into the cell.
Bright SF knots sit ON the sharp arcs. Cavity interiors are not empty: faint
translucent filament wisps and point sources persist inside even the largest
cells.

**INFERRED.** Three renderer statements in one observation: (a) carving
deletes dust instead of conserving it into a rim — the planned
"negative bubble splats with swept rims" (dust.md network architecture) is
the right shape and is not yet built; (b) rim strength should be anisotropic
(compression side vs breakout side), which a spherically symmetric splat
cannot express; (c) the cavity floor wants a residual translucent density,
not zero.

## 3. The bright knots live on the walls

**OBSERVED.** The pink-white compact knots (HII regions / young clusters) are
overwhelmingly embedded IN filament walls and rim arcs — including interarm
walls — not sprinkled across cells or centred in cavities. A few red
point-compact sources (embedded, youngest phase) sit in the thickest wall
segments.

**INFERRED, and this is the single strongest correlation the current code
cannot produce.** The CA gets the causality right for free — fronts ignite at
the edge of refractory/gas-poor voids, so young activity is adjacent to old
cavities by construction. But the DISCRETE tier that actually draws glowing
HII knots and their cavities (`sfEventCatalog`) rolls positions and ages
independently on arm ridges: its knots land anywhere in the arm cross-section,
uncorrelated with the map's cavities and with its own older bubbles. The
sf-map doc already stages "replace `gapSkipped` with map reads" — this
observation says the knot/bubble catalog wants to be sampled FROM the map's
age/activity channels (young events at fronts, old bubbles at void centres),
which was design doc N3's intent all along.

## 4. Nothing about a cavity is a circle

**OBSERVED.** Large cavities are elongated and polygonal; long axes tend to
follow the local filament flow (shear-stretched); several show a ruptured
side opening into a neighbouring cell.

**INFERRED.** Spherical splats can pass at small radii (≲100 pc, where real
bubbles are young and round) but the 300+ pc cells that dominate the image's
character need ellipticity + a rim-strength azimuth profile at minimum. The
orientation field the branch already computes from the SF map is the natural
source for the long-axis direction.

## 5. Structure at every scale, and the budget cuts the wrong end… twice

**OBSERVED.** The −2.2 size power law is visible by eye: each wall of a large
cell is itself perforated by smaller cells, down to the PSF. Fine filament
texture rides on top of every larger structure.

**INFERRED.** `BUBBLE_BUDGET = 120` keeping the LARGEST radii is right for a
far view (small holes die by pixel scale) but exactly wrong for the M74-like
close view, where the small-cavity population supplies most of the foam's
texture. A view-dependent budget (or letting the CA map carry the small end
as texture and the splats only the large end) resolves the tension without
raising the cap.

## 6. Interarm is structured, not smooth

**OBSERVED.** Interarm regions carry the same foam at lower surface
brightness, plus long sheared spur filaments bridging arms, plus occasional
bright knots and small cavities far from any arm.

**INFERRED.** The CA's propagation + shear is built to produce sheared
interarm debris — captured in principle. What has no mechanism: interarm SF
events and small cavities with no arm ancestry (field/runaway/Type Ia
supernova holes — see the supernova research doc). The event catalog's
arm-ridge-only placement guarantees a clean interarm, which the image
contradicts.

## 7. MIRI brightness = column × heating, and the renderer only has column

**OBSERVED.** Filaments of apparently similar thickness differ in brightness
by large factors depending on proximity to SF knots: walls hosting knots glow
blue-white, far interarm walls of similar width are dim olive-brown. The
colour itself shifts (white-blue near heating sources, red in embedded knots,
brown-olive in quiescent dust).

**INFERRED, cheap opportunity.** Dust in the renderer is an absorption screen;
the "JWST view" presents the column map directly, so its filament brightness
would be flat in heating. Multiplying presented dust emission by a blurred
activity/heating channel the SF map already carries would buy the image's
most recognisable tonal behaviour for one texture read. Note the inversion
also matters in the other direction: at optical wavelengths these same walls
must render as DARK lanes — one structure, two presentations.

## 8. Cavities are dark even where gas is known to exist

**OBSERVED.** Cavity floors drop essentially to the stellar background level —
darker than any plausible "less dust here" interpolation.

**INFERRED.** Two physical causes (PAH destruction inside ionised/hot gas, and
genuine evacuation) both act — see the bubbles and supernova docs. For the
renderer this licenses carving harder than mass budget alone would suggest:
the floor is dark out of proportion to its remaining column. A pure
column-based model under-darkens cavities exactly where the image is
blackest.

## 9. The nucleus is a different regime

**OBSERVED.** Inside ~apparent 0.1 R_disc the foam stops: a smooth blue
stellar core (star light, not PAH), threaded by two thin nuclear dust
spirals that reach essentially to the centre.

**INFERRED.** The branch's arm machinery starts at `armStartRadius`; the
nuclear dust spiral is a separate small feature, plausibly a cheap authored
one. Low priority for the Milky Way goal but it is the one place the
foam-everywhere prescription must switch OFF.
