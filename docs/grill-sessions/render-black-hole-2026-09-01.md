# Grill Session: Rendering Sgr A* (black-hole close-up) — 2026-09-01

Source: live brainstorming session, pivoting from a Gaia-data research question ("what's near the GC?") to the deliberate follow-up the S-star spec deferred: giving Sgr A* a visual treatment. Prior art surveyed: PR #365 `feat/gravitational-lensing` (cluster lensing).

Goal: when the camera descends past the S-stars onto Sgr A*, show a physically-grounded black-hole close-up — shadow, photon ring, gravitationally lensed background — instead of today's nothing.

Context findings that framed the session (Explore survey of main @ 9dce415f4):

- Sgr A* ships as an `AnchorPointBody` (position, label, real Schwarzschild radius 12.69×10⁶ km ≈ 0.085 AU) that deliberately draws nothing; the S-star spec's non-goals name "black disc, lensing, photon ring" as a dedicated follow-up — this feature.
- The scale ladder already reaches it: focus + per-body standoff + NEAR0 adaptive frustum let the camera descend to ~1× r_s today.
- PR #365 (SIS/NFW cluster lensing, 40 commits, June 2026) is **template, not base**: different feature (background galaxies lensed by clusters, vertex-stage thin-lens), ~53-file conflicts after the `galaxyCatalog/` shader reorg, 257 commits stale. Reusable ideas: two-vec4 lens uniform pattern, precompute-a-LUT-instead-of-per-vertex-root-finding.
- Landmine: backlog item `2026-07-30-camera-target-vs-origin-distance-gates.md` names Sgr A* as the first case where origin-relative NEAR0 gate derivation diverges from target-relative reads.

---

## Q1: Visual ambition

**The question:** What should "rendering Sgr A*" deliver when the camera approaches — how big is this feature?

**Considerations:**

- **Option A (full lensed close-up):** a real destination — black shadow, photon ring, lensed background starfield warping as you orbit (EHT/Interstellar-class visual). Needs a dedicated lensing pass; largest scope.
- **Option B (physically-scaled marker):** point-mass lens warping nearby stars via PR #365-style vertex deflection + a glow/shadow sprite. Honest at the already-rendered scale, no new pass.
- **Option C (lensing revival first):** land PR #365's cluster lensing, then add a point-mass profile. Physics-first sequencing, two PRs.

**Decision:** **Full lensed close-up (A).** The scale ladder already supports the descent, and the S-star spec explicitly reserved this treatment; B and C both fail to deliver the shadow/photon-ring visual that defines the object.

## Q2: Physical honesty of the emission

**The question:** Sgr A* is quiescent — no bright Interstellar-style accretion disc exists in reality. How honest is the close-up?

**Considerations:**

- **Option A (honest quiescent):** shadow + photon ring + lensed starfield only. Fully defensible; relies on lensing alone for spectacle.
- **Option B (cinematic disc):** glowing doppler-beamed disc. Spectacular but fictional for this object; large extra shader surface.
- **Option C (faint EHT-style glow):** honest scene plus a dim ring-hugging emission matched to the EHT Sgr A* image geometry. Small addition; keeps the "this is what it looks like" claim defensible with a documented false-colour note.

**Decision:** **Faint EHT-style glow (C).** Middle path: the glow marks the object from afar and gives the lensing something to act on, while staying anchored to a real measurement. Noted honestly: at visual wavelengths Sgr A* is dark — EHT orange is 230 GHz false colour, so the glow is documented artistic licence.

## Q3: Lensing technique

**The question:** How is the gravitational lensing actually computed and drawn?

**Considerations:**

- **Option A (screen-space warp):** post-pass distorting the framebuffer around the BH. Cheap, but an Einstein ring shows sky from behind the camera, which isn't in the framebuffer — wrong exactly where it matters.
- **Option B (per-vertex deflection, PR #365 style):** bend star positions in the vertex stage, draw double images. Works for discrete points only; no shadow edge, no photon ring, can't bend backdrop imagery; thin-lens breaks down in the near field.
- **Option C (environment-cubemap geodesic pass):** inside the approach band, capture the surrounding scene into a small cubemap; a screen-quad shader traces Schwarzschild geodesics per pixel (analytic bending angle or 1D LUT — PR #365's LUT trick, one dimension smaller) sampling the cubemap. Shadow, photon ring, Einstein rings, multiple images all emerge from the geometry.

**Decision:** **Cubemap geodesic pass (C).** Only option that produces the chosen visual; every ingredient (offscreen targets, LUT textures, fade bands) has codebase precedent, and the pass gates strictly to the close-approach band. Clarified in discussion: the glow does NOT come from the cubemap — it is synthesized in the same pass (rays crossing the emission region accumulate glow; escaping rays sample the cubemap; captured rays go black), which is what makes the asymmetric-ring look emerge rather than being painted.

## Q4: Metric

**The question:** Schwarzschild or Kerr?

**Considerations:**

- **Option A (Schwarzschild):** no spin. Closed-form-ish deflection, 1D LUT, simple shadow geometry.
- **Option B (Kerr):** spin adds frame-dragging asymmetry — but Sgr A*'s spin magnitude/orientation are poorly constrained, geodesics need a 4D LUT or full integration everywhere, and the shadow-shape difference is a few percent.

**Decision:** **Schwarzschild (A).** We don't know the spin, so Kerr would be heavy machinery in service of an unverifiable claim; the doppler asymmetry people actually notice comes from disc-material motion, modelled regardless.

## Q5: What gets lensed

**The question:** Which scene content renders into the lensed cubemap, and what stays on top unlensed?

**Considerations:**

- **Lens everything** including orbit trails/rings/labels: physically consistent but warped annotation ellipses read as bugs, and labels must stay legible.
- **Lens the "sky" only:** star points, galaxy points, backdrop imagery into the cubemap; diagrammatic layer (orbit trails, marker rings, labels, picking) composited on top unlensed.

**Decision:** **Lens the "sky" only.** Annotations are not light. Accepted approximation, stated explicitly: cubemap content is treated as at-infinity — valid because the strong-field region spans a few AU while the nearest real content (S-stars) sits at hundreds of AU; a star sweeping behind the hole still doubles/rings correctly.

## Q6: Activation envelope and far-field presence

**The question:** When does the expensive pass run, and what exists at Sgr A* before it engages?

**Considerations:**

- **Empty far field (status quo):** nothing until the pass engages — the object pops into existence.
- **Far-field glint + fade band:** a faint orange point-glint at the anchor from afar (the real compact source), crossfading into the geodesic pass via the existing `SCALE_FADE_BANDS` mechanism keyed on distance to the Sgr A* anchor (the same pattern the GC Milky-Way fade shipped on in #642).

**Decision:** **Glint + fade band**, roughly engage ≤ 500 AU → fully on by ~100 AU (the shadow is subpixel until a few hundred AU, conveniently inside the S-star cluster scale). Pass cost is exactly zero outside the band.

## Q7: Glow model

**The question:** What emission model, and does it vary in time?

**Considerations:** thin equatorial annulus at ~3–6 r_s (ISCO outward → the ~5 r_s lensed ring the EHT measured), Keplerian doppler brightening on the approaching side, near face-on viewing (EHT constrains inclination ≲ 30°), warm orange, calibrated fainter than the S-stars. Position angle unconstrained observationally — pick one and note it. Variability: Sgr A* flickers on minute timescales (its EHT image needed variability correction); options were skip (less shader surface) vs include minimally.

**Decision:** annulus model as above, **flicker included, minimally** — one global sim-clock-driven brightness modulation, no patch structure.

## Q8: Cubemap capture cost

**The question:** Capturing the scene 6× per frame (galaxy cloud ~2.5M points) would be the most expensive thing in the app — what's the capture strategy?

**Considerations:**

- **Per-frame full capture:** simplest, optimize later if the harness complains.
- **Amortized:** 256²–512² rgba16float faces; round-robin one face per frame (full refresh every 6 frames — invisible for a quasi-static background); full 6-face capture once on band entry so the first view is never stale; per-pass LOD so the cloud renders reduced-count into the small target.

**Decision:** **Amortized round-robin** with band-entry full capture and LOD'd capture passes. Perf gate: `npm run perf` before/after; ~zero outside the band, bounded inside.

## Q9: User-facing controls

**The question:** Any settings — toggle, strength slider?

**Considerations:** PR #365 had a `lensStrength` slider because cluster lensing at physical 1× is invisible; here physical 1× *is* the show. A toggle would exist only as a perf escape hatch, but the pass is already proximity-gated to ~zero cost elsewhere.

**Decision:** **Zero new settings.** Physically parameterized from the shipped anchor body (mass → r_s). Dev tuning through the existing debug panel, removed before merge. Code-is-liability default.

## Q10: Descent floor

**The question:** The global standoff would let the camera park at 1.0000024 × r_s. How deep is the descent allowed to go, given the shader's static-viewpoint model is only well-behaved down to about the photon sphere (1.5 r_s)?

**Considerations:**

- **Horizon-graze (status quo):** the last stretch shows confidently wrong physics (no local-frame aberration / sky compression).
- **Floor at ~2 r_s:** per-body standoff override (one data field; current multiplier is global). Shadow already fills most of the view; everything shown stays defensible.
- **Full GR observer view:** local-frame aberration + sky-wide redshift below the photon sphere — a significant extra shader layer.

**Decision:** **Floor at ~2 r_s.** The full observer experience is a possible future follow-up, not this feature.

## Q11: Sequencing — park on the body slab

**The question:** Ground prep was about to include a precision/gate probe (AU-scale scene 8.2 kpc from render origin ≈ f32 epsilon territory; the target-vs-origin NEAR0 gate item names Sgr A* as first victim). But a **body slab** is being implemented in another worktree (riding the Earth RTC camera effort) — probe now, or wait?

**Considerations:**

- **Option A (park the whole feature):** wait for the body slab, then probe → refactor-ground → spec against the settled camera architecture. Same reasoning that parked inside-atmosphere on #634: don't judge a dying camera.
- **Option B (split by dependency):** prototype the pure-shader half (geodesic tracer, LUT, glow) in a standalone workbench now; spec the integration after the slab lands.

**Decision:** **Park entirely (A).** All design decisions above are captured here; work resumes with the precision/standoff probe once the body slab has landed, and the spec is then written against the post-slab ground (refactor-ground runs at that point, folding in the target-vs-origin gate item if the probe implicates it).

---

## Resume checklist (when the body slab lands)

1. Probe: focus Sgr A*, force distance to ~2 r_s, observe jitter / frustum / S-star sprite stability under the new slab.
2. Run `refactor-ground`; decide whether `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md` becomes prep inside this feature.
3. Write the spec from this transcript (decisions Q1–Q10 are settled; don't re-litigate without new evidence).
