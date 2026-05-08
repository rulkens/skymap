# MVP Definition — Cosmic Zoom

This spec defines a minimum viable product for the Powers-of-Ten tour: what we'd ship if we had to deliver in roughly half the calendar time of the full nine-shell experience. The intent is not to draw a smaller box around the same plan but to identify the subset that is still **shippable, still impressive, and still recognizably "Powers of Ten."**

The full vision lives in [`../SUMMARY.md`](../SUMMARY.md) and [`../vision/00-product-vision.md`](../vision/00-product-vision.md). The full shell catalogue is in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md). This document references those constantly; read them first if you have not.

## 1. Why MVP

Two reasons. They reinforce each other.

**To de-risk.** The full plan is 12–16 weeks of focused engineering with several research spikes baked in (ray-traced Sun, CF-4 volumetrics, CMB sphere). Each spike has a non-trivial probability of revealing that the chosen technique is wrong for the constraint, sending us back to the design board. A 12-week project with three independent ~30% risk forks has a sobering chance of slipping by a quarter or more. Shipping a smaller scope first compresses that exposure: we learn whether the *core mechanic* (per-shell rendering, choreographed camera tour, overlay copy, scale architecture) actually delivers the promised "wow" before we sink time into the most ambitious shells.

**To start collecting feedback.** The product vision is built on assumptions about visitor behaviour: that a "Take the tour" button will be clicked, that the tour will hold attention through 90 seconds, that completion correlates with onward exploration. None of these are verified. An MVP at half the runtime is enough to test all three, while a full-scope build keeps us guessing for another two months. Every week we ship earlier is a week of real telemetry instead of speculation.

The MVP also gives the team a definition-of-done that is **achievable rather than aspirational**, which keeps morale up across a long project. A shippable v1 in 6–8 weeks is a clear win; a "we've been working on it for 12 weeks and we're still polishing" is corrosive even if the eventual product is better.

## 2. MVP shell list

The MVP keeps **five of the nine shells**:

| # | Name | Why kept |
|---|------|----------|
| 4 | Local Group | The "we live in a structure" beat. Easiest shell technically (existing point-cloud + galaxy-disk renderer with new dwarf fuzzies). Reusable hero visual. |
| 6 | Virgo Supercluster | The "structure on structure" beat. Reuses our existing GLADE/2MRS point cloud styled with cluster halos. ROSAT X-ray volumetric is a stretch; cluster halos can fall back to point glow if needed. |
| 7 | Laniakea (simplified) | The dramatic "you're inside a flow" beat. *Simplified* means: drop the CF-4 dark-matter volumetric and ship with point cloud + a single illustrative flow-line overlay or a static density-coloured backdrop. Shell still reads as "Laniakea" without the full volumetric. |
| 8 | Cosmic Web | Already exists. This is skymap's home turf — point cloud + DisPerSE filaments at the Gpc scale. Free shell, basically. |
| 9 | Observable Universe | The closing punch. CMB sphere + faint cosmic web inside. The single most quotable visual of the tour. |

Five shells, each with a hero visual, each at a recognisably distinct scale, each defended by a clear reason to be in the MVP.

The cuts: shells 1 (Solar System), 2 (Stellar Neighborhood), 3 (Milky Way), and 5 (Local Sheet). Rationale follows.

## 3. What's cut from MVP and why

### Shell 1 — Solar System

**Cost:** A new ephemeris pipeline (JPL DE440 ingestion, orbital-element conversion, planet billboard renderer, ray-traced Sun). None of this code exists in skymap today; the renderer assumes Mpc throughout, and the Sun shader is a research spike. See [`../shells/01-solar-system.md`](../shells/01-solar-system.md) for the technique catalogue.

**Why deferable:** The Solar System beat is *gorgeous* and a great opener, but it is also the shell most easily missed. Visitors arriving from r/Astronomy already have a strong mental image of the Solar System; we are not introducing them to an unfamiliar concept. We *are* introducing them to Laniakea, the cosmic web, and the CMB. Cutting Shell 1 trades a known-quantity intro for development time on the unknown-quantity reveals.

**Path back:** Shell 1 can be added as a self-contained pre-roll that simply prepends to the tour script — no other shell depends on it. The scale architecture refactor (described in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)) must be done in MVP regardless, so the AU-scale frame is already supported when Shell 1 ships.

### Shell 2 — Stellar Neighborhood

**Cost:** Gaia DR3 ingestion (the cut to ≤50 pc is a small subset, but the full pipeline — parallax-derived 3D positions, B-V to display colour, magnitude-to-render-size — is a moderate amount of new code). New star renderer that diverges from the galaxy point pipeline because stars want real colours and individual identity rather than statistical clumps.

**Why deferable:** Like Shell 1, the stellar neighbourhood is a familiar concept and a beautiful-but-skippable beat. The tour can transition from "the Sun" (one frame of context) directly to "we're in a galaxy" without losing narrative coherence. The user does not need to be told that stars exist.

**Path back:** Independent dataset and renderer; slots in between Shell 1 and Shell 3 with no impact on later shells. This is a Phase 2 add-on after MVP ships and we know visitors are completing the tour.

### Shell 3 — Milky Way

**Cost:** Depends on the Milky Way impostor plan, which has not landed yet (see [`../SUMMARY.md`](../SUMMARY.md), "What it depends on" table). Shipping Shell 3 in the MVP would mean either blocking on that plan or building a placeholder MW disk that we'll replace later — and a placeholder MW is exactly the kind of "embarrassing compromise" the visual quality bar forbids.

**Why deferable:** The MW impostor is the right hero visual; without it, this shell would land at a quality bar below the rest of the MVP. Better to skip than to ship a textured-sphere MW that looks like a 90s screensaver.

**Path back:** Drop in as soon as the MW impostor plan ships. The shell schema and asset-loading slot can be reserved in MVP without rendering anything.

### Shell 5 — Local Sheet

**Cost:** Tully 2GC ingestion and a group-colour pass on the existing point cloud. Technically lightweight, but it is *narratively* the most redundant shell.

**Why deferable:** The Local Group (Shell 4) already conveys "we live in a structure of galaxies." Adding the Local Sheet as a separate shell repeats that beat at slightly larger scale without adding a new conceptual reveal. In a 50-second tour, two shells with the same emotional payload is one too many. The Local Sheet *is* a real and interesting structure, but it is the easiest cut to defend in a ruthless pruning exercise.

**Path back:** Trivial. Same point-cloud renderer, new dataset slot, new tour beat. Reintroduce it in v1.1 as a "depth" addition for repeat visitors.

## 4. MVP visual quality bar

The cut shells are cut precisely so that **every shell that survives** can hit the same quality bar as the full plan. No "MVP-grade" half-renderers. No flat-shaded placeholders. No "we'll polish this later." Specifically:

- Local Group renders MW + M31 + M33 as proper textured disks with halo glow; dwarfs as soft fuzzies. No point-sprite stand-ins for the major members.
- Virgo Supercluster shows real cluster positions with at least one of (X-ray halos, point-glow halos, cluster-name labels). At least one of these must look beautiful even if the others are deferred.
- Laniakea-simplified must still convey *flow*. If we cut the full CF-4 volumetric, the replacement (a single set of streamline ribbons, or a pre-baked density texture wrapped on the camera frustum) must be visibly authored, not a fallback. The "simplified" in the name is a budget choice, not an apology.
- Cosmic Web ships at the existing skymap quality — that's the floor, and it is already good.
- Observable Universe must show real Planck SMICA data as the inside-sphere texture, with real cosmic-web galaxies fading in front of it. A static JPEG fallback (the per-shell fallback in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)) is acceptable as a degradation path but not as the MVP target.

If any shell *cannot* hit its quality bar in the MVP timeline, the choice is to **cut the shell from MVP**, not to ship it at lower quality. This is the inversion of the usual MVP instinct and it is intentional: visual quality is the entire competitive differentiator. A five-shell tour at full quality beats a nine-shell tour at compromised quality.

## 5. MVP camera path

The full tour is ~90 seconds across nine shells (~10 s/shell average). The MVP runs ~50 seconds across five shells, with shell timings rebalanced to avoid feeling rushed:

| Shell | Time | Notes |
|-------|------|-------|
| Open | 4 s | Title card / "Take the tour" → camera approach into Local Group barycentre |
| 4 — Local Group | 10 s | Slow orbit around MW + M31 pair; dwarfs visible |
| Transition | 3 s | Continuous pull-back; LG collapses to a point |
| 6 — Virgo Supercluster | 10 s | Camera reframes on Virgo cluster; halos fade in |
| Transition | 3 s | Pull back; Virgo recedes |
| 7 — Laniakea | 8 s | Camera pans along the simplified flow lines |
| Transition | 3 s | Pull back into Gpc scale |
| 8 — Cosmic Web | 6 s | Filaments + galaxy points; brief sweep |
| Transition | 2 s | Pull back to CMB shell radius |
| 9 — Observable Universe | 6 s | CMB sphere fade-in; closing line |
| Outro | 3 s | Camera holds; "Replay tour" button appears |

Total: ~58 s. Slightly more than half the full runtime, but with five shells instead of nine the per-shell dwell is *higher*, not lower — viewers get to read the overlay copy rather than chase it.

The transition beats are critical: because we are skipping Shells 1, 2, 3, and 5, the camera has bigger jumps to make between consecutive kept shells. Each transition must remain a continuous camera motion at log-scale constant speed (Principle 3 from the product vision) — no hard cuts. The choreography engine ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md)) must support multi-leg eased pulls that span several orders of magnitude in a single transition without breaking the visual continuity.

## 6. MVP overlay copy

The overlay copy must bridge the gaps left by the cut shells. Rather than re-using the full-tour copy verbatim, MVP rewrites the opening beats and several transition lines to make the larger jumps feel intentional. Drafts (subject to science review per [`../vision/00-product-vision.md`](../vision/00-product-vision.md) success criterion 3):

- **Open:** "We're starting close to home." (beat) "This is the Local Group — the cluster of galaxies we live in. The big spiral on the left is our Milky Way."
- **Local Group → Virgo:** "Pulling back a thousand-fold. Every dot is now a galaxy."
- **Virgo:** "This is the Virgo Supercluster — about a hundred thousand galaxies bound together. The bright knot at the centre is the Virgo Cluster itself."
- **Virgo → Laniakea:** "Bigger still. Our supercluster is part of a larger flow."
- **Laniakea:** "This is Laniakea — Hawaiian for *immense heaven*. We're inside it, falling toward the Great Attractor."
- **Laniakea → Cosmic Web:** "At this scale, galaxies aren't islands. They're knots in a web."
- **Cosmic Web:** "Filaments of dark matter, traced by the galaxies they hold. Voids between them, hundreds of millions of light-years across."
- **Cosmic Web → Observable Universe:** "And the edge."
- **Observable Universe:** "13.8 billion light-years in every direction. Everything we just flew through is inside this sphere."

The cut from "Local Group" straight to "Virgo" is the riskiest copy gap; it skips three shells of intermediate scale. The mitigation is the explicit **"Pulling back a thousand-fold"** line, which names the jump and makes the user complicit in the scale change rather than confused by it. Test this with the usability-testing cohort early.

## 7. MVP success criteria

Same five criteria as in [`../vision/00-product-vision.md`](../vision/00-product-vision.md) ("How we'll know it's done"), with one numerical adjustment:

1. First-time visitor completes the tour with zero errors and zero confusion. **Unchanged.**
2. The 30-second tour clip looks impressive enough to post. **Unchanged** — a 30-second clip from the MVP can comfortably feature the Virgo→Laniakea→Cosmic-Web→CMB sequence, which is the most striking part of the full tour anyway.
3. All copy reviewed by an astronomy-literate human. **Unchanged**, and easier — five shells worth of copy rather than nine.
4. Mobile fallback works on a $300 Android device. **Unchanged.**
5. Lighthouse accessibility audit passes. **Unchanged.**

The engagement metric (median session duration > 2 minutes for tour clickers) is unchanged but worth flagging: a 50-second tour earns the user only 50 seconds of attention; the next 70+ seconds must come from onward exploration. This means the MVP's onward-exploration affordances ("Replay tour," free-fly drop-in, the existing search/info-card UI) are *more* important than in the full plan, not less.

## 8. Path from MVP to full

Each cut shell is structured to slot back in without re-architecture:

- **Shell 1 (Solar System).** Self-contained pre-roll. Add the ephemeris pipeline, the Sun renderer, the planet billboard pass; prepend to the tour script. The scale architecture refactor (which MVP must ship) already supports the AU frame. Estimated 3–4 weeks post-MVP.
- **Shell 2 (Stellar Neighborhood).** Independent dataset and renderer; slots between Shell 1 and Shell 3. Gaia DR3 ingestion is the largest single piece. Estimated 2–3 weeks.
- **Shell 3 (Milky Way).** Blocks on the MW impostor plan. When that lands, Shell 3 is ~1 week of integration work — the asset slot and tour-beat hook are reserved in MVP.
- **Shell 5 (Local Sheet).** Trivial reuse of existing point-cloud renderer with a Tully-2GC dataset and a group-colour pass. Estimated 1 week.

None of these adds requires touching MVP-shipped code beyond the tour script and the asset loader's shell registry. That is a deliberate consequence of designing the MVP around the same scale architecture and choreography engine as the full plan.

## 9. Decision points before committing to MVP scope

Before greenlighting MVP scope, confirm:

1. **Is the Laniakea-simplified visual still impressive?** Sketch it. If the simplified version reads as "more cosmic web" rather than as "Laniakea, the place we live," the shell needs the full volumetric or it should be cut entirely and absorbed into the Cosmic Web shell.
2. **Does the Local Group → Virgo copy bridge actually work?** Storyboard the transition. If the cut from kpc-scale dwarfs to Mpc-scale superclusters feels disorienting in storyboard, we need to either keep Shell 5 or insert an explicit "we are now zooming way out" beat.
3. **Are MSDF labels and the asset loader actually on track to land before MVP starts?** The MVP is gated on the same Phase 0 prerequisites as the full plan. If those slip, the MVP slips with them. The MVP does not save Phase 0 time.
4. **Is the team morally OK shipping without Shell 1?** The Solar System opener is the most quotable beat for non-astronomy audiences. Cutting it is a marketing trade-off as much as an engineering one. Confirm that the marketing/launch plan does not depend on a Solar System hero shot.

## 10. Open questions

- **Should "MVP" be marketed as v1 or as a beta?** A "v1 — five-shell tour" frames the cut shells as future expansion; a "beta — Powers of Ten preview" frames them as known omissions. The framing changes how visitors perceive the missing shells.
- **Does the MVP get its own URL flag** (e.g., `?tour=mvp`) for staged rollout, or do we cut over the production tour atomically?
- **Is Shell 7 (Laniakea-simplified) a hard requirement of MVP, or is the four-shell variant** (LG, Virgo, Cosmic Web, CMB) **viable?** Cutting Laniakea entirely shrinks scope further but loses the "we're inside a flow" beat — arguably the most distinctive single concept in the tour. Defer this decision until the simplified Laniakea sketch is reviewed.
- **What is the loading-screen story for MVP?** The full plan pre-loads all nine shells in parallel during the tour intro. MVP pre-loads five, which is faster, but the asset-loader primitive must still be production-ready. If the asset loader slips, can MVP fall back to a serial load with a visible progress indicator without breaking the cinematic feel?
- **How do we measure "still impressive"** before launch? The 30-second clip self-validation is subjective. Consider a small pre-launch poll (the team plus 3–5 trusted external viewers) to gate on.

These should be resolved in the implementation kickoff before any code is cut against the MVP scope.
