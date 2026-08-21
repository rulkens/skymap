# Grill Session: Earth-local render slab — 2026-08-21 (PAUSED)

Source: live debugging conversation on the RTC foundation branch (PR #617). After
three separate f32-precision defects in the Mpc-magnitude near-Earth path (black
nadir blob, planner-matrix collapse, plus the still-open descent island), the
user proposed a dedicated render slab for "everything Earth-related and down"
instead of patching precision leaks one by one.

**Status: PAUSED mid-Q3.** User ruled: ship #617 first, implement Plan 2
(surface navigation), then revisit — the bug this was motivated by may not
survive Plan 2, and Q3's recommendation deliberately places the camera-pose
provider work inside Plan 2 anyway. Resume here afterwards.

Pre-session context established (not decisions, but evidence):

- `slabs.ts` was built for this: "a future third slab … is one more row, not a
  new code path". Two rows today: NEAR0 (origin-relative f64 vp, reversed-Z,
  adaptive `foregroundFrustum`) and COSMO.
- `slabViewOf` narrows every slab vp to f32 before layers see it; the tile draw
  path survives only via an ad-hoc camera rebase (`rebaseViewProj` + narrow).
  A camera-rebased slab makes that the native convention.
- Units must not be Mpc: near-surface values ~1e-21 Mpc court the known
  f32 denormal-flush landmine; km/m units put values in f32's comfort zone.
- Open design problems parked for the resumed session: cross-slab occlusion
  (Earth and Sun/Moon share NEAR0's depth buffer today; splitting Earth out
  loses the depth relationship — silhouette/ordering design needed) and
  altitude-dependent layer→slab assignment (`ContentLayer.slab` is static).

---

## Q1: Camera pose — where does the slab's precision come from?

**The question:** The slab's zoom floor is set by the arithmetic producing the
camera-relative frame each frame, i.e. by where the camera pose is stored. Keep
the heliocentric-Mpc `OrbitCamera` and derive an Earth-relative pose per frame,
or make the camera natively Earth-fixed in the near regime?

**Considerations:**

- **Option A (derive from heliocentric, f64):** ~10-line subtraction behind a
  seam. Floor: the heliocentric f64 magnitudes (~4e-12 Mpc) quantize at ~14 µm
  near Earth — invisible at eye height (0.01 px of parallax at 1.7 m), breaks
  below ~mm. No camera-architecture change.
- **Option B (natively Earth-fixed pose, km f64):** floor ~0.7 nm (f64 at
  Earth-radius magnitude); kills "camera drifts because Earth rotated under
  it" bugs semantically; but it is a camera-architecture change entangled with
  Plan 2's navigation semantics (body-fixed surface hits, surface-fixed
  follow are already-decided Plan 2 shapes).
- Key structural insight: **A is not a stepping stone B replaces — B keeps A.**
  On approach from deep space the camera is heliocentric regardless; the slab
  needs a derived Earth-relative pose the moment it activates, so the (A)
  provider survives as the far-regime source, and (B) is an additive near-
  regime provider with a seamless handoff (same value, different source of
  truth at the flip).

**Decision (recommended, not yet ratified — user pivoted to shipping before
answering):** design the slab against an *anchor-relative camera-pose provider*
seam; ship provider (A) with the slab; land provider (B) inside Plan 2 where
its real motivation (navigation semantics) lives. The user's last word was a
worry — "if we do (a) now, we have to do (b) anyways later" — answered by the
A-survives-as-far-regime-provider argument above; confirm on resume.

## Q2: Slab scope — Earth-specific or near-body generic?

**The question:** One Earth-hardcoded slab row, or a generic "near-body" slab
(Earth first, Moon/Mars-ready)?

**Considerations:**

- **Option A (near-body generic):** frame/units/occlusion design isn't
  Earth-shaped; a later surfaced body becomes a data problem, not a new slab.
  Slightly more design care now. (Recommended at the time.)
- **Option B (Earth-specific):** smallest possible row; a second surfaced body
  later means generalizing then, or a copied row. `SLAB_NAME`'s graceful
  degradation tolerates a later sibling.

**Decision:** **Earth-specific** (user). Smaller spec; generality deferred to
whenever a second surfaced body actually exists.

## Q3: Depth target — how deep must precision hold?

**The question:** The slab's success criterion: eye height (~1.7 m)? Lower?

**Considerations:** The user asked "how far can we push it — zooming into the
eye, would that fit?" Analysis: rendering precision is scale-invariant once
geometry is camera-rebased (f32 error ≈ 6e-8 of distance-from-camera ≈ 0.01
arcsec); the floor is the *stored camera pose*: heliocentric-Mpc f64 → ~14 µm;
Earth-fixed-km f64 → ~0.7 nm (orbit → sub-µm in one slab, the full
Eames-zoom-to-an-iris); below ~nm requires re-anchoring at the object being
entered — a future *anchor parameter*, not a fourth slab.

**Decision (proposed, unratified):** success criterion = camera at 1.7 m eye
height rock solid, with the anchor seam explicit so headroom to ~µm is proven
and deeper regimes are future anchors, not future slabs. Confirm on resume.

---

**On resume:** ratify Q1/Q3, then continue down the tree: what rides the slab
(tiles / base globe / atmosphere / clouds / glint; Moon stays NEAR0), units
(km vs m), activation + handoff vs the base-globe fade, cross-slab occlusion
(the hard one), planner/prepareEarthFrame becoming slab-native, and sequencing
vs Plan 2's camera work. Then refactor-ground, then the spec.
