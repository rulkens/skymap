# Grill Session: Full Bloom Pass (Sun / Planets / Stars / Milky Way) — 2026-07-21

Source: user request in the `sun-full-bloom-pass` worktree session — "I'd love for the sun
(and possibly planets, milky way and other stars) to go through a full bloom pass (stacked
layer, good quality). What are our options and what is the expected performance hit."

Goal: give the bright emissive layers a real multi-scale screen-space bloom (stacked mip
pyramid, good quality) instead of the current situation where the resolved Sun disc has
zero glow and point-stars rely on single-pass sprite halos. The session was grounded in a
codebase exploration that mapped the existing HDR chain, the galaxy-renderer dev tool's
complete bloom implementation, and the perf-harness baseline.

Load-bearing exploration findings referenced below:

- The main app already accumulates all additive world light in an `rgba16float` `hdr`
  target and tone-maps once via the compositor (`renderTargets.ts`, `frameProgram.ts`) —
  but the frame currently tone-maps **twice**: `hdr → swap` (replace) and later
  `foreground:0 → swap` (over), with the Sun disc + planets living in `foreground:0`.
- `tools/galaxy-renderer/` contains a production-grade dual-filter bloom (soft-knee bright
  pass + Karis firefly clamp, 4 downsamples, 4 tent-filter additive upsamples, composite)
  in portable WESL — the lift-and-adapt candidate.
- The resolved Sun disc (`starRenderer` sphere branch) is flat emissive with no halo; the
  unresolved star branches and Milky Way already have additive sprite glow compressed by
  `starKnee` before it lands in `hdr`.
- The planet-atmospherics plan deferred a "dark-limb twilight bleed needs an ADDITIVE
  glow" item, and Saturn-ring-brightness is in the backlog — both in bloom's blast radius.
- Perf baseline: `solar-system` scenario already at 16.9 ms (over 60 fps budget),
  dominated by vertex-bound star passes (`docs/backlog/2026-07-21-perf-harness-findings.md`).

---

## Q1: Bloom scope — whole-scene HDR post-pass or selected layers?

**The question:** Should everything bright in the frame bloom (physically consistent
threshold on the whole scene), or should only designated emissive layers (Sun, planets,
stars, Milky Way) feed the bloom, leaving the survey galaxy points untouched?

**Considerations:**

- **Option A (selective layers):** Only the tagged emissive layers contribute; galaxy
  points/thumbnails/UI stay crisp. Full artistic control per layer, no risk of 2.5M
  survey points shimmering in the blur chain.
- **Option B (whole-scene HDR):** Anything above a brightness threshold blooms.
  Physically consistent — galaxy cores and dense fields glow too — but harder to tune,
  and survey-point noise can flicker through the mip chain.
- **Option C (hybrid):** Whole-scene target with a per-layer bloom-strength aux channel.
  Most flexible, most plumbing.

**Decision:** Selective layers (Option A). The survey point cloud is the app's data
product and must stay crisp; the bloom is an aesthetic treatment for the physical
foreground/stellar layers. (Q4 later softens the mechanism: selectivity is implemented
by threshold placement rather than by physical exclusion, which conserves the intent at
zero extra draw cost.)

## Q2: Performance budget and platform bar

**The question:** How many milliseconds may bloom cost, and does iOS constrain the
design?

**Considerations:**

- **Option A (~1–2 ms desktop, iOS must work):** Bloom stays a small frame slice; quality
  tuned within that.
- **Option B (quality first, ~3–5 ms OK):** Prioritize the stacked multi-mip look; iOS
  must not break but may drop to a cheaper variant.
- **Option C (desktop-only):** Gate the feature off on iOS entirely.

**Decision:** Quality first, ~3–5 ms acceptable (Option B). Mid-session the user added
"we will tune for performance once you built it" — so perf work is explicitly a
post-build tuning phase, measured with `npm run perf --scenario solar-system`
before/after rather than designed-in up front. Relevant risk noted: `solar-system` is
already over budget at 16.9 ms, so the tuning phase has real work to do.

## Q3: How does the bloom get its input light?

**The question:** The selective layers live in exactly two existing textures — stars +
Milky Way in `hdr` (mixed with survey points), Sun + planets in `foreground:0`. A
*literal* selective implementation needs a third target that only tagged layers draw
into — but that re-draws the vertex-bound star catalog (~6 ms duplicated in the worst
scenario), blowing the budget on input rather than blur.

**Considerations:**

- **Option A (threshold existing targets):** Bright-pass reads the already-rendered
  textures with a soft-knee threshold tuned above survey-point brightness. Zero extra
  scene draws — selectivity comes from threshold placement + per-layer emissive scale.
  Risk: an extremely bright galaxy core could sneak into the bloom (tunable, and
  arguably correct anyway).
- **Option B (dedicated bloom-source target):** Tagged layers draw into their own
  `rgba16float` source. Perfect selectivity, but duplicates the vertex-bound star draws
  or forces restructuring those layers out of `hdr` entirely.
- **Option C (bloom `foreground:0` only):** Only Sun + planets bloom. Cheapest, most
  targeted, but no true bloom on the star field — half the original wish.

**Decision:** Threshold the existing targets (Option A). The Q1 "selective" intent is
preserved because the survey points are far dimmer than the knee-compressed star cores —
threshold placement does the selecting. This also means the bloom chain is pure
fullscreen passes: cost is resolution-bound, independent of scene complexity.

## Q4: Frame-graph placement — how does bloom get a single linear input?

**The question:** Bloom must run on linear pre-tonemap light and needs both `hdr` and
`foreground:0`. Today the frame tone-maps the two targets separately (steps 7 and 10 of
`frameProgram`), which is directly in the way.

**Considerations:**

- **Option A (merge fg→hdr pre-tonemap):** Reorder `foreground:0` to render earlier and
  composite it *over* `hdr` in linear light; the frame then has exactly ONE tone-map.
  Simpler and more physically correct (`tonemap(fg over hdr)` instead of
  `tonemap(fg) over tonemap(hdr)`); bloom sees Sun + stars in one texture. Cost: a
  frame-graph reorder + one extra fullscreen over-composite; slight (likely
  imperceptible-to-better) look change where bodies overlap starlight.
- **Option B (two-texture bright pass, keep structure):** Bright pass samples both
  textures and merges them itself. Avoids the tone-map reorder but still needs a partial
  render reorder, and bloom light gets added around two separate tonemaps — fiddlier
  composite math that stays subtly wrong.
- **Option C (bloom `hdr` only for v1):** No foreground changes; Sun gets a shader-side
  corona later. Minimal restructure but the headline ask (Sun bloom) is unserved.

**Decision:** Merge foreground into hdr pre-tonemap (Option A), shipped as its own
ground-preparation PR before the feature PR (per the refactor-ground convention). The
unification is independently valuable: one tone-map instead of two is a simplification
and a correctness improvement even if bloom never lands.

## Q5: Pyramid shape

**The question:** What resolution/depth for the mip pyramid — the quality/cost dial.

**Considerations:**

- **Option A (5-mip, half-res mip0):** Lift the tool's proven stack as-is: half-res mip0
  → 1/32-res mip4; bright + 4 down + 4 up + composite ≈ 9 small fullscreen passes with
  geometrically shrinking fill. Est. ~1–2 ms at dpr-2 desktop.
- **Option B (6-mip, full-res mip0):** Adds a full-res level for a crisper tight halo at
  the Sun's limb. ~3–4× the fill cost (~3–5 ms) for a subtlety mostly visible on the
  resolved disc only.
- **Option C (quarter-res mip0, 4 mips):** Cheapest (<1 ms), wider dreamy halo, but
  visible shimmer on small bright movers — the artifact Karis averaging fights gets
  worse at quarter res.

**Decision:** 5-mip pyramid with half-res mip0 (Option A). The tight glow core is
already served by the existing sprite glow + the tent upsample's finest level; spending
3–4× on a full-res mip is not where the quality lives. Well inside the Q2 budget.

## Q6: Coexistence with the existing star sprite-glow and starKnee

**The question:** Star light in `hdr` is already compressed — `starKnee` soft-caps each
glow before write, and every point-star already carries a Gaussian sprite halo. So (a)
the bright-pass threshold must sit *below* the knee ceiling or stars can never cross it,
and (b) stars would wear two halos (sprite + bloom).

**Considerations:**

- **Option A (coexist, threshold near knee ceiling):** Sprite glow untouched (it is the
  sub-pixel PSF — a screen-space bloom cannot replace it for sub-pixel sources). Bloom
  threshold just under the knee ceiling so only near-saturated cores (Sun, brightest
  stars, dense Milky Way ridge) contribute. Double-halo risk confined to the brightest
  few sources, where it reads as intentional.
- **Option B (retune sprite glow down where bloom takes over):** More principled
  single-system look, but risks regressing the carefully tuned star field and couples
  two systems' tuning.
- **Option C (stars below threshold entirely):** Threshold above the knee ceiling — only
  the Sun disc + lit planet limbs bloom. Safest, but the star field and Milky Way get
  none of the requested bloom.

**Decision:** Coexist, threshold near the knee ceiling (Option A). Revisit sprite-glow
retuning only if the combined look reads milky in practice — that call belongs to the
post-build tuning phase (Q2 addendum).

## Q7: Remaining defaults (set without grilling, per the user's "tune later" signal)

- **iOS:** same pipeline everywhere. The chain is plain 2D-texture WGSL (no
  `texture_1d`, no WebKit-hostile constructs); verify on device before merge because of
  the shared-encoder silent-blank-frame trap.
- **Settings:** minimal `settings.bloom` group — `enabled`, `strength`, `threshold` —
  mirroring the `settings.tonemap` precedent.
- **Scope exclusions:** the deferred additive twilight glow and the Saturn-ring
  brightness retune stay out of scope. Bloom plausibly improves both for free (bright
  limb light now bleeds); their backlog entries stay until that is visually confirmed.
- **Perf harness:** new passes get a `PASS_GROUP_TITLES` group so `npm run perf` and the
  DebugPanel bucket them; baseline + after measured on `solar-system`.

---

## Approved design (one paragraph)

Ground-prep PR: reorder `foreground:0` before the tone-map step and composite it over
`hdr` in linear light, leaving exactly one tone-map (`hdr → swap`). Feature PR: port the
galaxy-renderer tool's bloom WESL into `src/services/gpu/shaders/bloom/` — soft-knee
bright pass (threshold just under the starKnee ceiling) + firefly clamp into a half-res
mip0, 4 dual-filter downsamples (Karis on level 0), 4 tent-filter additive upsamples,
then `bloomMip0 × strength` additive-composited back into `hdr` via the existing
compositor (tone `null`), so the existing tone-map composite needs zero changes. Five
new pyramid rows (`scale` 2/4/8/16/32, `rgba16float`) in the render-target table;
`settings.bloom {enabled, strength, threshold}`; est. ~1–2 ms at dpr-2, measured and
tuned post-build.
