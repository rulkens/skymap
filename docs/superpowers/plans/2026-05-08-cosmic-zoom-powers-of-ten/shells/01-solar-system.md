# Shell 1 — Solar System

**Status:** Deep spec. Implementation-grade; ready for a writing-plans pass once open questions are resolved.
**Tour beat:** `T+0:08` → `T+0:14` (6 s on-screen), with the dolly-in to the Sun starting at `T+0:01`.
**Native unit:** AU (1 AU = 4.848 137 × 10⁻¹² Mpc).
**Camera origin (anchor):** Sun heliocenter.
**Visible volume:** 0.01 AU (just inside the photosphere) → 200 AU (just past Sedna's perihelion).
**Hero data:** NASA JPL DE440 ephemeris snapshot at J2025.0.
**Spec sibling for data:** [`01-solar-system-ephemeris.md`](../data/01-solar-system-ephemeris.md).
**Dependency on rendering foundation:** [`00-scale-architecture.md`](../rendering/00-scale-architecture.md).

---

## 1. Overview

This is the second-deepest shell of the tour (the photosphere itself is the deepest), and the user's **emotional grounding point**. Every later shell is "look how much bigger than this we go." If shell 1 doesn't read as familiar, the rest of the tour loses its reference frame.

The user's beat: *"That's the Sun. That's where I live. And we're about to leave."*

The shell does three things:

1. **Sells "this is the Solar System we know."** Recognizable Sun, recognizable planet ordering, recognizable orbits. Earth is unambiguously blue. Saturn unambiguously has rings. No artistic licence with the inventory.
2. **Establishes the visual grammar of the tour.** Soft black background, accurate but readable scale, thin orbital lines, generous bloom on the central source, MSDF labels on hover or auto-revealed for the four named planets. Every later shell inherits these choices.
3. **Sets up the next transition's punchline.** The overlay copy ends with *"the nearest other star is 4 light-years away — 1,800 times further than Pluto."* Shell 2 then immediately shows that scale. Shell 1's exit waypoint must visually justify the "1,800 times" claim — i.e., the camera has to be far enough out at `T+0:14` that the Pluto orbit is genuinely small in the frame, so the leap to interstellar feels earned.

## 2. Visible elements

We are opinionated. The shell renders **exactly** the following objects, no more, no less:

### 2.1 The Sun

- One textured / shaded sphere (or impostor — see §6) at the shell origin.
- Apparent angular size on screen is governed by camera distance and the **true** solar radius (0.00465 AU). At the inner end of the camera path (the dolly into the photosphere) the Sun fills the frame; by `T+0:14` it is roughly a 6-pixel disc with bloom.
- Bloom on the Sun is the only HDR / glow source in the shell. Everything else stays LDR.

### 2.2 The eight major planets

Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.

- One billboard each. Position from the J2025.0 ephemeris snapshot.
- **Apparent size is exaggerated** — see §4.3. True-scale Earth at 1 AU is roughly 1/600th of a pixel; we render it at ~3 px minimum.
- Per-planet color is data-driven from a static lookup (`src/data/solarSystemBodies.ts`). Earth blue (#3a6fa8), Mars rusty orange-red (#c0623a), Jupiter cream-banded (#d4ad7a with horizontal banding texture), Saturn pale yellow (#e6cf99) with a billboarded ring sprite, Neptune deep cyan (#3e6cab), and so on. This is texture rather than physically-based shading — at billboard scale, the difference is invisible.
- Labels (MSDF) for **Earth, Jupiter, Saturn, Pluto** auto-fade in between `T+0:11` and `T+0:13`. The other planets stay unlabeled to avoid clutter; they're recognizable by position.

### 2.3 Pluto and the outer-orbit framing

- Pluto is rendered as a small grey billboard with a label. **Why include Pluto specifically when we exclude the other dwarf planets?** Because the overlay copy explicitly compares Proxima Centauri's distance to Pluto's, and the user must see Pluto's orbit as the implicit "edge of the Solar System we grew up with." Excluding it would defeat the punchline.
- Other dwarf planets (Eris, Makemake, Haumea, Ceres, Sedna) are **not** rendered in v1. They add inventory complexity for negligible recognition gain. See §10 for the open question about whether to add them.

### 2.4 Orbital lines

- One thin elliptical line per planet + Pluto. Computed from the **osculating Kepler elements at J2025.0** (six elements per body — semi-major axis, eccentricity, inclination, longitude of ascending node, argument of perihelion, mean anomaly). These produce a closed ellipse to within visual tolerance over a single orbit; we draw 256 segments per ellipse.
- Color: 12% white. Subtle, not distracting. Inner planets get marginally higher alpha (16%) so Mercury's tight orbit stays legible against the Sun's bloom.
- Eccentricity and inclination are real. **Pluto's tilted orbit is visibly out of the ecliptic plane** — this is a free educational moment that costs nothing to render.

### 2.5 The asteroid belt — implied, not rendered

We do **not** render individual asteroids. The Main Belt has ~10⁶ tracked bodies; even a representative 5,000-point subset would be expensive to fetch, distracting on screen, and indistinguishable from a uniform haze.

Instead: a **faint torus-shaped haze sprite** at 2.2–3.2 AU, ecliptic-aligned, ~6% opacity, dust-tan color (#a8896a). Drawn as a single textured ring quad. This reads as "the asteroid belt is here" without committing to per-body data. Below the threshold of "lying" (Saturn's rings are real-looking; the asteroid belt is impressionistic). Cost: one quad, one texture sample.

### 2.6 The Kuiper belt — also implied

Same treatment as the asteroid belt: a wider, dimmer torus haze at 30–50 AU, slightly more diffuse, ~4% opacity, neutral grey. Frames Pluto's orbit nicely.

### 2.7 The Oort cloud — a faint sphere hint

A single very dim transparent sphere at ~2,000 AU, alpha ≤ 2%, drawn only during the **last 0.5 s** of the shell as a quick "and there's more out there" gesture before the transition to shell 2. It fades in alongside the start of the orbit-lines fade-out.

**Why include it at all?** The Oort cloud is the actual edge of the Solar System if you take "gravitationally bound to the Sun" as the boundary. Showing it as a hinted sphere — not as discrete points (we have no positional data; the cloud is hypothetical) — does honest pedagogical work: the Solar System is much, much bigger than the planet orbits suggest. This dovetails with the "1,800 times further" overlay copy.

If it looks bad in practice, cut it. It is the most expendable element in the shell.

### 2.8 What we explicitly do not render

- The Moon (and other planetary moons). At this scale Earth and the Moon are coincident pixels.
- Comets. Beautiful but require ephemeris-time-dependent positions and tail rendering — defer (see §10).
- Spacecraft positions (Voyagers, New Horizons). Tempting for "look how far we've gotten" copy, but adds a UI affordance we haven't designed. Defer.
- The heliopause, the termination shock, the bow shock. Pedagogically rich, visually noisy, and not in the overlay copy.

## 3. Data requirements

The full data spec lives in [`01-solar-system-ephemeris.md`](../data/01-solar-system-ephemeris.md). Summary here:

- **Source:** NASA JPL Horizons API (web), backed by the DE440 ephemeris.
- **Snapshot:** positions and Kepler elements for the eight planets + Pluto at the **fixed epoch J2025.0** (2025-01-01.5 TT). We do not animate. The Solar System is frozen.
- **Why frozen?** The tour is a 6-second beat. Real-time Kepler integration would add WGSL shader complexity (or per-frame CPU work) for an effect no one will see. A snapshot also makes the build deterministic.
- **Format:** a hand-edited TypeScript constant `SOLAR_SYSTEM_J2025` in `src/data/solarSystemBodies.ts`. ~1 KB of literals. No `.bin` file, no R2 sync. The data is small enough that bundling beats fetching.
- **Acquisition:** one-shot manual fetch via Horizons' web UI. The `tools/fetchSolarSystem.ts` script (new) documents the exact query parameters, but the script's job is one-time. The output is committed to git as a hand-readable TS literal — small enough that diffing is meaningful.
- **Coordinate frame:** equatorial J2000 (skymap's existing convention), in AU. The shell's render unit is AU, so positions go straight into the vertex buffer.

## 4. Visual design

### 4.1 Color palette

| Element | Color | Rationale |
|---------|-------|-----------|
| Sky / background | `#000000` | Black. Stars are off-screen here; the Sun's bloom is the only light source. |
| Sun core | `#fff4d6` | Warm white-yellow. Slightly off-white so it doesn't burn out — bloom does the rest. |
| Sun corona | `#ffd58a` → `#ff7a3a` (radial) | Warm fade. Subtle. |
| Orbit lines | `#ffffff` at 12% alpha (16% inner planets) | Neutral; the data does the talking. |
| Mercury | `#9b8a78` | Dust grey. |
| Venus | `#e6c89c` | Pale yellow-tan. |
| Earth | `#3a6fa8` | Recognizable blue. |
| Mars | `#c0623a` | Rusty. |
| Jupiter | `#d4ad7a` + horizontal banding | Cream + bands. |
| Saturn | `#e6cf99` + ring sprite | Pale gold. |
| Uranus | `#a4d3d6` | Pale cyan. |
| Neptune | `#3e6cab` | Deep blue. |
| Pluto | `#9c8676` | Greyish tan. |
| Asteroid belt haze | `#a8896a` 6% | Dust. |
| Kuiper belt haze | `#888888` 4% | Cold grey. |
| Oort cloud sphere | `#ffffff` 2% | Just a hint. |

### 4.2 Why we use a black sky here, not a starfield

Shell 2 is the starfield. Shell 1 must read as *Solar System diagram*, not *night sky.* Adding stars behind the orbits makes Pluto's orbit unreadable and undermines the "we are leaving" emotional beat at `T+0:14`, when the stars then appear and the user's brain registers a real change.

### 4.3 Scale exaggeration

True-scale rendering is a non-starter. At a camera distance that fits Pluto's orbit (~80 AU), the Sun is ~0.001% of the frame width. Earth is invisible.

We use a **two-tier visual scale**:

- **Sun:** rendered at *true* radius. The bloom does the legibility work. At `T+0:14` the Sun is a 6-pixel disc with a glow; the user sees a star, not a sphere.
- **Planets:** rendered at a **clamped apparent size** computed per-frame:

```ts
const apparentPx = clamp(planetRadiusAU / cameraDistAU * focalLengthPx, 3.0, 24.0);
```

At the inner camera position (~5 AU from the Sun), Jupiter is at the upper clamp (~20 px). At the outer position (~80 AU), Mercury is at the lower clamp (3 px). This sacrifices physical accuracy for legibility — but the **positions** stay accurate, which is the pedagogically important property. The user reads "Mars is the fourth one out, and it's noticeably closer to the Sun than Jupiter is" correctly. They read "Jupiter is bigger than Earth" approximately, but it is.

Per-planet exaggeration factors are tuned in `solarSystemBodies.ts` — Jupiter's clamp is intentionally higher than the math gives, to lean into recognition.

### 4.4 Orbit aesthetics

- 256 line segments per ellipse, drawn with a 1.0 px line width (or 1.5 px on hi-DPI displays after `devicePixelRatio` accounting).
- Anti-aliased via the standard line-strip pipeline (smoothstep falloff in the fragment shader).
- No depth-write — orbits never occlude each other or the planets. They live at all-Z and composite via straight alpha.
- Slight per-orbit color tint (5% saturation toward the planet's body color) so adjacent orbits are subtly distinguishable. This is at the bottom of the polish list — drop it if it's noisy.

### 4.5 Sun appearance

The single most distinctive visual in the shell. The user is going to *see the Sun's surface* in the dolly-in, so it must not look like a flat decal. See §6 for the rendering technique.

## 5. Camera path

The shell has two phases: the **dolly** (`T+0:01` → `T+0:08`) and the **shell beat** (`T+0:08` → `T+0:14`). Both belong to this shell's spec because the dolly target is the Sun and the dolly only makes sense given Sun rendering exists.

### 5.1 Camera waypoints

| Time | Position (AU, heliocentric ecliptic) | LookAt | FoV | Notes |
|------|--------------------------------------|--------|-----|-------|
| `T+0:01` | (0, 0, 200) — well outside the orbital plane on +Z | (0, 0, 0) | 35° | Hand-off from cosmic-web view. The wide skymap fades out. |
| `T+0:04` | (0, 0, 10) | (0, 0, 0) | 50° | Approaching. Sun visible as ~50 px disc with bloom. |
| `T+0:05` | (0.005, 0, 0.005) — 0.007 AU from origin | (0, 0, 0) | 70° | Inside the corona. Photosphere fills the frame. **Hold for ~1 s** — this is the "THE SUN" overlay beat. |
| `T+0:06` | (0.5, 0, 0.5) | (0, 0, 0) | 60° | Pulling out fast. Sun shrinks. |
| `T+0:08` | (3, 0.5, 5) | (0, 0, 0) | 55° | **Shell 1 enter waypoint.** Inner planets visible. Slight tilt above ecliptic so orbits read as ellipses, not lines. |
| `T+0:11` | (20, 5, 30) | (0, 0, 0) | 50° | Mid-shell. Outer planets appearing. |
| `T+0:14` | (60, 15, 80) | (0, 0, 0) | 45° | **Shell 1 exit waypoint.** Pluto's orbit frames the bottom-right; the Sun is a small bright dot at center. The Oort sphere is just visible as a faint outline. |

Distances are measured in AU; the (x, y, z) frame is heliocentric equatorial-J2000 (matching skymap's existing convention).

### 5.2 Orientation philosophy

The camera does not roll. Up-vector is fixed to the ecliptic-pole approximation (`+Z` in our convention, modulo the J2000 obliquity). The camera tilts to look down on the ecliptic plane at ~30° — enough to read the orbits as ellipses, not straight lines, but not so much that the planets stack vertically.

There is **no orbital rotation around the Sun** during the shell — the eased pull-back is the only motion. We avoid rotation here to keep the shell readable; rotation arrives in shell 2.

### 5.3 Easing

Standard cosine-ease in/out between waypoints, with one exception: the `T+0:05` photosphere hold is a **dwell**, not a pass-through. The eased curve flattens to near-zero velocity for ~0.8 s before resuming. This dwell is what gives the overlay copy time to land.

The waypoint table is encoded in `tour/shell01Path.ts`, consumed by the camera-choreography subsystem (see [`02-camera-choreography.md`](../rendering/02-camera-choreography.md)).

## 6. Render pipeline

The shell's render passes, in submission order (back-to-front per shell-overview convention):

```
shell 1 frame
  ├── 0. clear color to black, depth to far-z (reverse-Z)
  ├── 1. Oort sphere (only during transition tail; fade-in alpha)
  ├── 2. Kuiper belt haze (one ring quad)
  ├── 3. Asteroid belt haze (one ring quad)
  ├── 4. Orbit lines (line-strip pipeline, ~10 ellipses × 256 segments = ~2560 verts)
  ├── 5. Saturn ring sprite (special-case billboard, drawn before Saturn body)
  ├── 6. Planet billboards + Pluto (instanced, ~9 instances)
  ├── 7. Sun (the heavy pass — see below)
  └── 8. Bloom post-process (Sun is the only HDR contributor)
```

Plus the cross-shell label pass (MSDF), which runs after composition and projects through this shell's matrix for shell-1 anchored labels.

### 6.1 The Sun: ray-marched photosphere vs flat impostor

This is the single design decision in the shell that warrants real engineering thought. Two viable techniques:

**Option A — Procedural ray-marched photosphere**

In a fragment shader, we ray-march a few samples through a thin atmosphere wrapped around an analytic sphere. The photosphere texture is **procedural**: a 3D simplex-noise field sampled at the surface to give granulation, mixed with a domain-warped lower-frequency noise to give magnetic-loop suggestions. Limb darkening is computed analytically from the view-Sun-surface angle. The corona is two additive cone slices outside the photosphere, density falling off as 1/r².

Pros: no texture asset needed; resolution-independent; looks alive even when the camera dwells; mixes correctly with the bloom pass because everything is in HDR linear space.
Cons: ~0.4–0.8 ms per frame at 1080p depending on march steps; procedural noise quality is fiddly; risk of looking "video-gamey" if the noise frequencies aren't tuned to match real photosphere photographs.

WGSL sketch (annotated for the spec — actual implementation would be in `shaders/sun.wesl`):

```wgsl
// Per-fragment ray-march of the Sun's photosphere + corona.
// We treat the Sun as an analytic sphere of radius `solarRadiusAU`
// in shell-relative space. The "march" is a couple of samples through
// a thin shell because the Sun is opaque — most of the work is
// computing the surface noise + limb darkening + corona contribution.

struct SunUniforms {
  viewProj    : mat4x4<f32>,
  invViewProj : mat4x4<f32>,
  cameraPos   : vec3<f32>,   // shell-relative, AU
  time        : f32,          // for slow surface evolution; 0 if frozen
  radius      : f32,          // 0.00465 AU
  coronaScale : f32,          // 1.5 (corona extends to 1.5R)
};

@fragment fn fs_sun(in : VOut) -> @location(0) vec4<f32> {
  let rd = normalize(in.worldPos - uni.cameraPos);
  // Intersect ray with the photosphere sphere centered at origin.
  let hit = intersectSphere(uni.cameraPos, rd, uni.radius);
  if (hit.tNear < 0.0) {
    // Missed the photosphere — try the corona ring.
    return coronaContribution(uni.cameraPos, rd);
  }
  let p = uni.cameraPos + rd * hit.tNear;
  let n = normalize(p);
  // Granulation: 3D simplex noise on the surface, two octaves.
  let noise = simplex3(n * 80.0) * 0.5 + simplex3(n * 320.0) * 0.25;
  // Magnetic loop hint: domain-warped lower-freq noise, brightness bias.
  let loops = smoothstep(0.4, 0.7, simplex3(n * 12.0 + vec3<f32>(uni.time * 0.01)));
  // Limb darkening: classic cos(theta) falloff.
  let mu = max(dot(n, -rd), 0.0);
  let limb = pow(mu, 0.6);
  let baseColor = vec3<f32>(1.0, 0.92, 0.78);
  let surface = baseColor * (0.7 + 0.3 * noise + 0.15 * loops) * limb;
  // HDR — let the bloom pass do the glow.
  let intensity = 8.0;
  return vec4<f32>(surface * intensity + coronaContribution(uni.cameraPos, rd).rgb, 1.0);
}
```

**Option B — Flat impostor with corona ring**

A textured billboard quad always facing the camera. The texture is a high-quality Sun photo (NASA SDO, public domain) baked at 1024×1024. The corona is an additive ring sprite around it.

Pros: ~0.05 ms per frame, trivial; looks genuinely real because it is a real photo.
Cons: stops working as the camera approaches (`T+0:05` photosphere dwell) — a flat billboard breaks down when its angular size dominates the frame; the user sees a flat disc, not a sphere.

**RECOMMENDATION:** Option A for the dolly + dwell beat (`T+0:01` → `T+0:06` while camera is inside or near the corona); Option B for the shell beat (`T+0:08` → `T+0:14` once the Sun is small in the frame). The transition swap happens at the eased waypoint at `T+0:06` when the Sun's apparent size drops below ~50 px. Below that threshold, the impostor is indistinguishable from the ray-march at a fraction of the cost.

This dual-mode renderer is the most novel piece of the shell and warrants its own subspec — see the open question in §10.

### 6.2 Planet billboards

Standard instanced billboard pipeline modeled on `pointRenderer.ts`. Per-instance attributes: shell-relative position (vec3<f32>, AU), apparent-radius-multiplier, body texture index, label flags. The planet body color is sampled from a 9-row 1D texture (Mercury → Pluto); the banding texture for Jupiter / Saturn rings are separate sprite atlas slots.

The billboards orient to the camera each frame. They use a soft circular alpha mask (smoothstep on radius) so they read as discs, not squares.

### 6.3 Orbit lines

A single GPU buffer holds all 9 ellipse vertex strips. The vertex shader computes the screen-space position from a Kepler element triple `(a, e, ν)` per vertex (where `ν` is the true anomaly, sampled at 256 evenly-spaced values per orbit). This means the orbits are effectively analytic — we could re-evaluate them at any future epoch by changing the per-orbit constants in the uniform — but we do not exploit that in v1.

Line anti-aliasing via a fragment-shader smoothstep on signed distance to the center of the line. Standard technique; no novel work.

### 6.4 Belt and Oort haze

One textured ring quad per belt. UV-mapped so the texture wraps once around the torus. The texture is a simple noisy band with alpha falloff at the inner and outer edges. Cost: three quads, three texture samples, a few hundred fragments each.

### 6.5 Bloom

Run the existing bloom post-process pass with the Sun as the sole bright source. Bloom strength is tuned to give the Sun a halo even at 6-pixel apparent size (the `T+0:14` exit framing) — this is what sells "the Sun is still a star" before shell 2 reveals all the others.

## 7. Transitions

### 7.1 Fade-in from cosmic web (`T+0:01` → `T+0:08`)

The existing wide-view (cosmic web) is shell 8's render pass. During the dolly:

- Shell 8's `fadeAlpha` ramps from 1.0 to 0.0 over `T+0:01` → `T+0:04`. The cosmic web becomes a faint haze, then disappears.
- Shell 1's `fadeAlpha` ramps from 0.0 to 1.0 over `T+0:03` → `T+0:08`. There is a 1-second overlap during which both shells composite — the user briefly sees star-like points behind a swelling Sun. This crossfade is the "we're entering somewhere new" beat.
- The Sun's bloom is what visually masks the seam — by the time shell 8 has fully faded, the Sun's glow dominates the frame, so the user doesn't notice the cosmic-web galaxies vanishing.

### 7.2 Fade-out to stellar neighborhood (`T+0:14` → `T+0:15`)

Layered fade in 1 second:

- Orbit lines, belt haze, and Oort sphere fade alpha 1.0 → 0.0 starting at `T+0:14.0`.
- Planets shrink toward 0 px (we lerp the apparent-px clamp's lower bound from 3 to 0) and fade out by `T+0:14.7`.
- The Sun is **not** faded out as a special-case — it persists into shell 2 as the central bright dot. Shell 2's star renderer treats the Sun as a marked star at its origin.
- Shell 2's `fadeAlpha` ramps 0.0 → 1.0 between `T+0:14.5` and `T+0:15.5`. The starfield appears.

This staged fade is what makes the "1,800 times further" copy land: the user sees the Solar System collapse to a point, then *boom* — the surrounding stars fade in, none of which were anywhere near the Pluto-scale view they just left.

## 8. Performance budget

Target: **≤ 2 ms per frame** for the entire shell-1 pass during the shell beat (`T+0:08` → `T+0:14`).

| Pass | Estimated cost | Notes |
|------|----------------|-------|
| Sun (impostor mode) | 0.05 ms | Single textured quad with bloom. |
| Sun (ray-march mode) | 0.5 ms | During dolly only; not active during shell beat. |
| Planet billboards (9 instances) | 0.05 ms | Trivial. |
| Orbit lines (~2560 verts) | 0.1 ms | One draw call. |
| Belt + Oort haze (3 quads) | 0.05 ms | Trivial. |
| Bloom post-process | 0.4 ms | Existing pass; one extra source. |
| Labels (4 planet labels) | 0.1 ms | Existing MSDF pass. |
| **Total (shell beat)** | **~0.75 ms** | Comfortably under budget. |
| **Total (dolly with ray-march)** | **~1.25 ms** | Still under budget. |

The shell is the *cheapest* in the entire tour. Headroom goes to bloom quality and ray-march sample count, both tunable.

Existing renderers we re-use at zero new cost: bloom post-process, MSDF labels, billboard pipeline math in `pointRenderer.ts` (forked, not modified — see §12).

## 9. Mobile fallback

The shell-overview marks shell 1 as "skip" on mobile. Elaboration:

The decision is **not** about render cost — at ~0.75 ms, even mid-tier mobile GPUs handle this easily. The decision is about **information density on a small screen.** At 360 px wide, the Pluto-orbit framing puts inner planets at ≤ 4 px from the Sun's bloom; they're functionally invisible. Mercury is inside the Sun's halo. The pedagogical content collapses.

The mobile fallback path:

- The dolly-in to the Sun **does** play (`T+0:01` → `T+0:06`), with the Sun beat overlay copy intact. This is the visual hook and works fine on mobile.
- At `T+0:06`, instead of pulling back to the Solar System view, the camera **holds** on the Sun for 2 s with a modified overlay: *"The Sun. Around it: eight planets, too small to draw at this scale. The nearest other star is 4 light-years away — 1,800 times further than Pluto."*
- Then the standard transition to shell 2 starts at `T+0:08`.

So mobile users get the Sun beat and the punchline, just not the inventory-of-planets visual. The total shell-1 runtime on mobile shrinks from 13 s to 8 s, which the tour engine accommodates by extending shell 2's runtime by 5 s (the stellar neighborhood reads better on mobile because parallax stars are dots).

The mobile path is selected at tour-init time based on `window.innerWidth < 600 || (devicePixelRatio < 2 && window.innerWidth < 900)`. Override available via `?mobile=force` and `?mobile=off` URL params for testing.

## 10. Open questions / decisions

These need user input before implementation can start.

1. **Do we render comets?** Halley, Hale-Bopp, NEOWISE etc. all have ephemerides and tails are rendered procedurally relatively cheaply. The pro: enormously evocative for first-time tour-watchers. The con: tail rendering is a real piece of work (procedural geometry + alpha sorting + dust-vs-ion-tail color bifurcation), and at the camera distances we use the comet would be sub-pixel. **RECOMMENDATION:** no comets in v1.
2. **Do we render artificial satellites or spacecraft?** Voyager 1's current position (~165 AU) sits within shell 1's outer volume and would justify a "humans have reached here" beat. The pro: deep emotional content. The con: requires per-spacecraft maintenance (Voyager keeps moving) and a UI affordance for the label. **RECOMMENDATION:** add a single "Voyager 1" position marker with label as a stretch goal in v1.1.
3. **Sun: Option A or B or both?** §6.1 recommends both with a swap at `T+0:06`. The alternative is Option B everywhere — cheaper, more "real-looking," but kills the dolly-in's drama. **RECOMMENDATION:** both, swap at the apparent-size threshold, but accept that this doubles the Sun-renderer test surface. User to confirm we want the cinematic effort.

## 11. Test criteria

The shell is "right" when all of the following hold. These map directly to tests in `tests/services/engine/shells/shell01.test.ts` plus a handful of visual screenshot checks.

**Numeric (unit-tested):**

- Planet positions at the J2025.0 epoch agree with the JPL Horizons reference to within `1e-6 AU` per axis (round-trip through `solarSystemBodies.ts` literals).
- Orbit-ellipse vertex generation produces a closed loop (last vertex == first vertex within `1e-9 AU`).
- `shellRelative()` round-trips for all planet positions (subtract Sun origin, add it back, expect bitwise equality after `Math.fround`).
- Apparent-px clamp returns ≥ 3 and ≤ 24 for all planets at all camera positions on the path.
- Apparent-px for Earth at the `T+0:14` waypoint distance lies within `[3.0, 5.0]` (the legibility floor).

**Visual (manual / screenshot regression):**

- Earth is unambiguously blue on a 1080p screenshot at `T+0:11`.
- Saturn's ring sprite is visible at `T+0:11`.
- Pluto's orbit visibly tilts out of the ecliptic plane at `T+0:14`.
- The Sun's photosphere shows non-uniform granulation at `T+0:05` (the dwell beat).
- The Oort cloud sphere is faintly visible at `T+0:14.5` and gone by `T+0:15.5`.
- No visible seam between the ray-marched Sun and the impostor Sun across the `T+0:06` swap (capture frames at `T+0:05.9` and `T+0:06.1`, diff for color discontinuity > 5%).

**Performance (perf harness):**

- 60 fps maintained throughout the shell beat on a baseline laptop iGPU (Intel Iris Xe / Apple M1 base).
- Shell-1 GPU-pass time ≤ 2 ms / frame measured via `performance.now()` between encoder.beginRenderPass() and submit() for the shell-1 passes only.

**Pedagogical (manual):**

- A first-time viewer can name three planets visible in the `T+0:11` frame without prompting. (Show 5 testers; ≥ 4 should succeed.)
- After the shell ends, a viewer can answer "what's the next-nearest star?" using only what was shown. (Answer should be implied by overlay copy + visual contrast with shell 2.)

## 12. Files this touches

**New:**

```
src/data/
  solarSystemBodies.ts       — J2025.0 ephemeris snapshot as TS literals;
                               body color/texture-slot lookup;
                               apparent-px clamp configuration.

src/services/gpu/
  sunRenderer.ts             — dual-mode (ray-march + impostor) Sun pipeline.
  planetRenderer.ts          — instanced planet billboards (forked from pointRenderer
                               so we don't bloat its slot layout with planet-specific fields).
  orbitLineRenderer.ts       — Kepler-elements ellipse line-strip pipeline.
  beltHazeRenderer.ts        — torus-ring quad for asteroid + Kuiper belts.
  oortHintRenderer.ts        — single transparent sphere for the Oort cloud beat.

src/services/engine/shells/
  shell01.ts                 — Shell 1 ShellRenderer implementation
                               (isActiveAt, fadeAlphaAt, render).

shaders/
  sun.wesl                   — ray-march + impostor shader code.
  planets.wesl               — billboard with per-instance body color.
  orbit.wesl                 — anti-aliased line-strip from Kepler elements.
  beltHaze.wesl              — textured torus.

tools/
  fetchSolarSystem.ts        — one-shot JPL Horizons fetch script;
                               output is committed to src/data/solarSystemBodies.ts by hand.

tests/services/engine/shells/
  shell01.test.ts            — numeric tests per §11.
tests/services/gpu/
  orbitLineRenderer.test.ts  — Kepler elements → vertex generation correctness.
  planetRenderer.test.ts     — apparent-px clamp behavior.

assets/textures/
  sun_impostor.webp          — 1024×1024 NASA SDO photo (public domain).
  saturn_rings.webp          — pre-baked ring sprite with alpha.
  jupiter_bands.webp         — banding strip texture.
```

**Modified:**

```
src/services/engine/runFrame.ts            — register shell 1 in the orchestrator.
src/data/shellDefinitions.ts               — add the SOLAR_SYSTEM entry.
src/services/engine/scale/cameraScale.ts   — confirm AU unit conversion is wired.
src/services/engine/shellRendererRegistry.ts — register shell01.
src/components/StatusBar.tsx               — display "Solar System" tier label when in shell 1.
tour/script.ts                             — shell 1 beat with waypoints from §5.
tour/shell01Path.ts                        — the camera waypoint table + ease curves.
```

**Unchanged but read by this shell:** the bloom post-process pipeline, the MSDF label renderer, `cameraScale.ts`'s `shellRelative()` helper, `perShellProjection.ts` (we get a near=0.01 AU / far=200 AU projection for free).

---

Cross-references:
- Camera choreography conventions: [`02-camera-choreography.md`](../rendering/02-camera-choreography.md)
- Shell transition crossfade band: [`01-shell-transitions.md`](../rendering/01-shell-transitions.md)
- Floating-origin and `shellRelative()`: [`00-scale-architecture.md`](../rendering/00-scale-architecture.md)
- Ephemeris acquisition detail: [`01-solar-system-ephemeris.md`](../data/01-solar-system-ephemeris.md)
- Information overlay layout: [`01-information-overlays.md`](../ux/01-information-overlays.md)
- Mobile fallback policy: [`05-mobile.md`](../ux/05-mobile.md)
