# Shell 3 — Milky Way Disk

**Native unit:** kpc (kiloparsec). 1 kpc = 3.24 × 10⁻⁴ Mpc, 3261 light-years.
**Origin:** Galactic center (Sgr A\*); heliocentric offset (−8.122, 0, +0.0208) kpc.
**Visible volume:** 0.1–100 kpc from origin.
**Tour timing:** T+0:25 → T+0:36 (11 s — tied with Shell 7 for the longest beat).
**Status:** Draft, awaiting review. Hard dependency on the [Milky Way impostor spec](../../../specs/2026-05-04-milky-way-impostor.md) (a separate plan; this shell *consumes* it).

---

## 1. Overview

Shell 3 is the moment in the tour where the user stops looking at near-naked-eye sky and starts looking at galactic-scale structure they have never personally seen. It is the first shell whose hero subject is a single object the user is *inside* — we have to show them their own home from the outside, in the same camera move that just left them embedded in stars. It is also the longest single beat (11 s), because the visual reveal — a recognisable spiral with the Sun marked — is the single biggest "ah, that's me" moment in the whole sequence.

This document covers **how the tour uses the Milky Way disk**: camera path, data wiring, per-frame composition, fallbacks. The actual *impostor renderer* (texture sources, billboard math, parametric arms, near-edge tilt handling) lives in the impostor spec linked above. When that spec is silent or insufficient for the tour's needs, this document is the source of truth for what the tour *requires* from it (see §12).

The shell budget is **4 ms / frame**: ~3 ms impostor, ~0.5 ms for ~30 globulars + Sun marker + halo overlay, ~0.5 ms label projection slack.

---

## 2. Visible elements

In the order they appear during the 11-second beat:

1. **Diffuse halo glow** — fades in first (T+0:24 → T+0:26, overlapping the Shell 2 transition). A soft Gaussian falloff from the disk plane that gives "this thing has an atmosphere of stars" before the disk itself resolves. Implemented as a procedural full-screen pass; cheap.
2. **The impostor disk** — the hero. Becomes legible around T+0:26 as the camera arcs into a viewing angle. Dominates the frame by T+0:30.
3. **Sun marker** — a small pulsing dot at heliocentric origin in galactic coordinates (−8.122, 0, +0.0208) kpc. Pulse period 1.2 s. Always visible, even edge-on (the marker billboards toward the camera).
4. **Globular cluster sprinkles** — ~30 of the brightest Messier and Harris globulars, fading in from T+0:30. Soft-falloff billboards, off-white tint, sitting visibly *above* and *below* the spiral plane (they live in the halo, not the disk).
5. **Magellanic Clouds at edges** — LMC and SMC fade in T+0:33 → T+0:36 as small fuzzy patches at the disk's lower edge, prefiguring Shell 4. They use the same fuzzy-sphere primitive Shell 4 deploys for dwarf companions, ensuring continuity.

The halo and the disk are the two heaviest passes; everything else is sparse and cheap.

---

## 3. Data requirements

Full acquisition plan in [`../data/03-milky-way-model.md`](../data/03-milky-way-model.md). For shell 3 the inputs we *consume*:

- **Composite disk texture stack** — 4 layers, equirectangular galactic-coordinate, 2048 × 1024:
  - NASA SVS visible-light render (base layer for "looks like a galaxy").
  - 2MASS K-band stellar density (modulates brightness, removes Solar-neighborhood foreground bias).
  - IRAS 100 µm dust map (multiplied as a dust-lane mask, tinted reddish-brown).
  - Parametric four-arm logarithmic spiral (analytic, evaluated in the impostor shader, additive at low alpha for arm legibility).
- **Sun position** — constant `(−8.122, 0, +0.0208)` kpc galactocentric. From [Gravity Collaboration 2019](https://ui.adsabs.harvard.edu/abs/2019A%26A...625L..10G/abstract) and [Bennett & Bovy 2019](https://ui.adsabs.harvard.edu/abs/2019MNRAS.482.1417B/abstract).
- **Globular cluster catalog** — pruned [Harris 1996 (2010 ed.) MWGC](https://physwww.mcmaster.ca/~harris/mwgc.dat) to brightest ~30 (V_int < −8). Columns: name, galactocentric XYZ in kpc, integrated V magnitude, half-light radius in arcmin.
- **Magellanic Cloud positions** — two hard-coded entries: LMC at (−0.7, −41, −27) kpc, SMC at (15, −38, −44) kpc, derived from RA/Dec/distance via `src/utils/math/raDecZToCartesian.ts` with z replaced by literal distance.

Total runtime weight: ~6 MB (BC7-compressed textures) + ~3 KB (globular JSON) + a few hard-coded constants. Pre-fetched at tour start; no progressive loader needed.

---

## 4. Visual design

The shell juggles three competing goals:

1. **Spiral arm legibility at any camera angle.** A real Milky Way photographed from outside is mostly a fuzzy ellipse — arms are only ~10% over-density above inter-arm field. We boost arm contrast in the parametric overlay so the user sees what astronomers *call* arms (Perseus, Sagittarius, Scutum-Centaurus, Orion Spur). The 2MASS K-band layer keeps the underlying *light* distribution honest; the spiral overlay just makes structure findable. Pure fidelity would be illegible; pure cartoon would be embarrassing.

2. **Edge-on → top-down arc handled gracefully.** This is the impostor's hardest job and the reason the shell needs an impostor at all (a flat decal would look obviously fake during the tilt). From the tour's perspective: **never dwell at a transition angle.** The tilt is fast (~4 s of the 11 s beat). At edge-on (T+0:28) and top-down (T+0:32) the camera holds for ~1 s each so the user reads each view; intermediate angles flash past in <0.5 s.

3. **Dust lanes as features, not bugs.** A real edge-on Milky Way is bisected by a dark dust lane — the most photographically iconic feature of the disk. The IRAS layer multiplies a `1 − dust * 0.7` factor so dust *darkens* rather than lights up red. The brown tint comes from interpolating the unobscured disk color toward `#3a2418` rather than toward black, which reads as "warm dust" rather than "missing pixels."

Color grading: warm-cream (~5500 K) baseline, bulge slightly warmer (~4500 K, K-giant flavor), arms slightly cooler (~7000 K, hot young populations). Halo glow is desaturated bluish-white (old metal-poor halo stars) at ~5% of disk peak intensity. All implemented in the impostor shader; the tour just chooses the camera path that shows it off.

---

## 5. Camera path

The 11-second beat is one continuous move with four named waypoints:

```
WAYPOINT  TIME   DISTANCE  TILT   FOV   PURPOSE
─────────────────────────────────────────────────────────
ENTER     0:25   30 kpc    +5°    50°   "still inside the disk"
EDGE_ON   0:28   45 kpc    +0°    45°   "look at it from the side"
TOP_DOWN  0:32   60 kpc    +90°   55°   "now see the structure"
EXIT      0:36   95 kpc    +60°   60°   "pull back, MCs visible"
```

`DISTANCE` is from galactic center in kpc. `TILT` is the angle between view direction and galactic plane (0° = edge-on, 90° = polar). `FOV` widens through the beat to reinforce pull-back without demanding extreme distances.

The path is a Catmull-Rom spline through the four points with C1 continuity and an ease-in-ease-out time warp. Tilt uses a separate cubic spline because we want angular motion to *lead* translation slightly — the camera tilts before it pulls back, so the structural reveal happens during the slowest part of the move, not at the end.

The camera never crosses the disk plane (tilt path is +5° → 0° → +90° → +60°, always above). Crossing would briefly bisect the screen with the dust lane and look like a glitch. The impostor spec assumes "+Z is camera-side" can be enforced by flipping the world transform on shell entry; the tour calls that flip — see §12.

**Entry from Shell 2:** at T+0:24 the Shell-2 stars are still visible. The Shell-3 halo glow fades up *underneath* them on its own depth attachment. Over T+0:24 → T+0:26 the stars' `fadeAlpha` drops to 0 and the impostor's rises to 1. Because the stars fade out cleanly, we do not need the depth-occlusion logic flagged as Open Question 1 in [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md).

**Exit to Shell 4:** at T+0:36 the camera is at 95 kpc, just inside the 100 kpc boundary. Shell-3's `fadeAlpha` begins to drop; Shell-4's dwarf-fuzzy + M31-disk renderer fades up. The Magellanic Clouds drawn here are the same objects Shell 4 will draw a moment later from a different distance — we hand them off cleanly, and the user reads them as continuous.

---

## 6. Render pipeline

Shell-3 render pass, back-to-front:

```
1. clear      — sky color (#000005); depth cleared to far-z (reverse-Z 0.0)
2. halo       — full-screen procedural Gaussian; writes color, no depth
3. impostor   — MW impostor renderer (per separate spec); reads/writes depth
4. globulars  — instanced billboards; reads/writes depth
5. mcs        — two LMC/SMC fuzzy disks; reads/writes depth
6. sun        — single Sun marker billboard; reads/writes depth
7. labels     — MSDF labels: "Milky Way," "Sun," "Sgr A*", optional "Orion Spur"
```

Composite onto the shared backbuffer with the shell's `fadeAlpha`.

Globulars, Magellanic Clouds, and the Sun marker all use the same instanced-billboard pipeline — the existing point renderer's shader path with `kPerZ = 0` (fixed apparent size in pixels) and per-instance color/size override. Wrap them as one `shell3PointRenderer` with three small upload buffers. Total per-shell draw call count: ~5.

The halo pass is a single full-screen quad with a procedural ellipsoidal Gaussian — no texture, no buffer. ~20 lines of shader, ~0.2 ms at 1080p.

---

## 7. Sun marker

The Sun marker is the emotional anchor of the shell. Without it, the spiral disk is "a galaxy"; with it, it is "*your* galaxy."

Position: galactocentric `(−8.122, 0, +0.0208)` kpc — roughly halfway out (the disk extends to ~15 kpc), in the inter-arm region between Sagittarius and Perseus. This is the **Orion Arm** (or "Orion Spur"), a minor structure rather than a major arm. We do *not* over-emphasise it in the parametric overlay; the Sun's position should land visibly *between* arms, not on top of one. This honesty is more interesting than a triumphal "we are on a major arm" lie.

Visual:

- A 6-pixel circular billboard, color `#ffe89a` (warm sun-yellow, slightly desaturated to keep it from fighting the disk warmth).
- A pulsing 12-pixel halo ring at 30% alpha, period 1.2 s, sine-eased — should *breathe*, not blink.
- A 1-pixel-wide leader line to a small "Sun" label 24 px away in screen space, drawn via the MSDF pipeline.

Drawn last among in-disk elements (after globulars) and writes to depth so it correctly occludes background but is correctly occluded by foreground (e.g., a globular passing in front during a free-fly orbit).

---

## 8. Globular clusters

Brightest ~30 Messier and Harris globulars. Selection: integrated absolute V magnitude < −8 from Harris 1996 (2010 ed.), which yields 28 entries; pad to 30 by adding NGC 2419 ("the Intergalactic Wanderer", visually compelling outside the disk) and Omega Centauri (largest Galactic globular).

Per-entry record:

```ts
type GlobularEntry = {
  name: string;                            // "M13", "NGC 2419"
  position: [number, number, number];      // galactocentric kpc
  apparentBrightness: number;              // 0..1, normalised from V mag
  halfLightRadiusKpc: number;              // for billboard sizing
};
```

Visual: soft-falloff Gaussian billboard sized by `halfLightRadiusKpc / cameraDistance * fovScale`, clamped to [3 px, 18 px]. Color `#fff4dd` — slightly warm tint, distinguishable from the cooler halo glow.

Globulars do *not* get labels by default — 30 labels would overwhelm the frame. Hover any globular when paused to reveal a label via the existing pick pipeline. Two exceptions: **M13** and **Omega Centauri** get permanent micro-labels at 60% alpha when the camera is within 20 kpc.

The 30-entry cap is deliberate. Full Harris is ~157; rendering all of them would be a confetti splatter. 30 is the largest count where each sits visually distinct.

---

## 9. Transitions

**In (T+0:24 → T+0:26):**

- Shell 2's per-instance star alpha fades to 0 over 2 s.
- Shell 3's `fadeAlpha` ramps 0 → 1 over the same 2 s.
- The halo glow *overshoots* slightly — peaks at 1.2× steady-state at T+0:25.5, settles to 1.0 by T+0:27. This masks the moment of crossfade and gives the disk's emergence a soft "bloom in" feel rather than a hard switch.
- The impostor's internal `disk_emergence` parameter (see §12) controls the blend: outermost low-frequency halo layer first, structured disk layers second, both inside the same 2 s window. The tour sets `disk_emergence = saturate((t − 0:24) / 2)`.

**Out (T+0:34 → T+0:38):**

- Shell 3's `fadeAlpha` ramps 1 → 0 over 4 s (longer than the in-fade because the composition is richer).
- Sun marker, globulars, MC fuzzies fade with the shell.
- M31 (a Shell-4 element) fades up from ~T+0:35 in the upper-left, scripted to swim into view as the camera continues outward. M31's apparent screen position must be pre-computed at the T+0:36 vantage so the cross-shell handoff lands the disk in the intended quadrant.

---

## 10. Performance budget

Total Shell 3 budget: **4 ms** of the 16 ms 60-fps frame.

| Pass | Cost | Notes |
|------|------|-------|
| Halo glow | ~0.2 ms | Procedural full-screen, no texture. |
| Impostor disk | ~3.0 ms | Four-layer composite sampled in one pass via packed BC7 atlas. |
| Globulars (~30) | ~0.1 ms | Trivial billboard pass. |
| Magellanic Clouds (2) | ~0.05 ms | Same shader. |
| Sun marker (1 + leader + label) | ~0.05 ms | Pulse computed in vertex shader. |
| Labels (~3) | ~0.3 ms | MSDF. |
| **Total** | **~3.7 ms** | ~0.3 ms slack. |

Headroom: during the in/out crossfade bands shells 2 and 4 are also rendering (~3 ms combined). We must stay under ~7 ms total during transitions, leaving ~9 ms for post-process and labels. The numbers fit — barely. The impostor is the load-bearing cost; if it blows past 3 ms on low-tier mobile, we drop to fallback (§11).

---

## 11. Mobile fallback

Triggered by skymap's existing `isLowPower` heuristic (touch + small viewport + integrated GPU):

- Impostor renders in **lowest-LOD mode** (per impostor spec): a single 1024 × 512 BC7 composite of all four layers pre-baked at build time, no parametric arms, no shader-side dust modulation. One texture sample per pixel.
- Halo glow pass dropped (the impostor's bake includes a faint baked halo).
- Globular count drops to **10 entries** (the brightest only).
- Magellanic Clouds remain (2 instances is free).
- Sun marker remains. *Never drop the Sun marker* — it is the emotional anchor.

Expected mobile cost: ~1.5 ms / frame. Visual difference: arms slightly less crisp; halo softer; fewer globulars. Sun marker, disk silhouette, spiral structure all read correctly. The tour beat plays at full speed — we never slow the tour to compensate for fidelity.

---

## 12. Coordination with the impostor plan

The impostor spec at [`../../../specs/2026-05-04-milky-way-impostor.md`](../../../specs/2026-05-04-milky-way-impostor.md) must land before this shell can ship. From the tour's perspective the impostor must expose:

```ts
type MilkyWayImpostorRenderer = {
  init(device: GPUDevice, format: GPUTextureFormat): Promise<void>;
  dispose(): void;

  setDiskEmergence(t: number): void;            // 0..1, "fade in from halo"
  setArmContrast(t: number): void;              // 0..1, arm-overlay strength
  setCameraSide(side: 'north' | 'south'): void; // disk-plane side
  setLodTier(tier: 'high' | 'medium' | 'low'): void;

  render(
    pass: GPURenderPassEncoder,
    ctx: RenderContext,
    cameraPosKpc: [number, number, number],
    cameraDirKpc: [number, number, number],
  ): void;
};
```

Things this shell needs that the current impostor draft does not yet specify (or specifies ambiguously):

1. **Camera-side flip.** Must support rendering from above *or* below the disk without artefacts. Current draft handles only "above." Tour-side fix is trivial (`setCameraSide`); impostor-side may require flipping the dust-layer Z order.
2. **`disk_emergence` parameter.** Used during the Shell 2 → Shell 3 crossfade. Current draft has a single `alpha` that fades the whole impostor; we need finer control — halo emerges first, structured layers second, over the same 2 s.
3. **Galactocentric coordinate input.** Impostor must accept camera position in kpc galactocentric, not heliocentric. Conversion (subtract Sun position) happens in the orchestrator, but the impostor's internal sampling math must assume galactocentric.
4. **Generalisation to a `SpiralDiskImpostor` primitive.** Shell 4's M31 impostor is the same problem at a different scale. If the MW impostor stays MW-specific, we accept the duplication, but the cleaner outcome is a shared primitive that both shells parameterise.

If the impostor spec rejects these, this shell falls back to its existing API plus an external full-screen blur for `disk_emergence`, and accepts the camera-side restriction by keeping the camera always above the plane (already true in §5, so no real cost).

---

## 13. Open questions

1. **Permanent Sun marker across all shells?** A persistent "you are here" dot, fading in screen size at outer scales, would reinforce the narrative spine. **RECOMMENDATION:** defer to v2 — risk of UI clutter; see [`../ux/01-information-overlays.md`](../ux/01-information-overlays.md).
2. **Draw the Galactic bar?** The MW is a barred spiral; the bar is ~6 kpc end-to-end at ~25° from the Sun-GC line. Adding it makes the shell more accurate but adds shader complexity. **RECOMMENDATION:** include in high LOD, omit medium/low.
3. **Label "Orion Arm" near the Sun marker?** Earns the optional T+0:31 narrative beat but the Spur is minor — labelling implies major-arm status. **RECOMMENDATION:** label as "Orion *Spur*", small font, only at the top-down waypoint.
4. **Globular catalog version.** Harris 1996 (2010 ed.) vs. Gaia DR3 re-derivation. **RECOMMENDATION:** keep Harris for v1; visual difference at this scale is sub-pixel.
5. **Magellanic Clouds: fuzzies vs. impostors.** Current plan: fuzzies in Shell 3 (edge of frame), impostors in Shell 4 (centre of attention). The LMC has visible bar + arms — impostor would be more accurate. **RECOMMENDATION:** stick with the split; reconsider if Shell 4 demands a `SpiralDiskImpostor` primitive that's cheap enough to use here too.

---

## 14. Test criteria

Ships when, in order:

1. **Visual review (manual):** the user takes the tour from T+0:00 and confirms that at T+0:32 they see a recognisable spiral with a visible Sun marker and recognise it as "the Milky Way." This is the only true success criterion.
2. **Frame-time:** with the dev-server per-shell ms readout, Shell 3 stays < 5 ms on M2 / Apple Silicon at 1080p across the full 11 s beat.
3. **Mobile frame-time:** on iPhone 13, > 50 fps with low-LOD impostor and 10 globulars.
4. **Crossfade continuity:** no visible flicker, popping, or hard alpha boundaries during in (T+0:24 → T+0:26) or out (T+0:34 → T+0:38) crossfades. Verified by frame-by-frame capture.
5. **Free-fly correctness:** if the user pauses Shell 3 and orbits manually, the impostor renders correctly from all viewing angles (above, edge-on, below the plane). May surface impostor-side bugs not caught by the scripted path.
6. **Fallback path:** with a simulated impostor-texture fetch failure, the tour continues with the baked low-LOD fallback and the user does not notice (or, at worst, sees a slightly less crisp disk).
7. **Vitest coverage:** shell-3 pure-function tests (waypoint interpolation, galactocentric conversion, globular catalog filtering) at 100% line coverage. Renderer tests are visual; covered above.

---

## 15. Files touched

New:

```
src/services/engine/shells/
  shell3MilkyWay.ts         — ShellRenderer implementation (orchestrator)
  shell3CameraPath.ts       — four-waypoint Catmull-Rom path
  shell3PointRenderer.ts    — globulars + MCs + Sun marker (3 buffers, 1 pipeline)
  shell3HaloPass.ts         — procedural halo glow

src/data/
  globularClusters.ts       — 30 Harris entries, hard-coded
  magellanicClouds.ts       — LMC + SMC positions
  sunPosition.ts            — galactocentric Sun constant

src/services/gpu/shaders/
  shell3Halo.wesl
  shell3Markers.wesl

tests/services/engine/shells/
  shell3MilkyWay.test.ts
  shell3CameraPath.test.ts
```

Modified:

```
src/services/engine/shellRendererRegistry.ts — register shell 3
src/services/engine/runFrame.ts               — tour script consumes shell 3
src/data/shellDefinitions.ts                  — add shell 3 row
public/data/                                  — milky-way-composite.bc7 (~6 MB)
```

Consumes (separate spec, must land first):

```
src/services/gpu/milkyWayImpostor.ts          — impostor renderer (per impostor spec)
src/services/gpu/shaders/milkyWayImpostor.wesl
public/data/milky-way-composite.bc7
```

---

**See also:**
- [`./00-shell-overview.md`](./00-shell-overview.md) — the nine-shell index.
- [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) §"SHELL 3 — MILKY WAY" — the tour copy this shell implements.
- [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) — multi-shell coordinate framework.
- [`../data/03-milky-way-model.md`](../data/03-milky-way-model.md) — composite texture and globular catalog acquisition.
- [`./02-stellar-neighborhood.md`](./02-stellar-neighborhood.md) — preceding shell (T+0:24 handoff in).
- [`./04-local-group.md`](./04-local-group.md) — following shell (T+0:36 handoff out).
- [`../../../specs/2026-05-04-milky-way-impostor.md`](../../../specs/2026-05-04-milky-way-impostor.md) — the impostor renderer spec (hard dependency).
