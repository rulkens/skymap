# Grill Session: Switchable global coordinate frame — 2026-07-22

Source: `docs/backlog/2026-07-22-coordinate-frame-switch.md` (backlog item, filed the day before), picked up via "investigate the backlog item for a different orientation, aligned with the solar system plane".

The world frame is fixed equatorial J2000, so the planets render on a visibly slanted line and there is no way to view the scene ecliptic-up or galactic-up. This session resolved the product scope, mechanism, transition semantics, tour interaction, persistence, and UI surface for a user-facing orientation switch.

Two load-bearing facts established by codebase exploration during the session:

- **The survey data is never rotated.** Every catalog position is baked from (RA, Dec, distance) into equatorial J2000 world coordinates verbatim (`raDecDistToCartesian.ts`); the Milky Way model and solar-system bodies are placed into that frame via exact published rotations. The data layer is principled throughout.
- **The current screen-up is accidental.** The orbit camera hard-codes world +Y as its pole (`updatePosition.ts` Y-up spherical math, `computeViewProj.ts` lookAt up `[0,1,0]`, pan math in `orbitControls.ts`). World +Y is (RA 90°, Dec 0°) — an astronomically meaningless point on the celestial equator (roughly toward Orion). Nobody chose it; it is what falls out of bolting a Y-up graphics camera onto a Z-up dataset. Checked numerically against the supergalactic pole (159° away — not that either). This feature therefore *introduces* a deliberate pole rather than correcting a deliberate one.

---

## Q1: Product-level scope

**The question:** What shape is the feature — a global manual switch, an auto-select-by-scale policy, or a solar-system-only fix?

**Considerations:**

- **Option A (global manual switch):** A settings control (frame "up") that reorients the whole scene; you pick one and it stays. Smallest honest artifact: one setting, one rotation. Auto-select can grow out of it later (auto is just a policy writing the same setting).
- **Option B (auto-select by scale):** Ecliptic inside the solar system, galactic inside the MW, equatorial in the survey, no UI. Attractive endpoint but forces hard questions up front (when exactly does the frame flip during a descent? what happens to orbit controls mid-transition?) before a reoriented view has even been validated.
- **Option C (solar-system-only fix):** Make the solar-system sub-scene read horizontal only when focused there. Braids "which frame am I in" into focus state — the asymmetry/special-case trap.

**Decision:** Option A, with B explicitly deferred. The user expanded the frame list in Q2/Q3 discussion: **four frames — equatorial, ecliptic, galactic, supergalactic** (the supergalactic basis already exists in the repo as `superGalacticTransform.ts`, used to rotate the CF-4/MCPM volumes into world coordinates).

## Q2: What each frame option means (and what "equatorial" means, given the accidental Y-up)

**The question:** Each option should mean "that frame's north pole is up". But for equatorial there were two candidate meanings, because today's up is not celestial north — it's the accidental +Y.

**Considerations:**

- **Option A (celestial-north-up):** Polaris up, celestial equator horizontal — principled, matches every sky atlas, matches how the source catalogs are organized (RA/Dec). Visibly changes today's default orientation unless the boot pose is re-seeded.
- **Option B (legacy Y-up):** "Equatorial" preserves today's exact orientation — zero visual churn, but the option's name lies (its pole is a random equator point) and every future frame feature inherits the lie.

Clarified along the way: the celestial equator is Earth's *spin* plane, not the planets' orbital plane — equatorial mode cannot fix the planet slant regardless (only ecliptic-up levels the planets; the two frames differ by the 23.44° obliquity and share only the equinox +x axis).

**Decision:** Option A — every frame option means "that frame's north pole is up"; the legacy Y-up pole is deleted, not enshrined. Boot pose and other authored poses get re-seeded in the same change (see Q5).

**Default frame: ecliptic** (user decision). The resulting 23.44° tilt of Earth's axis in the solar-system view is a feature — that is what obliquity looks like from the ecliptic.

## Q3: Mechanism — where the rotation lives

**The question:** The backlog had already argued view-side rotation over world rebase. Within view-side, two shapes remained.

**Considerations:**

- **Option A (frame-aware camera pole):** The orbit camera gains a frame basis; `updatePosition` maps its spherical direction through the basis, `computeViewProj` uses the frame pole as lookAt-up, pan uses `right = forward × frameUp`. Camera position/target stay world-equatorial. No shader, data, picking, or engine-logic changes — "world space" keeps meaning one thing everywhere.
- **Option B (rotation prefix in viewProj):** Keep the camera Y-up and rotate the world into display space (`viewProj' = proj · view · R`). Splits the codebase into two coordinate conventions: every CPU-side comparison of `cam.position` against world-space positions (thumbnail gating, slabs, foci resolution, gizmos) straddles the seam. World-rebase wearing a trench coat.

**Decision:** Option A. It also hangs naturally off a frame registry — one basis table serving the camera math, and a candidate single home for the duplicated galactic literals (TS + WESL) and `superGalacticTransform.ts`.

## Q4: What the switch animation animates

**The question:** When the frame changes, the camera has a position, target, and current screen-up. What moves?

**Considerations:**

- **Option A (hold the pose, roll the image):** Keep `position` and `target` fixed; animate only the up-vector along the great circle from old pole to new pole. With eye and target fixed, a changing up-vector is geometrically a pure roll around the view axis — the subject stays centered and at the same distance while the world rights itself. At animation end, re-derive yaw/pitch from the unchanged position in the new basis.
- **Option B (hold yaw/pitch numbers, swing the camera):** Slerp the basis under fixed spherical coordinates — the camera physically sweeps through space, the subject drifts off-center, and the camera ends somewhere else in world space, for no user benefit.

**Decision:** Option A, strongly. Edge case recorded for the spec: if the view direction is nearly parallel to the new pole, the end-state yaw is ill-conditioned and post-switch pitch sits at the clamp — handled by the existing `PITCH_LIMIT` clamp, worth a test.

## Q5: Policy for authored yaw/pitch literals (tours, boot pose)

**The question:** Tour clips express poses as `{target, yaw, pitch, distance}` in the current Y-up convention. Deep links are safe (the URL hash carries only `focus` + `t`, no raw pose). Derived poses (path tangents in `buildPathTrack`, foci framing, relative `spin('yaw', {by})` moves — the bulk of choreography) are world-invariant as long as the yaw/pitch encoder and decoder share the same basis. What breaks is the handful of authored absolute literals: `cosmicFlows.ts:72`, `earthFlyout.ts` opening angles, `grandTourBeats` waypoint pins, and the boot pose in `cameraSlice.ts:57`.

**Considerations:**

- **Option A (reinterpret in the active frame + one-time re-tune):** Yaw/pitch always mean "in the current frame". The literals get re-tuned once under the new ecliptic default — a re-tune they need anyway because the default changes. A clip played in a non-default frame opens at a slightly rotated angle; relative choreography holds. No new machinery.
- **Option B (per-clip authoring-frame tag):** Clips declare their frame; the compiler converts. World-exact playback everywhere, but braids frame-awareness into the clip compiler and burdens every future clip author.
- **Option C (pin the frame during playback):** Tours force a frame while playing. The user's setting silently stops applying — a special case to defend forever.

**Decision:** Option A. If a specific beat ever genuinely breaks in a non-default frame, that is a targeted waypoint-pin fix, not a framework. Implementation note: encoder and decoder must go through one shared frame-aware `worldDir ↔ yaw/pitch` util pair — which also deletes the duplicated Y-up spherical formula inlined at `buildPathTrack.ts:237-241`.

## Q6: Frame switch while a tween/clip is driving the camera

**The question:** The Q4 answer assumed an idle camera. What happens when the switch lands during a focus fly-to or a playing clip?

**Considerations:**

- **Option A (one mechanism — the basis itself slerps, always):** The switch is a ~1s slerp of the frame basis `B(t)` consumed by the yaw/pitch encode/decode and the lookAt-up. Idle camera: yaw/pitch re-encoded each frame so the world pose holds — which *is* the Q4 roll, same code path. Driven camera: the driver's yaw/pitch values decode through the moving basis; the view swings slightly during the overlap but stays continuous, with no end-of-transition jump. No disabled states, no queues.
- **Option B (disable the control while anything drives the camera):** Leaks animation state into the settings UI; "why is this dropdown disabled" forever.
- **Option C (queue the switch until the driver finishes):** Pending-switch state plus a surprise reorientation seconds after the user acted.

**Decision:** Option A — the frame is just a value that happens to animate; everything downstream reads it per-frame like any other camera input. Quaternion slerp keeps midpoint bases orthonormal for free.

**Addendum (user requirement):** the clip DSL gains a **frame-change primitive with tunable duration/ease** (shape: `frameTo('galactic', { over, ease })`). The UI switch and the clip primitive drive the same slerping basis value; the primitive just authors the timing.

## Q7: Persistence and URL

**The question:** Where does the frame value live, and does it ride the share URL? (Settings are deliberately per-session in this codebase — only the splash version touches localStorage.)

**Considerations:**

- **Option A (settings slice + URL hash param written only when non-default):** Follows the existing grooves — state in the `settings` slice, one more `hashParamSources` entry whose `write` returns `null` at the default, so URLs stay clean for the 95% case and a shared galactic-up view reproduces exactly. At boot, apply the URL frame before the camera seeds — snap, no animation; the slerp is only for interactive switches.
- **Option B (settings only, no URL param):** A shared "look at this!" link renders rotated 60–90° from what the sharer composed — defeats the hash's purpose.
- **Option C (also persist to localStorage):** No precedent; settings deliberately reset per session.

**Decision:** Option A.

## Q8: UI surface

**The question:** Where does the control live and what does it look like?

**Considerations:**

- **Option A (row in the Display section, existing select/dropdown vocabulary):** Display is the view-level section and frame is a pure view preference. Four options is one too many for a segmented control once "Supergalactic" is a label.
- **Option B (new top-level "Camera" section):** Overkill for one row today; right home only if camera settings multiply (roll lock, FOV, …).
- **Option C (on-canvas compass widget):** A different feature.

**Decision:** Option A. Label the row **"Orientation"** (outreach-facing, not "Coordinate frame"), options carrying their own explanations:

- Ecliptic — solar system level *(default)*
- Equatorial — Polaris up
- Galactic — Milky Way level
- Supergalactic — local-supercluster plane

No keyboard shortcut in v1 (crowded namespace, low-frequency toggle). No StatusBar indicator.

---

## Next steps

1. `refactor-ground` over the touchpoints (per convention, before the spec): the frame registry is the obvious candidate joint — four bases + shared `worldDir ↔ yaw/pitch` encode/decode pair; candidates to fold in are the `buildPathTrack` inline Y-up formula, the TS/WESL galactic literal pair, and `superGalacticTransform.ts`.
2. Write the spec against the post-refactor architecture; the spec supersedes `docs/backlog/2026-07-22-coordinate-frame-switch.md` (delete the backlog index line + detail file in the same change, per backlog hygiene).
3. Plan via `writing-plans`, execute via subagent-driven development.
