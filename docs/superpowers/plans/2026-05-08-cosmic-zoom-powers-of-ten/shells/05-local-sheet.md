# Shell 5 — Local Sheet

**Status:** Design draft, awaiting human review.
**Tour beat:** `T+0:47` → `T+0:55` (8 s).
**Native unit:** Mpc.
**Visible volume:** 1–100 Mpc, mostly 5–30 Mpc.
**Origin:** Local Group barycenter (re-used from [Shell 4](04-local-group.md), no re-anchor at the boundary).
**Hero data:** [Tully 2GC galaxy groups](../data/05-tully-galaxy-groups.md) + GLADE galaxies cropped to ≤ 30 Mpc.
**Hero visual:** A flattened galaxy distribution — the user *sees* that nearby galaxies cluster onto the supergalactic plane, not into a sphere.

Cross-references: [shell overview](00-shell-overview.md), [scale architecture](../rendering/00-scale-architecture.md), [narrative script](../vision/01-narrative-script.md), [Tully 2GC data spec](../data/05-tully-galaxy-groups.md).

---

## 1. Overview — the "sheet" reveal

This shell exists for one purpose: to make a single non-obvious fact visually undeniable.

> Galaxies within ~30 Mly of us do not fill space uniformly. They lie on a thin pancake — the **Local Sheet** — only ~6 Mpc thick but tens of Mpc across.

That fact has been in the literature since Tully (1988) and was nailed down quantitatively by Tully, Shaya, Karachentsev et al. (2008): the dispersion of nearby galaxy positions perpendicular to the supergalactic plane is roughly an order of magnitude smaller than the dispersion within it. Every textbook diagram of the Local Volume *shows* this, but it never feels visceral until you fly around the structure in 3D and watch galaxies stay confined to one slab as the camera tilts. That fly-around is what Shell 5 delivers.

Shell 4 (Local Group) is intimate and dwarf-galaxy-detail-rich. Shell 6 (Virgo Supercluster) is dominated by a single giant cluster and X-ray glow. Shell 5 sits between them, and its job is to introduce the **first emergent large-scale structure** the user encounters in the tour. It is the moment the narrative pivots from "inventory of nearby objects" to "the cosmos has shape."

In design language: this is a *texture* shell, not an *iconography* shell. Almost no labels, no glowing volumes, no ray-traced anything. Just thousands of small pinpoints arranged into a recognisable flat pattern, group-coloured to give the eye a few stable landmarks while the camera moves. The information density is high but spatial, not lexical.

## 2. Visible elements

In rough back-to-front render order:

- **Background galaxies (faint, distant)**: any GLADE galaxy in the camera frustum but outside the 30 Mpc working volume, drawn as low-opacity neutral points. Provides a hint of the larger structure to come in Shell 6 without stealing focus.
- **The supergalactic plane indicator**: an optional, very faint, translucent disc at SGZ = 0, ~30 Mpc radius. See [§8](#8-the-supergalactic-plane).
- **Group galaxies**: every member of the 5–10 nearest Tully 2GC groups, point-rendered, coloured by group ID. Brightest few in each group can render as small disk impostors if they exceed an apparent-size threshold, reusing the Shell 4 disk-impostor renderer.
- **Ungrouped (field) galaxies**: GLADE entries within 30 Mpc that don't belong to any retained group, drawn in neutral white at slightly lower opacity than group members.
- **The Local Group remnant**: the user's just-departed home cluster, now just one of many similar clumps near frame center. No special visual treatment — that's the point. (Shell 4's MW + M31 disk impostors fade out across the boundary; in Shell 5 they're sub-pixel.)
- **Named brightest galaxies**: M81, M101, NGC 5128 (Cen A), NGC 253 (Sculptor), and a handful more (see [§9](#9-labels)).

What is *not* visible: dark-matter halos, X-ray gas, velocity flow vectors, filaments. Those are the hero elements of later shells; introducing them here would muddy the "flatness" beat.

## 3. Data requirements

The full data spec for this shell lives in [`../data/05-tully-galaxy-groups.md`](../data/05-tully-galaxy-groups.md). The headline:

- **Tully 2GC** (Tully 2015, "Galaxy Groups: A 2MASS Catalog") — the 2MRS-derived nearby-group catalogue. ~3000 groups within 100 Mpc, each with member list, group center, projected radius, virial mass.
- **GLADE v2.3** — already in skymap; we crop to redshift-distance ≤ 30 Mpc and join on PGC where Tully 2GC provides PGC IDs.
- **Cross-match key:** Tully 2GC publishes the 2MASX (XSC) ID for each member; we already have 2MRS in the loaded catalogues, also keyed by 2MASX. The GLADE crosswalk is via PGC.

Build-time output: `public/data/05-local-sheet.bin`. Format follows [`../data/10-binary-formats.md`](../data/10-binary-formats.md) (still TBD), but the per-point payload is the existing 48-byte point record **plus** a `groupId: u16` and a `groupColorIdx: u8`. Roughly ~50 bytes per point, ~12 000 points, ~600 KB total — small.

The group colour assignment is computed at build time, not in the browser. The build tool runs the colour-assignment pass ([§7](#7-coloring-strategy)) once and bakes the index, so the runtime just looks up a 5–10-entry palette.

## 4. Visual design

The aesthetic target is a **scientific top-down diagram** rendered in 3D — clear, sober, slightly graphic-design-y. Reference points: the classic Tully 1982 Local Supercluster wireframe diagram; the Hayden Planetarium "Universe" tour's nearby-galaxy panel; the supergalactic-plane figures in Karachentsev's papers.

Concretely:

- **Background:** pure black (`vec3(0.0)`). No nebula tints, no gradient sky. The flatness has to read against contrast.
- **Group galaxies** are drawn as **soft round points** with the existing `points.wgsl` billboard shader, but with the colour input replaced by the group's palette colour rather than the magnitude/colour-index gradient.
- **Point size** uses the existing `kPerZ` magnitude scaling. Brightest group members are 6–10 px on screen; fainter ones are 2–3 px. Below 1 px we let them fade by alpha rather than disappearing entirely.
- **Disk impostors** for the very brightest (`apparentSizePx > 8`) are reused from Shell 4. Each impostor is tinted by group colour at low saturation (i.e., `mix(vec3(1.0), groupColor, 0.3)`) so the disc still reads as "galaxy" first and "group member" second.
- **Field galaxies** (no group) render in neutral white at 50–70% opacity. They form a low-contrast background mist that the coloured groups pop out of.
- **Plane-distance opacity cue (subtle):** a galaxy's opacity gets a small bonus when its `|SGZ|` is small. The function is `alpha *= 1 - 0.25 * smoothstep(0, 6, |SGZ_Mpc|)` — galaxies in the plane are 25% more visible than galaxies far above/below. This is a *legibility* nudge, not a falsification: the geometry is still real; we're just letting the eye catch the pattern faster.
- **Label typography** matches the rest of the tour (MSDF labels per [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md)). Group names use the group's palette colour at 80% white-mix; individual galaxy names use plain white.

The didactic move here is *restraint*. Every other shell adds a flashy new render technique. Shell 5 deliberately uses only what we already have and lets the data shape do the talking.

## 5. Camera path

**Entry waypoint** (`T+0:47`):
- Position: ~5 Mpc above the Local Group barycenter, along the +SGZ axis.
- Look-at: Local Group barycenter (i.e., camera looking straight down at the supergalactic plane).
- FoV: 50°.
- Up vector: aligned with the supergalactic Y axis so the plane appears horizontal in screen space.

This entry orientation is critical. We just exited Shell 4 with the camera nominally framing MW + M31 in the equatorial plane, which is *tilted* relative to the supergalactic frame. The entry transition needs to roll the camera so that, at `T+0:47`, "down" in screen space corresponds to "looking through the supergalactic plane from above." See [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) for the easing curve; the recommendation is a 1.0 s slerp during the Shell 4 → Shell 5 crossfade with no translation, then translation begins at `T+0:48`.

**Internal motion** (`T+0:48` → `T+0:54`):
- Slow translation **parallel to the plane**, ~3 Mpc/s, sliding from "above the LG" toward "above and slightly toward Cen A." Total displacement during the shell is ~18 Mpc.
- Camera height above the plane stays roughly constant (~5 Mpc) during this slide, so the apparent flatness of the structure is preserved.
- Look-at point translates in lockstep with the camera so we keep looking straight down. (The camera *does not* track a single target; it looks down at whichever bit of the plane is currently below.)
- Very gentle yaw (≤5°) over the 8 seconds, just enough to break the perfect orthographic-feeling stillness without making the user motion-sick.

**Exit waypoint** (`T+0:55`):
- Camera tilts up by ~25° (look-at lifts off the plane and toward the centre of the next shell's view volume).
- Translation begins to point *away* from the plane normal, i.e., a slow upward pull.
- This sets up Shell 6, where Virgo enters frame from "ahead and slightly left" rather than appearing abruptly.

The camera path is encoded as four `CameraWaypoint` structs in `src/services/engine/tour/script.ts` (see [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) for the schema):

```ts
type CameraWaypoint = {
  shell: ShellId;
  t: number;             // seconds from tour start
  position: Vec3F32;     // shell-relative, in Mpc
  lookAt: Vec3F32;
  up: Vec3F32;
  fovDeg: number;
};
```

## 6. Render pipeline

Everything Shell 5 needs already exists in some form. The new code is small.

**Reused unchanged:**
- `pointRenderer.ts` — instanced billboards. No changes needed beyond accepting an additional per-vertex colour attribute.
- `quadRenderer.ts` for the disk impostors of the brightest group galaxies.
- `labelRenderer.ts` (post MSDF spec) for the group + named-galaxy labels.
- The Shell-aware projection matrix from [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) (near = 0.1 Mpc, far = 200 Mpc).

**New (small):**
- An additional vertex attribute slot in the point-cloud format for `groupColorIdx: u8`. Stride grows from 28 bytes / 7 slots to 32 bytes / 8 slots. The shader looks up a colour from a small uniform palette buffer. (This is a *Shell-5-only* attribute set; the wide-view point cloud retains its current 28-byte stride. Per [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md), each shell can ship its own buffer layout.)
- A 5–10-entry palette uniform: `array<vec4<f32>, 10>`. Populated at shell-load time from the build-baked palette.
- An optional supergalactic-plane impostor (see [§8](#8-the-supergalactic-plane)).

**Pass order within Shell 5:**
1. Sky colour (black).
2. Background distant-galaxy points (low alpha, neutral colour).
3. Supergalactic-plane disc impostor (if enabled).
4. Group galaxy points (palette-coloured).
5. Disk impostors for brightest group members.
6. Labels (MSDF).

The plane impostor renders *between* the distant-galaxy background and the group points so the points always sit on top of the plane visually, even when the camera dips into it.

## 7. Coloring strategy

The colour assignment is one of the load-bearing design decisions. Get it wrong and the visual either looks like noise (too many groups, all colours fight) or like a sterile diagram (one colour, no structure).

**Decision:** **5 named groups** get distinct hues; everything else is neutral white. The five:

| Group | Palette colour | Why this colour |
|-------|----------------|-----------------|
| M81 group | warm yellow `#f5c84a` | Recognisable, M81 itself is yellow-toned in real images |
| Cen A group | red-orange `#e25c3b` | Cen A's famous dust lane reads as red |
| Sculptor group | teal `#3ec0c4` | Cool, distinctive against the warm groups |
| M101 group | blue-violet `#7b8de8` | M101 is a face-on blue spiral |
| Maffei group | desaturated green `#7fa67f` | Maffei is dust-obscured; muted green keeps it readable but not loud |
| *(everything else)* | white `#ffffff` @ 60% | The neutral default |

Five groups is enough for visual variety without overwhelming the eye. Adding a sixth group is a one-line change in the palette file plus a one-line addition to the build-time assignment table; this is intentionally easy to tweak after we look at the result.

The groups are chosen because they are (a) the five most populous Tully 2GC groups within ~10 Mpc and (b) all named in popular astronomy. The Local Group itself is *not* coloured — it sits at the camera's effective origin and is sub-pixel for most of the shell; tinting it would create an awkward bright dot at the centre of every frame.

**Group ID source.** See [open question 13.1](#13-open-questions) — we currently default to using Tully 2GC's published group IDs as authoritative. Running our own friends-of-friends pass is plausible but not necessary for the visual we want.

## 8. The supergalactic plane

The supergalactic plane is a *geometric* plane defined by de Vaucouleurs in 1953: SGZ = 0 in supergalactic coordinates. It has no physical surface — it's a coordinate convention chosen because nearby galaxies happen to cluster near it.

For Shell 5 we render it as a **single, very faint, translucent disc** centred on the LG barycenter, oriented so its normal is the supergalactic Z axis.

**Implementation:**
- A flat textured quad, ~30 Mpc radius, with a soft radial alpha falloff (alpha = 1 at centre, 0 at edge, smoothed).
- Texture is a simple gradient — no grid lines, no compass markings. The shape should be felt, not read.
- Maximum opacity: **0.06** at centre. This is genuinely faint. The plane should be subliminal until the user thinks "wait, is there something there?"
- Disabled by default in v1; enabled by a `?plane=on` URL flag and behind a config toggle. Ship the geometry, default off, decide after a/b looks. (The galaxies *should* convey the flatness without it; the plane is a crutch we can lean on if testing shows the structure isn't reading.)

**Critical constraint:** the plane must **never** occlude a galaxy point. We achieve this by rendering it before the points (it ends up underneath in the alpha composite) and by capping its alpha low enough that even a stack of plane-pixels behind a faint white point doesn't change the point's colour by more than ~3%. If testing reveals the plane is fighting the points, we cut it entirely; the geometry survives but stays disabled.

This is a deliberate "alpha cue, never blocking" design. A solid disc at SGZ=0 would dominate the frame and rob the galaxy distribution of its own ability to communicate flatness. The plane is allowed to whisper, never to shout.

## 9. Labels

Five to eight labels appear during this shell, fade-timed to avoid simultaneous reveal:

| Label | Anchor | Fade-in | Fade-out |
|-------|--------|---------|----------|
| **M81** | M81 position | T+0:48.5 | T+0:54.5 |
| **M101** | M101 position | T+0:49.0 | T+0:54.5 |
| **Cen A** | NGC 5128 position | T+0:49.5 | T+0:54.5 |
| **Sculptor Group** | Sculptor group center | T+0:50.0 | T+0:54.5 |
| **NGC 253** | NGC 253 position | T+0:50.5 | T+0:54.5 |
| **Maffei** | Maffei group center | T+0:51.0 (optional) | T+0:54.5 |
| *Local Group ←* | Frame centre arrow | T+0:48.0 | T+0:50.0 |

Each label uses the MSDF pipeline. Anchor positions are passed in shell-relative Mpc; the label renderer projects through Shell 5's projection matrix per [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md).

Group labels are larger (≈18 px), individual galaxy labels smaller (≈12 px). Group labels colour-match the group palette (with white-mix for legibility); galaxy labels are plain white.

The "Local Group ←" arrow at T+0:48.0 is a brief tour-author affordance to anchor the user's spatial intuition: "the place you just came from is *that* dot." It dies quickly so it doesn't cling to the centre of frame as the camera slides.

## 10. Transitions

**In (from Shell 4):**
- During `T+0:46` → `T+0:47` (1 s crossfade), Shell 4's MW + M31 disk impostors fade alpha 1 → 0; Shell 4 dwarf fuzzies fade 1 → 0; Shell 5's group-coloured points fade 0 → 1.
- The supergalactic-plane impostor (if enabled) fades in over a longer 2 s window so the user doesn't perceive it appearing.
- Camera roll completes during this window so by T+0:47.0 we are oriented "looking down on the plane" without the user having consciously felt the rotation. (This works because there are no orientation-cueing structures during the crossfade — all visible points have approximately 4-fold symmetry.)
- The Shell 4 origin (LG barycenter) is **the same** as Shell 5's origin, so no floating-origin re-snap is needed. This is intentional and keeps the transition visually continuous.

**Out (to Shell 6):**
- During `T+0:55` → `T+0:56` (1 s crossfade), the group palette desaturates to white over ~0.5 s. The group identity has done its job; for Shell 6 we want neutral points so Virgo's appearance is the new visual hook.
- The supergalactic-plane impostor (if enabled) fades out.
- Virgo cluster, which has been a sparse handful of points in the upper-right of frame throughout Shell 5, **brightens** during the crossfade as Shell 6's denser galaxy distribution loads in. The user should perceive Virgo as "swelling into focus," not "appearing from nowhere."
- Shell 5's origin (LG barycenter) and Shell 6's origin (M87 or heliocentric — see [Shell 6 spec](06-virgo-supercluster.md)) differ. The floating-origin re-anchor happens during the crossfade. Because both shells render at sub-Mpc-per-pixel scales, the visual continuity holds as long as the absolute camera position (in heliocentric Mpc) is preserved across the re-anchor — which it is, by construction.

## 11. Performance budget

Per [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md), middle shells (4–6) target ≤ 4 ms per frame.

Shell 5 budget breakdown:

| Cost | Budget |
|------|--------|
| Background distant-galaxy pass (~30 000 points) | 0.6 ms |
| Plane-disc impostor (1 quad) | 0.05 ms |
| Group + field galaxy pass (~12 000 points) | 0.7 ms |
| Disk impostors (≤ 30) | 0.1 ms |
| Labels (≤ 8 MSDF strings) | 0.2 ms |
| Per-frame uniform & buffer writes | 0.1 ms |
| **Total** | **~1.75 ms** |

Comfortable headroom. The dominant cost is the background pass; we can drop it entirely if frame budget tightens, since its only role is to hint at structure beyond 30 Mpc.

CPU-side: `runFrame.ts` per-shell selection costs are O(1). The point-cloud fade-alpha logic per [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) is a single `smoothstep` call per shell per frame.

GPU-memory: ~600 KB for the point buffer + 4 KB for impostor instance data + ~8 KB for the plane texture (a 64×64 grayscale gradient). Negligible.

## 12. Mobile fallback

On mobile (per [`../ux/05-mobile.md`](../ux/05-mobile.md)) we apply three simplifications:

1. **No disk impostors** — only points. Mobile GPUs handle large numbers of small billboards better than a few large textured quads with alpha blending.
2. **No supergalactic-plane impostor** — even if it's enabled on desktop. The point-density alone has to do the work.
3. **Reduced point count** — drop the background "distant galaxies" pass entirely. Group + field galaxies only, ~12 000 points.
4. **Larger label font and fewer labels** — drop the "Maffei" and "NGC 253" labels on viewports < 600 px wide.

The visual still works because the *core* of the shell is the group-coloured point distribution; everything else is enhancement.

## 13. Open questions

These need a human decision before implementation begins.

1. **Group ID source: Tully 2GC vs. our own friends-of-friends.** Tully 2GC's group catalogue is well-curated and authoritative for ~30 Mpc, but it is built against 2MRS, which is K-band-magnitude-limited. GLADE has ~30× more galaxies in this volume, including dwarfs Tully would have missed. Running our own FoF on GLADE would catch those, but it would also re-classify edge-of-group dwarfs in ways that might disagree with the published group memberships people recognise. **RECOMMENDATION:** use Tully 2GC IDs as authoritative for the *coloured* groups (M81/Cen A/Sculptor/M101/Maffei) and treat any GLADE galaxy not in a Tully group as "field." This gives the visual clarity we want without inventing new science.
2. **Should we colour by group, or by *distance from the plane*?** A SGZ-distance gradient (e.g., warm in-plane, cool out-of-plane) would emphasise flatness even more directly. We chose group-colour because (a) it gives the user multiple recognisable landmarks and (b) the plane-distance opacity cue already encodes flatness. Worth A/B testing.
3. **Plane disc on or off by default?** Currently off. Decide after first visual review.
4. **Disk impostors at this scale — do they read as galaxies or as noise?** At Shell 5's camera distance, M81's apparent size is ~10 px. A disk impostor at 10 px might be indistinguishable from a slightly bloomed point. May want to skip impostors and use only points. Test in Phase 1 of [`../implementation/00-phasing.md`](../implementation/00-phasing.md).
5. **Camera path — straight slide vs. gentle arc?** The current spec is a parallel slide above the plane. An arc that starts from "looking down" and curves to "low-angle grazing the plane edge-on" would emphasise the slab thickness from a different angle. The slide is safer narratively; the arc is more cinematic. **RECOMMENDATION:** ship the slide for v1, add the arc as an `?camera=arc` flag for testing.

## 14. Test criteria

Shell 5 is "done" when **all** of the following are true:

- [ ] At T+0:50.0 (mid-shell), a screenshot shows ≥ 80% of visible group-coloured points lying within ±6 Mpc of SGZ = 0. (Verifies the geometry is correct, not just the rendering.)
- [ ] M81, M101, Cen A, Sculptor, NGC 253 labels are visible and not overlapping each other at any frame between T+0:50 and T+0:54.
- [ ] Camera "down" in screen space points along −SGZ for every frame between T+0:48.0 and T+0:54.5 (within ≤ 5° tolerance).
- [ ] Frame time during the shell stays under 6 ms on the reference desktop GPU (Apple M1 integrated, listed in the perf doc) and under 12 ms on the reference mobile (iPhone 12).
- [ ] Crossfade in (T+0:46→0:47) and crossfade out (T+0:55→0:56) show no popping, no flicker, and no visible re-anchor jitter.
- [ ] The five group palette colours are distinguishable on a colour-blind-simulator pass (deuteranopia + protanopia + tritanopia). If any pair fails, swap to the alternate palette in `src/data/colorPalettes.ts`.
- [ ] On a slow connection (throttled to "Slow 3G" in DevTools), the tour pauses gracefully at the Shell 4 → Shell 5 boundary if Shell 5 data hasn't loaded; resumes when ready; never shows a half-loaded point cloud.
- [ ] The fallback (no group-colour pass, just the existing point cloud) produces a visually acceptable Shell 5 — not as informative, but not broken.

These are runtime acceptance criteria, complementary to the unit tests for the build-time data path described in [`../data/05-tully-galaxy-groups.md`](../data/05-tully-galaxy-groups.md).

## 15. Files touched

**New:**
```
src/services/engine/shells/
  shell5LocalSheet.ts          — ShellRenderer impl
  shell5GroupPalette.ts        — palette table + lookup
  shell5PlaneImpostor.ts       — supergalactic-plane disc renderer (optional, gated on flag)

src/data/
  shell5GroupAssignments.ts    — build-baked group ID → palette index table

tools/
  buildShell5Bin.ts            — Tully 2GC + GLADE merge → public/data/05-local-sheet.bin

tests/services/engine/shells/
  shell5LocalSheet.test.ts
  shell5GroupPalette.test.ts

tests/tools/
  buildShell5Bin.test.ts

public/data/
  05-local-sheet.bin           — generated, gitignored, R2-synced
  textures/sg-plane-gradient.png  — 64×64 alpha gradient for the plane impostor
```

**Modified:**
```
src/services/engine/runFrame.ts            — register Shell 5 in the per-shell loop
src/services/engine/tour/script.ts         — add Shell 5 camera waypoints + label fades
src/services/gpu/pointRenderer.ts          — accept optional `groupColorIdx` per-vertex attribute
src/services/gpu/shaders/points.wesl       — palette-lookup branch behind a shader flag
src/data/shellDefinitions.ts               — Shell 5 entry (origin = LG barycenter, near = 0.1 Mpc, far = 200 Mpc)
src/data/colorPalettes.ts                  — primary + colour-blind-alt 5-group palettes
tools/syncR2.ts                            — add `05-local-sheet.bin` to ALLOW filter
```

**Coordinated with:**
- [`../data/05-tully-galaxy-groups.md`](../data/05-tully-galaxy-groups.md) — the catalogue acquisition and parser plan.
- [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — the floating-origin and per-shell projection contract.
- [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) — the crossfade machinery shared with neighbouring shells.
- [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — the waypoint schema and easing primitives.
- [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md) — the MSDF label pipeline.
- [`../ux/02-information-content.md`](../ux/02-information-content.md) — the on-screen overlay copy ("THE LOCAL SHEET — Within 30 million light-years…").
- [`../ux/05-mobile.md`](../ux/05-mobile.md) — the mobile reductions listed in [§12](#12-mobile-fallback).
- [Shell 4 spec](04-local-group.md) — origin handoff (no re-anchor across the boundary).
- [Shell 6 spec](06-virgo-supercluster.md) — the Virgo "swell into focus" exit transition.
