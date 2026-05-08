# Shell 4 — Local Group

**Status:** Initial design (2026-05-08).
**Tour beat:** `T+0:37` → `T+0:46` (9 s).
**Native unit:** Mpc (megaparsecs). Visible volume **0.01–10 Mpc**, with most of the action in **0.01–5 Mpc**.
**Shell origin:** Local Group barycenter, located between the Milky Way and M31, biased ~62 % of the way from the MW toward M31 (the mass-weighted midpoint of the two dominant spirals). See [`../data/04-local-group-catalog.md`](../data/04-local-group-catalog.md) for the exact heliocentric coordinates.
**Hero data:** NED Local Volume Catalog + the Karachentsev "Updated Nearby Galaxy Catalog" (~80 Local Group members within ~1.2 Mpc of the LG barycenter, plus a soft halo of nearby groups out to 5 Mpc).
**Hero visual:** MW + M31 + M33 as recognizable disk impostors; the Magellanic Clouds as fuzzy patches at MW's hip; the ~80 dwarfs as soft, low-luminosity "fuzzy" point sprites; a faint dashed arrow indicating the MW→M31 collision course at T+0:42.
**Render budget:** ~4 ms per frame on a mid-range integrated GPU; small dataset, three impostors, no volumetric work.

## 1. Overview

Shell 4 is the **first shell that actually looks like the rest of skymap.** Shells 1–3 use bespoke renderers (Sun shading, planet billboards, Gaia stars, Milky Way impostor); shell 4 returns to the home turf of "instanced point sprites for galaxies." But it is also the first shell where the user sees **named, individually-recognizable galaxies** in their real spatial relationship, instead of a sea of statistical points. That gives shell 4 a peculiar production value: every named object on screen is a place the user has heard of (the Milky Way, Andromeda, the Magellanic Clouds), and the spatial relationships are intuitive at a glance — two big spirals, a triangulum companion, a couple of magellanic blobs, and a scatter of dwarf moons.

The design challenge is therefore not "how do we draw 80 galaxies fast" — that is trivial. It is **"how do we make 80 galaxies feel like an inhabited neighborhood**, when each one needs a distinct visual identity but we cannot afford a hand-tuned art asset per dwarf?" The answer is a tier-of-fidelity rendering: three named spirals get the disk impostor (which we are already paying for in shell 3), the Magellanic Clouds get a hand-tuned medium-fidelity treatment, and the dwarfs share a single procedural "fuzzy" sprite shader that varies by stellar mass and morphology code.

The shell also carries the tour's first **dynamics beat**: the Local Group is gravitationally bound. M31 is approaching the MW at roughly 110 km/s and the two will merge in ~4.5 Gyr. Shell 4 is the right place to show motion explicitly because it is the smallest scale at which Hubble flow is dominated by peculiar velocities — at larger shells, everything is receding; at smaller, everything orbits the Sun or the galactic center. So shell 4 gets a **subtle dashed arrow** between MW and M31 that fades in mid-shell, with a small velocity glyph annotating the magnitude. This is the first shell where the user is shown that the universe is not static.

## 2. Visible elements

The shell renders, by category and approximate count:

- **Three spirals as disk impostors** (3 instances): the Milky Way, M31 (Andromeda), M33 (Triangulum). Each is rendered with the same impostor shader pioneered for shell 3, but with per-galaxy parameters (disk radius, axial inclination, position angle, surface-brightness profile). The MW occupies one corner of the frame; M31 the opposing corner; M33 sits below M31 as its known small companion.
- **Magellanic Clouds as fuzzy patches** (2 instances): the LMC and SMC are too irregular and too close to the MW for the disk impostor model to flatter them. They get a slightly upgraded version of the dwarf "fuzzy" sprite — larger radius, irregular blue-white tinting, optional hint of an internal asymmetry texture. They sit just off the MW disk on the correct side of the southern celestial sphere.
- **~80 dwarf galaxies as fuzzy point sprites**: the entire Local Group dwarf census from Karachentsev. Each is one instanced billboard, ~30 px maximum apparent size, with a soft Gaussian falloff and a per-galaxy color (typically warm white for old stellar populations, slightly bluer for the few star-forming dwarfs). Examples: Sagittarius dSph, Sculptor, Fornax, Leo I, Leo II, Draco, Ursa Minor, Carina, Sextans, the M31 satellites (M32, NGC 205, NGC 185, NGC 147, Andromeda I–XXXII), and the more isolated members IC 10, IC 1613, WLM, Pegasus dIrr.
- **Background dust**: a *very* faint extension of the cosmic-web point cloud beyond ~5 Mpc, alpha ≈ 0.05, to imply that "there is more out there." This is the same point cloud used in shell 8, just heavily attenuated, and serves as a visual hand-off into shell 5.
- **One dashed velocity arrow**: rendered between the MW and M31 anchor positions. Fades in over 1 s starting at T+0:42, holds, then fades out at the shell-out transition. See section 7.
- **Labels**: MW, M31, M33, LMC, SMC, plus 5–10 named dwarfs chosen for narrative weight (Sagittarius dSph, Fornax, Sculptor, Leo I, Draco, IC 10). See section 8.

Total instance count is ~85 sprites + 3 impostors + 1 line + ~12 labels — trivially small for the existing point pipeline.

## 3. Data requirements

All catalog acquisition, parsing, cross-matching, and binary encoding for shell 4 is specified in [`../data/04-local-group-catalog.md`](../data/04-local-group-catalog.md). That document is the source of truth for: the chosen Karachentsev release, NED Local Volume Catalog query parameters, the cross-match strategy with HyperLEDA for orientation/inclination, the per-galaxy field schema, the binary layout, and the build-pipeline integration with `tools/buildAllBins.ts`. The shell renderer assumes a decoded `LocalGroupCatalog` object with the following fields per galaxy: heliocentric position (Mpc, J2000), absolute B-magnitude, morphological type code, log stellar mass, disk position angle (where known), inclination (where known), heliocentric radial velocity, and a stable PGC identifier for cross-referencing thumbnails. The MW, M31, and M33 records additionally carry hand-curated impostor parameters (disk scale length, bulge fraction, dust-lane orientation) that override the procedural defaults — these three are too important to leave to procedural placeholder geometry.

## 4. Visual design

The visual language of shell 4 sits between two very different rendering primitives, and the success of the shell depends on those primitives reading clearly together at a single glance.

**Disk impostor reuse for MW + M31 + M33.** The Milky Way impostor from [`shells/03-milky-way.md`](03-milky-way.md) is a screen-aligned billboard that samples a procedural-or-textured spiral disk in shader space, accepting a 3×3 orientation matrix and a small uniform block (disk radius, bulge fraction, color temperature, dust-lane density). For shell 4 we instance this same shader three times. Each spiral disk is positioned at its real shell-relative coordinate, rotated to its real inclination and position angle (M31 famously edge-on at ~77° inclination, M33 at ~54°), and scaled so that its visible disk subtends roughly its real angular size as seen from the LG barycenter — i.e. M31's ~3° apparent diameter from Earth becomes a comparable apparent diameter from the LG barycenter, which is geometrically the same answer to within a few percent. The MW impostor is parameterized to look identical to the shell-3 hero asset: same colormap, same arm count, same dust-lane position. Visual continuity across the shell-3-to-shell-4 transition is critical — the user must recognize "that's the thing we just flew out of." See section 9 for the crossfade detail.

The three impostors share the same uniform layout but with per-instance values. Because there are only three of them we afford a real per-instance uniform block (192 bytes total) rather than packing parameters into vertex attributes — the readability win in the renderer code is worth the negligible bandwidth cost. M31 is the most visually dominant: at 5 Mpc camera distance it subtends ~10° of the field of view, more than enough to show its tilted spiral structure clearly.

**Dwarf "fuzzy" sprite design.** The dwarfs need a sprite that reads as "softer than a star, fainter than a galaxy disk." A pure Gaussian blob looks like a star defocus; a hard-edged disk reads as either a planet or a galaxy and steals the impostors' thunder. The recipe we land on is a **double-Gaussian core-plus-halo** with a slow color shift from the center outward:

```wgsl
fn dwarfSprite(uv: vec2f, mass: f32) -> vec4f {
  let r = length(uv - vec2f(0.5));
  let core  = exp(-pow(r / 0.10, 2.0));   // tight bright nucleus
  let halo  = exp(-pow(r / 0.35, 2.0));   // soft extended envelope
  let alpha = saturate(0.65 * core + 0.35 * halo);
  let warm  = vec3f(1.0, 0.95, 0.85);
  let cool  = vec3f(0.85, 0.88, 1.00);
  let color = mix(cool, warm, smoothstep(0.0, 0.5, r)); // bluer center, warmer halo
  return vec4f(color, alpha * massBrightness(mass));
}
```

That gives a sprite that, at the ~16–32 px size we render dwarfs at, reads unambiguously as "diffuse stellar blob, not a star, not a disk." `massBrightness(mass)` is a smooth log-scaled brightness map from the dwarf's stellar mass: the LMC reads as roughly 4× brighter than Sculptor, which roughly matches the real surface-brightness contrast that human eyes would perceive if these were visible naked-eye objects. Apparent size scales with the sixth root of stellar mass, capped at the LMC's value — this prevents Sagittarius dSph (which is structurally enormous on the sky but extremely low-surface-brightness) from over-dominating the frame.

The Magellanic Clouds use the same sprite with three tweaks: roughly 3× the radius, a more noticeable internal asymmetry (a single offset bright spot mimicking the LMC's bar/30 Doradus complex and the SMC's wing), and a slightly bluer overall tint to reflect their active star formation. We do not render their stellar streams — those are visible only in deep imaging and would clutter the shell.

The background dust mentioned in section 2 is just the existing point renderer with a constant scalar opacity multiplier of ~0.05 baked into the shell-4-specific uniform block. No new shader code, no perf cost.

## 5. Camera path

The camera enters shell 4 at the end of shell 3, having pulled back from a top-down view of the Milky Way disk to a vantage ~100 kpc above the galactic center. The hand-off is engineered so that at the moment of crossfade, the MW is still center-frame as a small disk — visual identity preserved.

**Entry (T+0:37):** Camera position is approximately at `(0, +0.1, +0.5)` Mpc shell-relative coordinates (above and behind the MW from the LG barycenter), looking toward the LG barycenter origin. Field of view is wide (~75°). The MW impostor is in the lower right of the frame, M31 swims into the upper left, M33 hovers near M31. Camera distance from LG barycenter is ~3 Mly (~0.9 Mpc).

**Mid-shell orbit (T+0:38 → T+0:44):** The camera traces a slow arc through the LG barycenter's "orbital frame," holding M31 and the MW symmetrically in frame. Movement is parallax-revealing: about 12° of angular sweep over 6 s, or ~2°/s, slow enough to read individual dwarf positions but fast enough to give clear depth cues. The orbit axis is tilted ~30° off the supergalactic plane to avoid the orbit looking like a flat circle. The camera-to-origin distance is held roughly constant at 0.9 Mpc; this is a true orbit, not an in-and-out dolly.

**Collision-arrow beat (T+0:42):** Camera motion slows for ~1.5 s. The dashed arrow fades in. The user's eye, having tracked the slow orbital motion, is now drawn to the new visual element. After the beat, orbital motion resumes.

**Exit (T+0:46):** Camera begins to pull back along the orbital normal, retreating from the LG barycenter. By the end of the shell-out crossfade (~1 s into shell 5) the camera is at ~5 Mpc and the entire Local Group has shrunk to a tight clump in frame center, with neighboring galaxy groups beginning to appear in the surrounding space.

The camera path is encoded as a `ShellBeat` in `tour/script.ts` with three waypoints (entry, mid-orbit-apex, exit) and a `CameraInterpolator` configured for "ease-in-orbit" — this is the same interpolator the tour uses for any shell whose camera follows an arc rather than a straight line. See [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md).

## 6. Render pipeline

Shell 4's `ShellRenderer` runs the following passes per frame, in back-to-front order, all targeting the shell-4 depth attachment with reverse-Z (`near = 0.001 Mpc`, `far = 20 Mpc`):

1. **Background dust pass** — the existing point renderer, fed a heavily attenuated subset of the GLADE catalog at ≥5 Mpc from the LG barycenter. Alpha 0.05. Cost: ≤0.5 ms (it's the same renderer that handles 2.5M points elsewhere; we are giving it ~50 k filtered points).
2. **Dwarf fuzzy pass** — a new renderer `localGroupDwarfRenderer.ts` that instances the double-Gaussian sprite from section 4. ~85 instances. One uniform buffer for shell parameters, one storage buffer for per-dwarf records (position, log mass, color tint, morphology code). Cost: ≤0.5 ms.
3. **Disk impostor pass** — three invocations of the shell-3 disk impostor shader, one per spiral, each with its own per-instance uniform block. Cost: ≤2 ms (the impostor shader is the most expensive piece in this shell because of its procedural spiral evaluation per fragment).
4. **Collision arrow pass** — a thin dashed line from MW position to M31 position, with a small velocity glyph at the midpoint. Single draw call, ~50 vertices. Animated dash offset gives a subtle "flow" implying motion direction. Cost: ≤0.1 ms.
5. **Label pass** — MSDF labels per [`../../specs/2026-05-07-msdf-labels-design.md`](../../specs/2026-05-07-msdf-labels-design.md). ~12 labels, each with a leader line for the 5–10 named dwarfs whose sprites are too small for an inline label. Cost: ≤0.5 ms.

Total: ≤3.6 ms, well inside the 4 ms budget. The disk impostors are the only piece that could blow the budget if the shell-3 impostor shader regresses; the per-pixel cost should be monitored in [`../rendering/07-performance.md`](../rendering/07-performance.md)'s shell-by-shell measurement table.

The renderer is wired through the standard `engine.runFrame.ts` shell loop — shell 4 declares `isActiveAt(scale)` as `scale.shell === 'LOCAL_GROUP'` plus a fade region around the shell-3-to-shell-4 and shell-4-to-shell-5 boundaries.

## 7. The collision arrow

The MW–M31 approach is the tour's first time-evolution beat. We are visualizing a velocity vector, not just a static position, and we have ~4 s of screen time to do it without dragging the eye away from the broader Local Group composition.

**Geometry.** A polyline from the MW shell-relative position to the M31 shell-relative position, rendered as a screen-space-thickness ribbon (constant 1.5 px regardless of camera distance, so it never disappears) with a stippled dash pattern. The arrowhead is at the MW end — i.e., the arrow points *from* M31 *toward* the MW, which is the relative-velocity direction when seen in the MW's rest frame. We considered rendering it from MW toward M31 ("they are getting closer") but that ambiguates which galaxy is "doing the moving"; pointing the arrow at the MW is unambiguous about the relative motion.

**Animation.** The dash pattern's UV offset advances at a speed proportional to log(110 km/s) — fast enough to register as motion, slow enough not to look like a marquee. The arrow dashes "flow" from M31 to MW, reinforcing the direction.

**Velocity glyph.** A small label sits at the midpoint of the arrow, reading **`~110 km/s`** in the same MSDF font as the other labels but at half size, with a dimmer color. It uses a leader line offset perpendicular to the arrow so that the glyph and the arrow do not overlap.

**Fade timing.** The arrow alpha curve is `0 → 1` over 0.8 s starting at T+0:42, holds at 1.0 for ~3 s, then `1 → 0` over 0.8 s as the shell exits. At its peak it sits at alpha 0.7 — visible but never fighting the spirals for attention.

**Why subtle.** A bold red arrow would scream "danger collision" and read as alarmist or sci-fi. The whole point of the beat is matter-of-fact: this is happening, on a 4.5 Gyr timescale that humans cannot directly perceive, and the subtle dashed arrow communicates exactly that. The overlay copy ("We'll collide with Andromeda in 4.5 billion years") does the emotional lifting; the arrow just provides the spatial referent.

The collision-trajectory question — whether to actually animate the future merger — is parked in the open questions (section 12).

## 8. Labels

Labels use the standard MSDF pipeline. Anchoring strategy:

- **MW, M31, M33**: anchored to the disk impostor center, rendered as inline labels (no leader line) with a small offset to clear the disk's bright core. Font size ~14 px screen-relative.
- **LMC, SMC**: anchored to the fuzzy sprite center, inline, font size ~12 px.
- **Named dwarfs (5–10 chosen)**: anchored to the dwarf sprite center, but rendered with a thin leader line because the sprites themselves are too small to host an inline label without occluding the sprite. The chosen dwarfs are: **Sagittarius dSph** (the closest non-Magellanic dwarf, currently being eaten by the MW), **Fornax** (a textbook dSph), **Sculptor** (the prototype dSph from Shapley's 1938 discovery), **Leo I** (notable for its high radial velocity and possible MW interaction), **Draco** (one of the most dark-matter-dominated objects known), and **IC 10** (the only confirmed Local Group starburst galaxy). Up to four more (NGC 205, IC 1613, WLM, M32) are added if the per-frame label-budget allows after MSDF de-overlap (see [`../ux/01-information-overlays.md`](../ux/01-information-overlays.md) for the de-overlap strategy).

All labels are **shell-relative** — their position is computed from the dwarf's shell-4 coordinates and the shell-4 projection matrix. They fade in/out with the shell, not independently.

## 9. Transitions

**In (shell 3 → shell 4, ~T+0:36 to T+0:38, ~2 s crossfade).** Shell 3 is the MW impostor at ~50–100 kpc viewing distance. As the camera pulls back, the shell-3 fade-alpha begins to drop while shell-4 fade-alpha rises. The visual continuity hinge is the **MW disk itself**: the shell-3 impostor and the shell-4 MW impostor must reach near-pixel parity at the moment of crossfade peak (alpha ~0.5/0.5). Because both impostors use the same shader, this is a matter of (a) ensuring their orientation matrices agree at the handoff and (b) letting the shell-4 instance ride into frame at the same screen position as the shell-3 instance is leaving. The Magellanic Clouds, which were already faintly visible at the edge of shell 3, are the next thing the user notices fading up, then M31 and M33 enter from the upper-left as the camera pulls back enough to frame them.

**Out (shell 4 → shell 5, ~T+0:46 to T+0:48, ~2 s crossfade).** The Local Group fades into a tight clump near frame center. The disk impostors — MW, M31, M33 — fade out fastest, becoming small bright dots before disappearing entirely; they are replaced by their representations in the shell-5 group-colored point cloud, in which the entire LG is a single small cluster of ~15 colored points. The dwarf fuzzies fade more slowly so that the visual density of the LG is preserved through the handoff. The background-dust point cloud, already present at low alpha in shell 4, ramps up to its full shell-5 opacity to reveal the surrounding Local Sheet structure: the M81 group, Centaurus A, Sculptor group, M101 group all appear as bright concentrations in the surrounding space.

The collision arrow fades to 0 well before the shell exit (by T+0:45.5) so that it does not "ride out" with the spirals — visually it would look like the arrow itself is being thrown out of the frame, which is unintended.

## 10. Performance budget

| Pass | Budget | Rationale |
|------|--------|-----------|
| Background dust | 0.5 ms | Filtered subset of existing point renderer, ~50 k points at low alpha. |
| Dwarf fuzzy sprites | 0.5 ms | 85 instanced billboards, ~30 px each, simple shader. |
| Disk impostors (×3) | 2.0 ms | Same shader as shell 3, three instances. |
| Collision arrow | 0.1 ms | One thin polyline + dashed UV. |
| Labels (MSDF) | 0.5 ms | ~12 labels, includes de-overlap. |
| Composite/post | 0.4 ms | Tonemap + shell composition. |
| **Total** | **~3.5 ms** | Well under the 4 ms middle-shell budget. |

This budget assumes a mid-range integrated GPU (Apple M1, Intel Iris Xe). Discrete GPUs land closer to 1.5 ms total. The headroom is reserved for the disk impostor's procedural-spiral fragment cost, which has historically been the most volatile component.

## 11. Mobile fallback

On mobile, the disk impostor's procedural-spiral fragment shader is too expensive at the resolutions and pixel counts modern phones expect. Shell 4's mobile path:

- **Disk impostors → textured billboards.** MW, M31, M33 each get a pre-baked 256×256 RGBA texture (about 256 KB total at BC7 / ASTC compression) and are rendered as simple textured quads with depth-write off. The textures are baked offline from the same impostor shader at high quality; mobile sees the same visual.
- **Dwarf sprite shader** is identical (cheap).
- **Background dust** is dropped entirely — the LG itself carries the shell.
- **Collision arrow** and **labels** are unchanged.
- **Camera orbital motion** is slowed by ~30 % to reduce the per-frame motion delta the GPU needs to keep up with. Mobile users get a slightly more languid Local Group beat; the 9 s shell duration is preserved.

Total mobile budget: ~5 ms per frame on an iPhone 13–class device. The shell stays at 60 fps.

If GPU detection (via `navigator.gpu.requestAdapter()` info string) flags an even weaker adapter, we fall back to the dataless path described in [`shells/00-shell-overview.md`](00-shell-overview.md): MW + M31 + LMC + SMC only, hard-coded positions, no dwarfs. This is the absolute floor.

## 12. Open questions

1. **Static arrow vs. animated collision trajectory.** The current spec is a static dashed arrow plus a velocity glyph. An alternative is a brief "scrub the clock forward 4.5 Gyr" animation showing the MW and M31 actually colliding — disks tilting toward each other, merging into a hint of an elliptical remnant, then snapping back to the present-day configuration. **Pros:** dramatic, memorable, shows spacetime evolution explicitly. **Cons:** complex to choreograph, requires a credible merger animation (which is research-grade simulation work, not a trivial render), and risks becoming the Pixar-y centerpiece that overshadows the real Local Group composition. **RECOMMENDATION:** static arrow for v1. Defer the time-scrub to a v2 "interactive simulation" feature where the user can drag a Gyr slider themselves.
2. **Should the LG barycenter be visualized?** It is the shell's origin but it is not a physical object — it sits in empty space between MW and M31. We could render a small crosshair or ring at the barycenter to communicate "this is the gravitational center we are orbiting around." **RECOMMENDATION:** no. The orbit motion implies the center; an explicit marker would over-explain.
3. **Inclusion of Andromeda's satellites individually.** M31 has ~32 confirmed satellites (Andromeda I–XXXII plus M32, NGC 205, etc.). They are real Local Group members and would show in the dwarf pass, but at the shell's camera distances they cluster very tightly around M31 and risk reading as "noise around M31." **RECOMMENDATION:** include them but apply a per-dwarf alpha falloff for any dwarf within 50 kpc of an impostor center, so they fade behind the disk rather than freckling its halo. Validate visually before committing.
4. **Magellanic Stream rendering.** The HI gas stream trailing the Magellanic Clouds is a real, visible-in-radio structure that connects them to the MW. We have no data plumbing for HI and the stream is invisible at optical wavelengths. **RECOMMENDATION:** skip in v1. Could become a beautiful overlay in a v2 "multiwavelength" mode.
5. **Distance-cue arc to Earth.** Some popular Local Group visualizations include a small arc or "you are here" marker on the MW disk indicating the Sun's position. We did this in shell 3. **RECOMMENDATION:** keep the marker visible but de-emphasize it (alpha ~0.3) — at shell 4 the user has zoomed past the relevance of "the Sun" but a faint reminder of "the MW disk you just left" is good orientation.

## 13. Test criteria

The shell is shippable when:

- **Visual continuity:** the MW disk impostor renders identically (within ε pixel) at the shell-3-to-shell-4 crossfade peak. Validated by capturing two screenshots — one from shell 3 at its exit waypoint, one from shell 4 at its entry waypoint — and diffing the MW impostor pixels.
- **Spatial accuracy:** M31's shell-relative position matches its real heliocentric distance (~770 kpc) to within 1 %. Inclination and position angle match published values from HyperLEDA. Same for M33. Validated by a Vitest suite asserting the decoded shell-4 catalog values against ground truth.
- **Dwarf census completeness:** the rendered dwarfs match the Karachentsev catalog cut to within 2 entries (some dwarfs sit at the catalog's distance-cut boundary and may legitimately be excluded). Asserted by a Vitest snapshot of the encoded `LocalGroupCatalog`.
- **Performance:** the shell renders in ≤4 ms on the reference Apple M1 mid-range adapter. Measured by the per-frame perf overlay (see [`../rendering/07-performance.md`](../rendering/07-performance.md)).
- **Collision arrow:** appears at T+0:42 ±0.1 s, peaks at alpha 0.7, exits cleanly before shell-out. Validated visually and via the tour script's beat-time assertions.
- **Mobile path:** runs at ≥55 fps median on iPhone 13. Validated via the existing mobile perf harness.
- **Labels:** all named entries render with no overlap at the entry, mid-orbit, and exit camera waypoints. The de-overlap algorithm produces deterministic output (no per-frame jitter as the camera orbits).
- **Fallback:** with the LG catalog `.bin` file deliberately 404'd in dev, the shell still renders MW + M31 + LMC + SMC at hard-coded positions, with a small "Local Group catalog unavailable" toast. The tour does not crash or stall.

## 14. Files touched

**New:**

```
src/services/gpu/localGroupDwarfRenderer.ts   — fuzzy-sprite renderer, instanced billboards
src/services/gpu/collisionArrowRenderer.ts    — dashed-line + velocity-glyph renderer
src/services/engine/shells/localGroupShell.ts — ShellRenderer implementation, fade/active logic
src/services/gpu/shaders/dwarfFuzzy.wesl      — double-Gaussian sprite shader
src/services/gpu/shaders/collisionArrow.wesl  — animated dashed line shader
src/data/localGroupConstants.ts               — LG barycenter coords, MW/M31/M33 hand-curated impostor params
tools/parsers/karachentsevParser.ts           — Local Group dwarf catalog parser
tools/parsers/nedLvcParser.ts                 — NED Local Volume Catalog parser
tests/services/gpu/localGroupDwarfRenderer.test.ts
tests/services/engine/shells/localGroupShell.test.ts
tests/tools/parsers/karachentsevParser.test.ts
tests/tools/parsers/nedLvcParser.test.ts
public/data/local-group.bin                    — encoded ~80-galaxy catalog (~5 KB)
data/raw/karachentsev_lg.dat                   — upstream fixed-width source
data/raw/ned_lvc.csv                           — upstream NED query result
```

**Modified:**

```
src/services/engine/runFrame.ts                — register shell 4 in the shell loop
src/services/engine/shellRendererRegistry.ts   — register localGroupShell
src/data/shellDefinitions.ts                   — LG entry: id, native unit Mpc, near 0.001, far 20
src/services/gpu/diskImpostorRenderer.ts       — accept per-instance uniforms (was singleton)
tools/buildAllBins.ts                          — wire in karachentsev + NED-LVC pipelines
src/@types/localGroup.ts                       — LocalGroupCatalog, LocalGroupDwarf types
tour/script.ts                                 — shell 4 beat: entry/mid/exit waypoints, T+0:42 arrow trigger
```

**Reused (no changes):**

```
src/services/gpu/pointRenderer.ts             — drives the background-dust pass
src/services/gpu/labelRenderer.ts             — handles the ~12 labels via standard MSDF path
src/services/gpu/shaders/diskImpostor.wesl    — same shader as shell 3, instanced 3x
```

The total new source is small (~600 lines including tests) because shell 4 leans hard on existing primitives — the disk impostor from shell 3, the point renderer from the wide-view, the MSDF label path from the standalone labels spec. The novel work is the dwarf fuzzy sprite shader, the collision arrow, and the catalog parser/encoder. Everything else is composition.
