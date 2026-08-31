# Grill Session: Edenhofer local dust volume — 2026-08-19

Source: backlog item `docs/backlog/2026-07-18-local-dust-volume.md`, plus the
same-day design research (PR #581) that answered its slab and compositing
questions. Context the session was told up front: the analytic Milky Way is
expected to supersede the v1 sprite Milky Way soonish, and an implementation
order was wanted.

Goal: turn the Edenhofer et al. 2024 3D dust map (±1.25 kpc, ZGR23 extinction
density, CC-BY 4.0) into a raymarched absorptive SCFD volume — the measured
local companion to the Gaia star field — resolving every open design fork
before the spec is written.

---

## Q1: Sequencing vs the analytic Milky Way

**The question:** The dust renderer slice touches the `(hdr, NEAR0)`
layer-registration order and the frame program — the same ground the
analytic-MW landing will churn (it deletes the v1 `milkyWayLayer` dust pass
and likely reshapes `mw-aggregate`). Which lands first?

**Considerations:**

- **Option A (dust renderer first):** dust integrates against v1's layer
  order; the MW swap must then preserve the "dust fold after MW emission"
  invariant when it rewires. Dust becomes visible in-app sooner.
- **Option B (analytic MW first):** the dust fold integrates once, against
  the final MW layer set, and the seam tuning happens against the dust
  representation that will actually ship next to it. Costs nothing in
  calendar time because the dust feature's first two steps (fade-band prep
  refactor, data pipeline) don't touch the renderer and proceed in parallel.

**Decision:** Option B. Escape hatch noted: if the analytic MW slips badly,
the dust renderer slice can go first and the MW swap inherits the invariant.
Recommended overall order: (1) per-field fade-band prep refactor now,
(2) data pipeline now in parallel, (3) renderer slice after the
volume-raymarch-acceleration worktree merges AND the analytic MW lands,
(4) seam/band tuning last, against the shipping MW.

## Q2: Cube extent and tier semantics

**The question:** What do the small/medium/large tiers mean for the dust
cube — resolution steps over one extent, or different spatial crops? Needed
before the extract (`interp2box.py` args) can run.

**Considerations:**

- **Option A (tiers = resolution, one ±1.25 kpc extent):** 128³/256³/384³
  ≈ 19.5/9.8/6.5 pc voxels ≈ 4/32/113 MB f16. Mirrors MCPM's tier semantics
  exactly — tier is a quality knob, the scene is identical on every device.
  384³ stays inside the data's native resolution.
- **Option B (small tier = Local Bubble crop):** parsec-scale bubble walls
  on the small tier, but tier switching changes what exists in the scene
  (dust popping in/out between 400 pc and 1.25 kpc) — a new tier semantics
  no other source has.
- **Option C (both axes):** most fidelity, most machinery.

**Decision:** Option A. If the Local Bubble walls ever deserve parsec
voxels, that's a second field (`dust-bubble`) later, not a tier semantic.

## Q3: Mean, sample, or baked median

**The question:** The release ships a 3.25 GB mean+std HEALPix product and a
19.5 GB 12-sample cube. The field is log-normal, so the mean is
systematically brighter than any real realization (haze in the voids). What
scalar do we ship? (Corrected mid-question: SCFD v3 is NOT single-scalar —
it carries a `channels` byte, 1 or 4, so mean+std in one file is possible
via channels=4 with two wasted lanes, or a channels=2 format extension.)

**Considerations:**

- **Option A (mean only, channels=1):** smallest, default `fetch()` artifact,
  official resample path; haze trimmed by existing contrast/trim knobs —
  but a global trim cuts faint-real and faint-fake structure equally.
- **Option B (mean+std, channels=2 extension):** enables live confidence
  fades and a mean↔median blend slider, at the cost of a format bump and
  doubled bytes.
- **Option C (one posterior sample):** crisp, but a 19.5 GB download and an
  arbitrary, silently-canonized sample choice.
- **Option A′ (channels=1, baked median):** the log-normal median is a
  closed-form per-voxel function of mean+std
  (`median = mean / √(1+(std/mean)²)`), and the confidence edge-fade is
  likewise per-voxel — both bakeable offline in `buildDustVolume.ts` from
  the two on-disk cubes. Captures ~all the visual win of Option B (crisp
  clouds, clean voids, dissolving cube edge) with zero format change; loses
  only live tunability and a std-view mode.

**Decision:** Option A′ — channels=1, the builder takes both cubes and bakes
the median via a `--stat mean|median|blend=k` flag (tuned once by A/B). The
channels=2 extension stays in the back pocket for the day live tuning or an
uncertainty view is actually wanted.

## Q4: The inner-69 pc hole

**The question:** The main product's first radial shell is at 69 pc; the
innermost sphere ships only as an integrated-extinction patch (a column, not
a density). The voxel cube therefore has a ~69 pc empty ball around the Sun
— where the camera usually sits.

**Considerations:**

- **Option A (accept the hole, document it):** the missing region is the
  Local Bubble interior — the least dusty place in the volume (that's why
  the reconstruction starts there). Surrounding voxels dominate every
  sightline; zero work.
- **Option B (stitch the auxiliary patch):** requires inventing a radial
  profile for a column — fabricated structure exactly where the science
  says "unresolvable".
- **Option C (smooth constant floor inside 69 pc):** one line; avoids a
  visible density step at the shell boundary if one shows up.

**Decision:** Option A, with C held as the known fix if the first visual
pass shows a perceptible 69 pc shell edge.

## Q5: Gray extinction or reddening

**The question:** The cube stores scalar extinction density; the fold
multiplies HDR by transmittance. Is T one number or three?

**Considerations:**

- **Option A (per-channel RGB via CCM89-style ratios):**
  `T = exp(-τ·(k_r,k_g,k_b))` — dust reddens what it dims, which is the
  visually load-bearing signature (amber dark-nebula edges against the Gaia
  field). Two extra `exp()` per step — free. The galaxy-tool dust work
  already derived the mapping; its lesson applies: reddening only reads
  above τ≈2, so density scaling must not clamp thick cores.
- **Option B (scalar gray T):** simpler; reads as smoke; upgrading later
  touches the shader contract anyway.

**Decision:** Option A — with **R_V as a knob** (user overrode the
recommendation to pin 3.1), living in the dust debug section.

## Q6: `dust-volume` target resolution

**The question:** The pass needs its own target row (different slab + fold
than the additive `volume` target); what `scale`?

**Considerations:**

- **Option A (scale 2, half-res):** the galaxy tool's measured landing spot
  for dust (dustDivisor 2 vs 6 for emission); 4× cheaper fragments than
  full-res. Known cost: silhouette softening; known failure mode on file
  (shimmer when the map outruns its consumer — fix is a mip chain).
- **Option B (full-res):** sharpest silhouettes, but a full-screen full-res
  raymarch is the heaviest thing in the frame; the v1 MW dust "full-res"
  precedent is a splat pass, not a march.
- **Option C (scale 3, match cosmic web):** cheapest; tuned for glow, not
  silhouettes.

**Decision:** Option A, with the scale **as a knob** in the dust debug
section, and a perf-harness A/B against full-res as a plan tuning task.

## Q7: Settings surface

**The question:** The generic volume row carries a palette picker
(meaningless for a multiplicative field) and none of the dust knobs. Where
does dust live in the UI?

**Considerations:**

- **Option A (two-tier split):** data lifecycle (on/off, tier, fetch) rides
  the generic volume-source row; knobs (R_V, target scale, stat blend,
  density/trim, band edges) go in a dedicated registry-driven dust tuning
  section in the debug panel, mirroring `MilkyWayTuningSection`. Palette
  picker suppressed via a `paletteless`-style registry flag.
- **Option B (fully bespoke section):** forks the volume plumbing that
  already works generically.
- **Option C (knobs on the generic row):** R_V/scale controls polluting
  MCPM/CF4 rows.

**Decision:** Option A.

## Q8: Fade-band edges

**The question:** The per-field band refactor exists to carry dust's bands —
what are the edges? Two decisions: the outer (recede) handoff to procedural
galactic dust, and whether the march ever stops at planetary zoom (the
`surveyDeepZoom` guard that used to kill volumes inside 2 kpc is exactly
what dust escapes).

**Considerations:**

- **Outer A (match the Gaia crossfade — full ≤8 kpc, gone ≥25 kpc):** the
  measured local scene (Gaia stars + the dust measured from those stars)
  arrives and leaves as one regime; the handoff to procedural MW dust
  happens where the handoff to procedural MW stars already does. One fewer
  independent band.
- **Outer B (tighter, 2→10 kpc):** dust dies before its stars; no benefit.
- **Inner C (gone below ~0.1 pc, full above ~1 pc):** imperceptible (at
  sub-parsec distance the dust sky is the atmosphere/foreground's job) and
  zeroes the march at planetary zoom via `hasActiveFields`.
- **Inner D (no inner edge):** permanent raymarch tax at Earth zoom for
  nothing visible.

**Decision:** A + C, **all four edges tunable** in the dust debug section
for now, not baked constants.

## Q9: The fold's depth problem

**The question:** A screen-space multiplicative fold has no per-source
depth — it dims stars physically in front of the cloud too. What does v1
ship? (Follow-up asked and answered: from Earth, the cube contains the real
Great Rift/Coalsack — they're local dust — but 6.5–10 pc voxels subtend
1.5–4° at 150–600 pc, so the inside view is soft; the crisp Earth-sky
answer is a separate cheap artifact, an all-sky integrated-extinction
panorama baked from the native HEALPix product. Perf: fold ordering is
free (~0.05 ms); the march is the cost, ~1.5–3 ms worst-pose at scale 2
pre-acceleration; depth-sliced tau is ~3–4× map bandwidth plus real shader
complexity.)

**Considerations:**

- **Option A (whole-fold after the star layers):** same artifact class as
  the shipped v1 MW dust; the error is smallest where it matters (bright
  foreground stars sit in locally thin dust); dark-nebula silhouettes — the
  headline visual — are correct; the fold also dims the cosmological
  background already in HDR, i.e. the real zone of avoidance for free.
- **Option B (fold before stars):** stars never dim — deletes the point.
- **Option C (depth-sliced from day one):** correct; the single heaviest
  piece of the tool's dust work; lands naturally WITH the analytic MW —
  building it twice is waste.

**Decision:** Option A for v1. Depth-sliced compositing is named in the
spec as the shared follow-up that the analytic MW and the dust volume adopt
together — one mechanism, both consumers.

## Q10: PR packaging — the prep refactor

**The question:** Does the per-field fade-band un-braiding ride the dust
feature PR or land alone? (Explicit ask by house rule, no default.)

**Considerations:**

- **Option A (own PR, first):** it changes behavior-relevant plumbing for
  existing fields (MCPM, CF4, polyphorm all key off `surveyDeepZoom`
  today), deserving its own review surface and revert; per Q1 the renderer
  slice waits anyway, so there's no bundling win — the prep soaks in main
  while the analytic MW lands.
- **Option B (rides the feature PR):** couples an existing-field behavior
  change to a feature merging much later.

**Decision:** Option A.

## Q11: PR packaging — the docs

**The question:** Spec + this transcript: same PR as implementation, or a
docs-first PR? (Explicit ask by house rule.)

**Considerations:**

- **Option A (docs PR first):** implementation is deliberately deferred
  (Q1), so a bundled spec would sit on a stale branch for weeks. The docs
  PR lands the spec + transcript now, and per backlog hygiene the same
  change deletes the backlog index line + detail file (the spec supersedes
  them). The data-pipeline PR then references the merged spec.
- **Option B (docs ride the first implementation PR):** fine when code
  follows immediately; here it just delays the record.

**Decision:** Option A.

---

## Follow-ups spawned by this session

- **Earth-sky extinction panorama** (new backlog item): bake the native
  HEALPix mean into a 2D all-sky integrated-extinction texture, multiplied
  over the sky at planetary zoom — the crisp from-Earth dark-lane answer
  the cartesian cube can't give (Q9 discussion).
- **Depth-sliced compositing, shared** — the Q9 follow-up, designed once
  for the analytic MW and the dust volume together.
- **`dust-bubble` fine field** — only if the Local Bubble walls ever
  deserve parsec voxels (Q2).
- **channels=2 SCFD extension** — only if live mean↔median tuning or an
  uncertainty view is wanted (Q3).
