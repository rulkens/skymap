# Grill Session: Zone-of-Avoidance Guide Layer — 2026-08-12

Source: conversation (`/wt` + `/grill-me` on "I would like a guide layer for the zone of avoidance").

A didactic overlay that explains the wedge-shaped hole in the galaxy catalogs — the sky band where the Milky Way's dust hides everything. Scope deliberately converged on a *simple, nicely rendered annotation* (band/wedge + text), not a data-driven extinction product.

---

## Q1: What is the layer, geometrically?

**The question:** The ZoA is a solid angle from our viewpoint (dust in the galactic plane blinding us along low galactic latitudes). In a free-flying 3D map, what shape represents it — and does that shape still explain the catalog gap when the camera is far outside the Local Group?

**Considerations:**

- **Option A (radially-extruded region):** The obscured solid angle extruded from the Sun outward through the catalog volume — a translucent "shadow wedge" that plugs the visible hole in the point cloud. Honest in 3D; reads correctly from every camera position.
- **Option B (sky-band surface):** The band painted on a large celestial sphere, backdrop-style. Cheap, but only reads correctly from near the Sun; from outside the catalog it's a distant ring detached from the gap it's meant to explain.
- **Option C (boundary contour only):** A guide line at the band edge, constellation-lines style, no fill. Minimal, but conveys nothing about "you can't see *through* this."

**Decision:** Option A. The extrusion is the only version that explains the catalog gap from every viewpoint, which is the layer's entire job.

## Q2: What data drives the band's shape?

**The question:** Real extinction data (with its irregular, filamentary silhouette) or an analytic model? This decides whether the feature grows a fetch + bake pipeline.

**Considerations:**

- **Option A (Planck GNILC τ₃₅₃):** Highest-fidelity all-sky dust map; verified available at IRSA/PLA (`COM_CompMap_Dust-GNILC-Model-Opacity_2048_R2.01.fits`, HEALPix Nside 2048; stores optical depth, E(B−V) = τ₃₅₃ × 1.49×10⁴). Would need a fetcher, rawDataRegistry entry, and a bake-to-texture builder.
- **Option B (SFD98 E(B−V)):** The classic reddening map; smaller, smoother, same pipeline cost.
- **Option C (analytic band):** No download, no pipeline; a smooth analytic shape.

**Decision:** Option C — analytic. Initially leaning A, but the user reset scope: the ask is a *simple guide extra* ("nicely rendered band/wedge with some text on it") explaining why barely any galaxies are visible there, not an extinction data product. The Planck link-out stays recorded here in case fidelity ambitions return later. Consequence: this is a singleton overlay layer (settings-owned, status-only store), not a data source.

## Q3: Visual treatment of the band?

**The question:** How does the wedge read against the galaxy field — physical haze, chart annotation, or explicit "no data" cartography?

**Considerations:**

- **Option A (soft translucent veil):** Feathered, semi-transparent, muted warm dust tone; opacity fades toward the band edges and with radius. Reads as haze; sits quietly behind the points.
- **Option B (cartographic band):** Crisper edges, thin rim line, very low fill. Reads as "designated region," more diagram than physical.
- **Option C (hatched "no data" fill):** Maximally annotation-like, but stylistically loud next to the photoreal Milky Way / HDR work.

**Decision:** A with a whisper of B — soft veil for physicality, plus a very subtle edge treatment so the extent is legible from outside and the lettering has something to anchor to. C rejected as clashing with the established look.

## Q4: Radial extent of the wedge?

**The question:** The real gap runs from just outside the Milky Way to the survey edge (~400 Mpc for GLADE). How much of that does the annotation span?

**Considerations:**

- **Option A (full catalog depth):** Inner edge a few Mpc out (clear of the Milky Way's own rendering), outer edge near the GLADE/SDSS shell (~350–400 Mpc), opacity easing out at both rims. Static mesh, matches the data gap at every zoom.
- **Option B (mid-shell band only):** A shell segment at a representative distance; floating-banner feel, but the gap visibly extends beyond it from many angles.
- **Option C (scale-adaptive extent):** Extent tied to camera scale so it always spans the visible data. Most correct, most machinery.

**Decision:** Option A. No per-frame logic, and the radial opacity falloff approximates C's benefit for free.

## Q5: How is the text rendered and placed?

**The question:** "Some text on it" — as what? On-surface lettering, a billboard label, or lettering plus a click-through explanation?

**Considerations:**

- **Option A (on-surface curved text):** "ZONE OF AVOIDANCE" laid along the band's great circle from the MSDF atlas, foreshortening with the band. Map-annotation feel (think "SAGITTARIUS ARM" lettering on galaxy maps).
- **Option B (billboard label):** Existing label renderer, camera-facing. Cheapest, but reads as a POI named Zone of Avoidance, not an annotation of a region.
- **Option C (A + pickable band → InfoCard):** On-surface lettering for presence; clicking the band opens an InfoCard with the actual explanation (dust extinction, why surveys are blind there).

**Decision:** Option C, with the lettering repeated 2–3 times around the band so it's discoverable from any viewing longitude (one instance can hide behind the bulge). The didactic prose lives in the InfoCard, not floating in space. Cosmological scale ⇒ standard COSMO label routing if any billboard fallback is used (the constellations NEAR0 landmine doesn't bite here).

## Q6: When is the layer visible?

**The question:** The band is noise when you can't see the galaxy field — and from inside the Milky Way the ZoA *is* the visible Milky Way band, so showing an annotation there is conceptually wrong.

**Considerations:**

- **Option A (camera-distance fade):** Invisible near Earth / inside the Milky Way, eases in past the Local Group (~5–10 Mpc from the MW), full presence at survey scales. One smoothstep on camera radius.
- **Option B (always on when toggled):** No scale logic, but shows a giant sky band from Earth's surface — wrong.
- **Option C (tied to catalog-source visibility):** Couples to settings state rather than the camera; indirect.

**Decision:** Option A. Camera in, opacity out; self-contained. Per the opacity-0 convention, fully faded ⇒ not rendered and not pickable.

## Q7: Settings shape and default state?

**The question:** Where does the toggle live and is the layer on by default? (A guide layer that's off by default mostly guides nobody — but defaults shape the scene everyone sees.)

**Considerations:**

- **Option A (default ON):** The audience who most needs it (first-timers staring at the hole) never opens settings. The quiet-veil design from Q3 is built to coexist with everything.
- **Option B (default OFF):** Consistent with opt-in overlays (filaments, structures); annotation-free default scene.

**Decision:** Default ON, grouped with the other overlay layers in SettingsPanel. State shape (user-specified): `settings.zoneOfAvoidance.enabled` and `settings.zoneOfAvoidance.labelEnabled` — band and lettering toggle independently. Flipping the default later is a one-line change if it fights the aesthetic.

## Q8: Constant latitude width, or wider toward the bulge?

**The question:** The real ZoA bulges to roughly ±15° around the galactic center's longitude and narrows to ~±5° toward the anticenter. Does the analytic band model that?

**Considerations:**

- **Option A (longitude-varying width):** A simple analytic `b_limit(ℓ)` — e.g. a cosine-ish bump peaking at the bulge. Zero data dependencies, a few lines of math, silhouette matches the actual hole in the point cloud. Most of the available "fidelity" at this scope.
- **Option B (constant ±10°):** Simplest, but visibly under-covers the gap near the bulge and over-covers it at the anticenter — undermines the "this explains the hole" job.

**Decision:** Option A. The Q3 feathered edge hides any imprecision in the analytic model.

## Q9: Blending — absorbing or additive?

**The question:** Does the veil dim what's behind it (physically apt — it *is* absorption) or only add luminance?

**Considerations:**

- **Option A (alpha-over, absorbing):** Tangible depth (far rim reads through near rim), dusty look — but requires sorting against the point cloud and dims real data.
- **Option B (additive glow):** Never hides a single real galaxy; order-independent (no sorting machinery — just a frame-program step); plays well with the HDR/bloom pipeline. Slightly less "dusty."

**Decision:** Option B, additive. For a guide layer, "never hides data" is the right invariant, and the premise is that there's almost nothing behind the band to dim anyway.

---

## Deferred / out of scope

- Exact inner/outer radii, `b_limit(ℓ)` parameters, colour tone, opacity levels — plan + visual-pass feel calls.
- InfoCard copy — drafted in the plan.
- Tour integration — not discussed; separate ask if wanted.
- Planck-driven silhouette (Q2 option A) — recorded above with verified links if fidelity ambitions return.
