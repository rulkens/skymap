# Grill Session: Planet Rendering Improvements — 2026-07-17

Source: `/wt improve-planet-rendering` session; user ask "I'd like to improve the rendering of the planets."

The true-scale solar-system bodies (7 planets + Moon + 13 moons, instanced flat-lit
UV spheres via `planetRenderer`) shipped with documented placeholders: no textures,
a fixed aesthetic light direction, no axial tilt, no Saturn rings, and a hard 1px
sub-pixel cull. This session scoped and resolved the design for the visual upgrade.

Pre-session ground truth (from code/docs exploration): bodies are real instanced
meshes drawn through the NEAR0 slab with an f64 MVP seam (`composeBodyMvp`);
positions come from static J2000 Keplerian elements (`orbitalElements.ts`); Earth
alone is textured (Blue Marble, demand-gated `ASSET_WIRING` slot firing below
1e-3 Mpc); picking is a separate blocked backlog item
(`docs/backlog/2026-07-12-foreground-body-picking.md`) and stays out of scope here.

---

## Q1: Scope — which axes of "improve the rendering"?

**The question:** The current gaps span textures, lighting, tilt, Saturn's rings,
atmospheres, the sub-pixel pop, time evolution, and picking. Which are in play for
this effort?

**Considerations:**

- **Textures + sun lighting + axial tilt (core bundle):** entangled as one visual
  upgrade — a textured sphere lit from the wrong direction looks worse than a flat
  one, and a texture without tilt puts Jupiter's bands at the wrong angle. Reuses
  Earth's demand-gated texture rail.
- **Saturn's rings:** the single most recognizable missing feature, but needs new
  geometry (annulus) and a shadow story — an explicit yes/no, not assumed.
- **Sub-pixel glint fallback:** replaces the hard 1px cull so bodies stop popping
  in/out during descent.
- **Animated ephemeris (clock):** element rates + time control; arguably a separate
  feature ("motion"), not "rendering". The elements table names it as its own
  future extension point.
- **Picking:** already a designed, blocked backlog item — separate effort.

**Decision:** Core bundle + Saturn's rings + sub-pixel glints. Animated ephemeris
explicitly out (separate feature). Picking untouched (stays blocked/sequenced as-is).

## Q2: Which bodies get texture maps?

**The question:** The registry holds 21 bodies. Equirectangular maps only look
right on near-spherical bodies; small moons are irregular.

**Considerations:**

- **Option A (planets + Moon + 5 round moons):** 13 textures — Mercury–Neptune,
  Moon, Io, Europa, Ganymede, Callisto, Titan. Irregular moons (Phobos, Deimos,
  small Saturnians) stay flat-albedo, because wrapping a map on a UV sphere makes
  a potato-shaped body look *more* wrong, and public-domain maps for them are patchy.
- **Option B (planets + Moon only):** 8 textures, smallest footprint, but the big
  moons you can fly right up to stay flat.
- **Option C (all 21):** forces bad sphere-wrapped textures onto irregular bodies.

**Decision:** Option A — 13 textured bodies; irregular moons keep flat albedo
(which doubles as the universal pre-load placeholder state, see Q6).

## Q3: Texture source + licensing

**The question:** Skymap is publicly deployed — sources must be licence-clean.

**Considerations:**

- **Option A (Solar System Scope pack, CC BY 4.0):** one consistent pack for the
  8 planets + Moon, NASA-derived, needs an attribution line. Does not cover the
  Galilean moons/Titan.
- **Option B (NASA/USGS Astrogeology, public domain):** covers everything incl.
  the big moons, no attribution required, but per-body hunting with inconsistent
  projections/processing levels.
- **Option C (Björn Jónsson maps):** highest quality, but non-commercial-use terms
  are murky for a public deployment.

**Decision:** A + B hybrid — SSS for planets + Moon, USGS public-domain for the
5 big moons. Fetch script + committed `.sha256` sidecars + provenance README per
the new-raw-data-source checklist; attribution line added where the site credits
data sources. Per `feedback_verify_external_data_before_spec`: confirm actual
URLs/native resolutions for all 13 bodies **before** the spec is written — SSS's
8k coverage is not universal (Uranus/Neptune likely top out lower) and USGS moon
maps vary; record each body's true native ceiling and never upscale.

## Q4: Texture resolution + load gating

**The question:** Bytes downloaded vs close-approach fidelity, and when fetches fire.

**Considerations:**

- **Option A (2k all, one bundled slot):** ~6 MB fetched once below the existing
  1e-3 Mpc descent gate; single `ASSET_WIRING` row mirroring Earth's. Simplest.
- **Option B (4k showpieces, 2k rest):** ~10 MB, uneven sizes.
- **Option C (per-body proximity gating):** each body's texture loads only on
  approach to *that* body; 13 wiring rows / a keyed slot family; least bytes and
  least resident GPU memory.

**Decision:** Option C, extended by the user with **per-tier sizing riding
`state.sources.tier`**: small → 2k, medium → 4k, large → 8k — the same dropdown
that already selects catalog bins and MCPM SCFD tiers, so bandwidth preference is
expressed once. The combination is load-bearing: an 8k RGBA texture is ~135 MB of
GPU memory uncompressed, so "only the approached body is resident" is what makes
the large tier viable at all. Flying away releases the slot (demand predicate goes
false) and frees the memory; a tier switch re-fetches on next approach.

## Q5: Delivery channel

**The question:** 13 bodies × 3 tiers ≈ 39 files, roughly 90 MB. Earth's 1 MB
Blue Marble is committed to `public/images/` (Workers Assets), but 90 MB in git
is exactly why the catalog `.bin`s live on R2.

**Considerations:**

- **Option A (R2 via `public/data/`):** raw native-res sources fetched once into
  `data/raw/textures/` (registered in `rawDataRegistry`, `.sha256` sidecars,
  provenance README); a build step resizes to the three tiers into gitignored
  `public/data/`; `syncR2.ts` ALLOW list grows the texture set; runtime fetches
  via the `dataUrl()` base. Dev + worktree-symlink flows work unchanged.
- **Option B (commit to `public/images/`):** Earth's pattern — but ~90 MB into
  every clone.
- **Option C (hotlink upstream):** no hosting, but fragile (CORS, upstream moves)
  and violates the fetch-once posture.

**Decision:** Option A — R2 through the standard raw → build → sync pipeline.

## Q6: Renderer architecture

**The question:** `planetRenderer` draws all bodies in one instanced call with an
*empty pipeline layout* — no bind groups, incompatible with textures. Per-body
proximity gating means textures come and go independently, ruling out a fixed
`texture_2d_array` (uniform size, all-resident).

**Considerations:**

- **Option A (two-path, Earth folds in):** shared textured-sphere pipeline
  (generalizing `earthRenderer`) for resident textures; instanced flat draw as
  fallback. Consolidates the family.
- **Option B (parallel textured-planet renderer, Earth untouched):** avoids the
  Earth refactor but looked like near-duplication.
- **Option C (uber-pipeline + dummy 1×1 white texture):** one pipeline, wasted
  texture sample per flat body, bind-group story forced onto the instanced path.

**Decision:** **Three paths** (user override of the recommended A):

1. instanced flat-albedo draw — fallback for irregular moons forever and for any
   textured body whose texture isn't resident yet (flat albedo *is* the
   placeholder, mirroring Earth's mid-blue posture);
2. a shared textured-sphere renderer for planets/moons with resident textures
   (per-body draw + bind group; ≤13 extra draws, trivial);
3. **Earth keeps its own dedicated renderer** — deliberate divergence, because
   Earth is slated for an ultra-realistic treatment (atmosphere, day/night,
   oceans) that the generic textured path will never grow. Not duplication:
   planned divergence, recorded here so future entanglement-radar passes don't
   flag it as a fold candidate without checking this decision.

## Q7: Lighting model

**The question:** How far does "real sun-relative lighting" go?

**Considerations:**

- **Option A (sun-relative Lambert + ambient floor):** CPU computes the sun→body
  direction per frame, rotated into body-local space so the shader stays a dumb
  dot product even with tilt. Faint ambient floor (~0.03–0.08) keeps night sides
  legible. Correct phases (crescent Venus, gibbous Moon) fall out automatically.
- **Option B (physically black nights):** truer, but a half-lit body at 4 px reads
  as a broken half-circle and finding a focused body becomes a UX problem.
- **Option C (inter-body eclipse shadows):** significant complexity for events
  only visible by hunting them, on a frozen epoch.

**Decision:** Option A. Eclipse/inter-body shadows explicitly deferred (revisit
if an animated ephemeris ever lands — eclipses only become discoverable with a
clock). Saturn ring/planet mutual shadowing is the one exception, resolved in Q9.

## Q8: Axial tilt / orientation source

**The question:** Tilt only matters for the 13 textured bodies (a flat-albedo
sphere is rotation-invariant). What's the data source, and how complete?

**Considerations:**

- **Option A (IAU/WGCCRE rotation elements at J2000):** `rotationElements.ts`
  table (pole RA/Dec + prime-meridian W₀ + rate), same shape/provenance
  discipline as `orbitalElements.ts`. Correct poles *and* correct facing —
  Jupiter's Red Spot where it was at epoch, tidally-locked moons genuinely face
  their parent. `W(t) = W₀ + Ẇ·t` is the ready-made clock extension point.
- **Option B (obliquity-only):** one angle per planet; arbitrary facing, faked
  tidal locking.
- **Option C (reuse Laplace frames + eyeball):** least new data, least correct.

**Decision:** Option A. Doing orientation half-right gets rediscovered as a bug —
especially since the rings (Q9) must share Saturn's exact equatorial frame with
its moons' orbits.

## Q9: Saturn's rings

**The question:** Geometry, appearance, and whether mutual shadowing makes the cut.

**Settled without a fork:** Saturn only (Uranus's rings are near-black, Jupiter's
gossamer — assets for invisible pixels); flat annulus mesh in Saturn's IAU
equatorial frame, ~74,500–140,220 km (C-ring inner → A-ring outer); radial ring
texture with alpha (SSS ships one) stored as an **N×1 `texture_2d`, never
`texture_1d`** (the documented iOS WebKit landmine — an invalid pipeline silently
kills the whole shared-encoder frame); rings draw alpha-blended after the opaque
sphere, two-sided.

**Considerations:**

- **Option A (analytic mutual shadows):** ring-shadow-on-planet = plane
  intersection + radius test + one ring-alpha sample along the sun ray in the
  sphere shader; planet-shadow-on-rings = one ray-sphere test in the ring shader.
  ~20 lines of WGSL each, closed-form, no shadow maps or new passes; only
  Saturn's fragments pay.
- **Option B (no shadows, defer):** ships faster; visibly fake at exactly the
  close-approach moment the feature exists for.

**Decision:** Option A — analytic mutual shadows. `feedback_wgsl_meticulous`
applies: this is the shader in the bundle that wants slow, visually-verified work.

## Q10: Sub-pixel glint fallback

**The question:** What does a below-1px planet become, instead of vanishing?

**Considerations:**

- **Option A (brightness-scaled glints):** below the cull threshold the body joins
  a small point pass (the `starPointRenderer` shape already in the bodies family),
  ~2 px dot with brightness from apparent size × albedo × phase; mesh↔glint
  cross-fade over ~1–3 px via the existing `fadeBand` primitive. Venus stays a
  brilliant point, Neptune a faint one — physically what naked-eye planets are.
- **Option B (fixed-size dots):** simplest; Deimos as bright as Venus reads wrong,
  21 equal dots clutter the ecliptic.
- **Option C (distance-capped only):** glints gated by the existing
  `FOREGROUND_MAX_DISTANCE_MPC` foreground gate.

**Decision:** A + C combined — brightness-scaled glints, existing foreground gate
(nothing changes at galaxy scales), `fadeBand` for the cross-fade (no new
mechanism), and the `feedback_opacity_zero_no_render` rule: a glint faded to
zero skips its draw.

## Q11: Which face of Venus?

**The question:** Packs ship two Venuses — the cloud-deck atmosphere (featureless
creamy ball, what Venus actually looks like) and the Magellan radar surface
(dramatic terrain, invisible to eyes). Sets precedent for what "realistic" means
for this layer.

**Considerations:**

- **Option A (cloud atmosphere):** physically honest; consistent with the bundle's
  "what you'd actually see" pitch (true lighting, true tilt, true phases).
- **Option B (radar surface):** more visually interesting; a lie about appearance.

**Decision:** Option A — cloud atmosphere. A "peel the clouds" surface mode could
be a later Venus-specific treat, same spirit as Earth's planned ultra-real
divergence.

---

## Q12 (post-checkpoint): Earth consistency + delivery

Two decisions made at the refactor-ground checkpoint (2026-07-17):

**Earth Lambert now.** Earth's fragment shader is full-bright today (samples the
Blue Marble with no lighting term). Sun-lit planets next to an unlit Earth would
look inconsistent, so the same Lambert + ambient-floor treatment folds into this
feature (~10 lines in earth shaders + sun-dir in its uniform). The full
ultra-real Earth treatment (atmosphere, day/night, oceans) remains future work in
Earth's dedicated renderer (Q6 unchanged).

**Earth texture rides R2.** The Blue Marble moves off the committed
`public/images/earth/` + bespoke `earthTexture` slot and into the same pipeline
as the other 13 bodies: Earth becomes a 14th body in the texture fetch/build/R2
chain and the keyed `bodyTextures` slot family (per-body proximity demand +
eviction + tiers included). The dedicated `earthTexture` wiring row, fetcher, and
slot are deleted; `earthRenderer.setTexture` stays as the commit target. One
delivery path for the whole asset class; Earth gains 2k/4k/8k tiers (NASA
Visible Earth ships Blue Marble well past 8k — source to be verified with the
other 13).

## Q13 (post-verification): source realities

Source verification (2026-07-17, AFK-authorized decisions) adjusted three things:

**Titan drops from the textured set → flat albedo.** The only global Titan map is
a Cassini ISS 938 nm surface mosaic — real surface albedo, but not what Titan
looks like: visually it is a featureless orange haze ball, which is exactly what
the flat-albedo path renders. Same philosophy as the Venus cloud-deck decision
(Q11). The USGS mosaic (tinted) remains a possible future "pierce the haze" treat.

**Per-body tier ceilings are data, not uniform.** SSS ships no 4k tier (the 4k
tier is a build-time downsample of the 8k raw — downsampling fine, upscaling
never); Uranus/Neptune cap at 2k (genuinely featureless source data); Venus
atmosphere caps at 4k. The body-texture registry carries each body's available
tiers and the runtime clamps the requested tier to the ceiling.

**Earth raw source = NASA Blue Marble NG 21600×10800** (single public-domain
equirect JPEG, CORS-open, ~28 MB) — downsampled to all three tiers; replaces the
committed public/images 4k JPG per Q12.

## Out of scope (explicit)

- **Animated ephemeris / clock** — separate future feature; `orbitalElements.ts`
  and the new rotation-elements table both carry the named extension point.
- **Foreground-body picking** — existing blocked backlog item, unchanged.
- **Inter-body eclipse shadows** — deferred until a clock makes them discoverable.
- **Atmospheres / Earth ultra-real treatment** — Earth's dedicated renderer is the
  future home (Q6); nothing in this bundle builds it.
- **Uranus/Jupiter/Neptune rings** — invisible-dark; not worth assets.

## Next steps

1. Verify texture sources end-to-end (URLs, licences, native resolutions per
   body) — `feedback_verify_external_data_before_spec`.
2. Run the `refactor-ground` skill over the touchpoints (bodies renderer family
   split into the three paths of Q6; slot family for keyed per-body/per-tier
   assets; `sceneBodies` texture/rotation metadata shape) before the spec.
3. Write the spec with a Ground-preparation section, then the plan(s).
