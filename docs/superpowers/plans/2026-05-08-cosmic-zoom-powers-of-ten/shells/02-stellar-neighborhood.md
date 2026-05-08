# Shell 2 — Stellar Neighborhood

**Status:** Detailed shell spec. Depends on [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) for the multi-shell coordinate machinery, on [`data/02-gaia-stars.md`](../data/02-gaia-stars.md) for the catalog cut, and on the MSDF labels spec for named-star annotations.
**Tour timing:** `T+0:15` → `T+0:24` (9 s). See [`vision/01-narrative-script.md`](../vision/01-narrative-script.md) for the surrounding beats.
**Native unit:** parsec (`pc`).
**Visible volume:** 0.1 – 100 pc from the Sun.
**Origin anchor:** the Sun (heliocentric, J2000 equatorial — same convention as the rest of the renderer per [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §"Coordinate system handedness").

This is the **second** shell of nine, between Shell 1 (Solar System) and Shell 3 (Milky Way). The user has just watched the planets collapse into a single point of light; this shell is the moment they realise that point of light has *neighbours* — and that those neighbours are the named stars they already know.

---

## 1. Overview — the user beat

Shell 2 owns the cinematic moment **"oh, those are the stars I can see at night, and they have a 3D shape."** Until this beat the user has only ever seen stars as a 2D pattern on the inside of a celestial sphere; this shell yanks that sphere inside-out and shows it as a sparse 3D constellation around the Sun.

Three things have to land in 9 seconds:

1. **Recognition.** The user must spot at least one or two named stars (Sirius is the easiest — bluest and brightest). Recognition is the hook; it converts "I'm watching abstract data" into "I'm watching reality."
2. **Parallax.** The slow camera tilt + orbit must produce visible 3D parallax between stars. A static rendering would look exactly like a planetarium; the parallax is what proves we are *not* in a planetarium.
3. **Foreshadowing.** At ~T+0:20 a faint Milky Way disk glow must begin to appear at the back of the scene, telegraphing Shell 3 before the cut. Without this the Shell 2 → Shell 3 transition feels abrupt.

The shell is **emotionally low-stakes** (the user already knows what stars look like) and **technically trivial** (~7,500 instanced points, no volumetrics, no atlas). Almost all of the design effort here is on *visual quality of the individual star sprite*, because at this density each star is large on the user's retina and any aliasing or color-banding will be obvious.

---

## 2. Visible elements

What occupies the frame during the 9 s of Shell 2:

- **The Sun**, at the origin, rendered as a bright but small sprite (~6 px at the start of the shell, shrinking to ~2 px by the end as the camera pulls back). It does **not** get a corona or a labelled callout in this shell — the Sun was the star of Shell 1; here it's just one of the stars.
- **~7,500 stars from a Gaia DR3 cut at radius ≤ 50 pc** (the Sun's "stellar neighbourhood" by the conventional definition; the 50 pc radius is roughly where Gaia's parallax precision starts to give meaningful 3D positions for the bulk of the catalog). See [`data/02-gaia-stars.md`](../data/02-gaia-stars.md) for the cut criteria, magnitude floors, and the rationale for ~7,500 vs alternative cuts.
- **Named bright stars** that fall inside the visible volume. The label set, in priority order (by user-recognition value), is:
  - **Sirius** (α CMa, 2.64 pc, blue-white, V = -1.46) — always labelled, brightest and bluest.
  - **Procyon** (α CMi, 3.51 pc, F-type yellow-white).
  - **Altair** (α Aql, 5.13 pc, white).
  - **Vega** (α Lyr, 7.68 pc, blue-white).
  - **Fomalhaut** (α PsA, 7.70 pc, white) — bonus if camera angle shows it.
  - **Pollux** (β Gem, 10.36 pc, orange giant) — useful color contrast.
  - **Arcturus** (α Boo, 11.26 pc, red giant) — strongest red.
  - **Betelgeuse** (α Ori, ~168 pc) — **outside** the 50 pc cut. Include only if the data slot also loads a small "famous extras" sidecar of ~30 named stars beyond 50 pc, so we get the red supergiant for color drama. See Open Question 3.

  Of these, **at most 5 labels are on screen simultaneously** (per the labels spec's clutter budget). The MSDF label renderer ranks by apparent magnitude and clamps to the top-5; ties are broken by camera-screen-distance from frame center.
- **A faint diffuse glow at the back of the scene from T+0:20 onward** representing the rising Milky Way disk — this is **not** a Shell 2 element strictly speaking; it's the Shell 3 impostor renderer fading in early to bridge the cut. See §8 (Transitions) for the crossfade math.

What is **not** in this shell:

- No constellation lines. They are an Earth-centric 2D projection and would break the 3D illusion.
- No exoplanet markers. Distracting at this density and the data is not a bottleneck we want to add.
- No Gaia error ellipsoids. Visually noisy; the parallax precision discussion belongs in copy/info-overlay land, not in the render.
- No proper-motion arrows. Tested mentally: at this distance and timescale, arrows would either be invisible (true PM over 9 s of tour) or wildly exaggerated. We use a *very subtle* motion-blur cue instead — see §4.

---

## 3. Data requirements

The full data spec is [`data/02-gaia-stars.md`](../data/02-gaia-stars.md). Summary of what Shell 2's renderer consumes:

A single binary file `public/data/stars-near.bin` containing ~7,500 records, ~32 bytes each (~240 KB on the wire — trivial). Per-record payload, packed:

| Offset | Size | Field | Notes |
|--------|------|-------|-------|
| 0 | 12 | `position[3]` | f32 triple, in **parsecs**, heliocentric J2000 equatorial. Already shell-unit-native; no conversion at upload. |
| 12 | 4 | `bp_rp` | f32 Gaia BP–RP color index. Range typically -0.5 (hot blue) to +4 (cool red). |
| 16 | 4 | `absMag` | f32 absolute G-band magnitude. Used to derive on-screen brightness and sprite size. |
| 20 | 8 | `pmVec[2]` | f32 pair of proper-motion components in the local sky tangent plane (mas/yr → reprojected at build time into a 3D unit vector via parallax + RA/Dec; we only need the screen-projected component for motion-blur, so two f32s suffice). See [`data/02-gaia-stars.md`](../data/02-gaia-stars.md) §"Proper motion encoding". |
| 28 | 4 | `flags` | u32 bitfield: `bit 0 = isNamed` (label candidate), `bit 1 = isVariable` (reserved, unused in v1), `bit 2 = isMultipleSystem` (reserved). Remaining bits reserved. |

Total: 32 bytes/record × 7,500 = 240,000 bytes. Round-trip-fits in a single HTTP request and decodes in <5 ms on a mid-tier laptop.

The named-star label sidecar lives in `public/data/stars-named.json` (not a `.bin` because there are at most 30 entries and the JSON is itself a few KB). Each entry: `{ id, label, anchorIdx }` where `anchorIdx` is the row index into `stars-near.bin`. This avoids storing strings in the binary and keeps the binary record size constant.

The data slot for this shell is `AssetSlot<StarsNearPayload>`, identifier `stars-near`, with the per-shell lifecycle described in [`shells/00-shell-overview.md`](00-shell-overview.md) §"Per-shell data lifecycle". Pre-fetch starts when "Take the tour" is clicked; the slot is `READY` long before T+0:15 because 240 KB downloads in well under a second on broadband.

**Fallback** (per the table in `00-shell-overview.md`): if the fetch fails, the renderer falls back to a hardcoded subset of the 50 brightest named stars within 50 pc, embedded in `src/data/starsFallback.ts` as ~3 KB of TypeScript. The visual is degraded (50 stars instead of 7,500) but the shell still tells its story.

---

## 4. Visual design

This is where most of the design subtlety lives. Stars look easy and are not.

### 4.1 Color from BP–RP

Gaia's BP–RP color index is the difference between blue-photometer and red-photometer magnitudes. Lower (or negative) = hotter & bluer; higher = cooler & redder. We map it to a perceptual RGB triple at fragment-shader time using a **lookup curve in shader uniforms** (a 16-entry array of RGB stops, linearly interpolated).

**Why a curve, not a formula?** A black-body Planck curve at the relevant temperatures gives mathematically correct colors but they are perceptually muddy — real photographs of star fields look more saturated than the physics predicts because human cone cells, photographic saturation, and atmospheric scattering all amplify chroma. We hand-tune a curve that **matches astrophotography references**, then keep it in a shader uniform so it can be tweaked at runtime without a rebuild.

The curve stops are calibrated against Gaia's own published color-temperature relation (Andrae 2018) at the anchor points (BP-RP = 0 → ~10,000 K → blue-white; BP-RP = 1.4 → ~5800 K → Sun-like off-white; BP-RP = 3 → ~3500 K → orange-red), and the in-between stops are nudged for visual punch.

### 4.2 Brightness from absolute magnitude

Apparent brightness on screen = function of (`absMag`, `distance from camera`, `frame-resolution scaling`). We derive an **on-screen flux** in shader:

```
distMod = 5 * log10(distancePc / 10);    // distance modulus in magnitudes
appMag  = absMag + distMod;
flux    = pow(10, -0.4 * (appMag - magRef));   // Pogson's law
```

`magRef` is a uniform that controls overall scene brightness — calibrated such that a V≈0 star (e.g., Vega) renders at saturation white, and a V≈+8 star renders at the visibility floor (~2% of display white).

The flux feeds **two** outputs:
- **Sprite color intensity** = `baseColor * clamp(flux, 0, 1)` — dim stars are dim.
- **Sprite radius in screen pixels** = `lerp(2, 14, smoothstep(0, 1, flux))` — bright stars are bigger. Without a size component the brightest stars wouldn't look brighter; a single-pixel sprite at saturation white is still just one pixel, and Sirius would visually equal a magnitude-+5 star.

This is the **same visual contract** as the existing `pointRenderer` for galaxies, just calibrated for stellar magnitudes instead of galaxy magnitudes. The slot layout and shader prologue can be derived from the galaxy point shader; see §6.

### 4.3 Point sprite vs. disc

We render each star as a **screen-aligned billboard quad** (two triangles, six vertices — the existing instanced billboard pattern from `pointRenderer.ts`), with a **circular antialiased disc + soft Gaussian halo** in the fragment shader. We do **not** use GPU point primitives (`@builtin(point_size)`-equivalents) because:

1. WebGPU does not give us point-size control comparable to OpenGL's `gl_PointSize`. Practically all "round point" rendering on WebGPU is done as billboard quads.
2. Halo bloom on the brightest stars (Sirius, Vega) needs sub-pixel-precise soft falloff. A point primitive can't do that; a quad with a Gaussian fragment shader can.

Fragment-shader sketch (WGSL-ish, full shader in §6):

```wgsl
let r = length(in.uv - vec2(0.5));        // 0 at center, 0.5 at quad edge
let core = smoothstep(0.18, 0.10, r);     // bright opaque core
let halo = exp(-r * r * 16.0);            // Gaussian falloff
let alpha = clamp(core + 0.4 * halo, 0.0, 1.0);
let rgb   = in.color * (core + halo * 0.7);
return vec4(rgb, alpha);
```

The 0.4 scaling on halo and the 0.7 on the rgb channel are tuned so the halo is *visible* on bright stars but does not bloat dim ones into ugly puffballs. Final tuning is a matter of side-by-side comparison against an SDSS or DSS reference image of the same field; expect 1–2 hours of adjustment.

### 4.4 Motion-blur encoding for proper motion

Proper motion at this scale and over a 9-second tour beat is **physically invisible** — even Barnard's Star (the highest known proper motion at ~10 arcsec/yr) moves about 90 microarcseconds in 9 seconds, sub-pixel by ~6 orders of magnitude. So we do **not** show *real-time* proper motion.

Instead, the spec uses motion as a **signal of identity**, not a physical animation:

- Each star's proper-motion vector (`pmVec` in the binary) is **projected onto the screen** in the vertex shader and written to a per-instance varying.
- The fragment shader stretches the disc *very slightly* along this projected direction — the sprite's effective radius along the motion axis is `radius * 1.08`, perpendicular it's `radius * 0.96`.
- The result is a barely-noticeable elliptical elongation. At normal camera position no one will consciously see it. **But** when the camera tilts (the §5 parallax tilt), the relative orientation shifts subtly, giving the field a sense of "alive, dimensional motion" that a perfectly-static starfield lacks.

This is a **stylistic** choice, not a scientific one. Document it as such in code comments — the motion-blur encoding is a perception trick, not a measurement display. See §11 Open Question 1 for the alternative of "skip motion blur entirely."

### 4.5 The Sun in this shell

The Sun is just another star in the binary (`absMag = +4.83`, `bp_rp = +0.82`). It is **not** specially rendered. It sits at position (0, 0, 0) in shell-relative coordinates and gets the same shader treatment as everything else. This is important: making the Sun visually special here would imply "the Sun is the protagonist," which is exactly the wrong message for this shell. The shell's message is "the Sun is one of many."

The user-meaningful "look how small the Sun is now" is conveyed by **scale alone** — the Sun has shrunk from a 600-pixel disc at the end of Shell 1 to a 2-pixel point at T+0:15.

---

## 5. Camera path

The camera arrives at T+0:15 from Shell 1's exit waypoint: ~150 AU (~7×10⁻⁴ pc) from the Sun, looking back inward, just past where the planet orbits collapsed into a point. It exits at T+0:24 toward Shell 3's entry waypoint at ~30 pc above the Sun-galactic-plane normal.

Path in detail, expressed in shell-relative parsecs:

```
T+0:15  pos = (0.0, 0.0, -0.0007) pc       (just outside Solar System, looking +Z toward Sun)
        lookAt = (0, 0, 0)
        fov = 50°

T+0:18  pos = (0.0, +5, -10) pc             (pulled back, slight tilt above ecliptic)
        lookAt = (0, 0, 0)                  (still on Sun)
        fov = 55°

T+0:20  pos = (+8, +12, -25) pc             (orbiting slightly + tilting more)
        lookAt = (0, 0, 0)
        fov = 60°
        — Milky Way disk fade-in begins HERE (alpha 0 → 0.18 over 4 s)

T+0:23  pos = (+18, +20, -55) pc             (wide enough to see ~50 pc volume)
        lookAt = (0, 0, 0)
        fov = 60°

T+0:24  pos = (+22, +22, -75) pc             (handoff to Shell 3 entry)
        lookAt = (0, 0, 0) → drifting toward galactic-center direction over the crossfade
        fov = 60°
```

The **interpolation between waypoints** uses the same eased-spline path machinery as the existing tween system — see [`rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) (referenced by `00-shell-overview.md`; spec to be written).

**Why the tilt + slight orbit?** Pure radial pull-back gives no parallax cue — every star moves radially outward in screen space, indistinguishable from a 2D zoom-out. Adding a few parsecs of perpendicular motion (the y- and orbital x-components) makes nearby stars (Sirius at 2.6 pc) parallax visibly against background stars at 30+ pc. Three to five parsecs of perpendicular travel produces a parallax angle of ~5° for Sirius, which is plainly visible.

**Why FoV widens from 50° to 60°?** A widening FoV during a pull-back accentuates the sense of "the world is opening up," and lets us frame more of the 50-pc volume without having to pull back to a less-cinematic distance. The widening is over 4 s; humans don't perceptually notice it, but they feel the resulting expansiveness.

---

## 6. Render pipeline

A single instanced point-pass. No multi-pass volumetrics, no atlas, no compute work. This is the simplest renderer in the cosmic zoom.

### 6.1 ShellRenderer skeleton

```ts
type StarShellRenderer = ShellRenderer & {
  upload(payload: StarsNearPayload): void;   // one-time GPU upload
  setMagRef(magRef: number): void;            // brightness calibration uniform
};
```

Constructed once at engine init; `upload()` called when the `stars-near` AssetSlot transitions to `READY`. The renderer is **dormant** (skipped in the per-frame orchestrator loop) when `fadeAlphaAt(scale) < 0.001`.

### 6.2 GPU buffers

- **Vertex buffer (quad geometry):** static, 6 vertices, shared with all star renderers (and reusable across other shells' billboard renderers). Layout: `position2[2]` per vertex, defining a unit quad in [-0.5, +0.5]².
- **Instance buffer:** the decoded `stars-near.bin`, uploaded once. Stride = 32 bytes per the §3 layout. WebGPU buffer usage: `VERTEX | COPY_DST`.
- **Uniform buffer:** view + projection matrices (per-shell projection from `perShellProjection.ts` per [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)), `magRef`, `viewportSize`, `time` (for any future variable-star pulsing — not used in v1). The 16-stop color curve is also a uniform, packed as `array<vec4f, 16>` (RGB + stop position).
- **No depth attachment of its own** — uses the per-shell depth attachment provided by the orchestrator. The pass binds the orchestrator's depth target.

### 6.3 WGSL sketch

Vertex shader (per-instance + per-vertex):

```wgsl
struct VInput {
  @location(0) quadCorner : vec2<f32>,    // -0.5..+0.5 quad geometry
  @location(1) starPos    : vec3<f32>,    // shell-relative parsecs
  @location(2) bpRp       : f32,
  @location(3) absMag     : f32,
  @location(4) pmScreen   : vec2<f32>,    // pre-projected proper motion (mas/yr scale)
  @location(5) flags      : u32,
};

struct VOutput {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) uv            : vec2<f32>,
  @location(1) color         : vec3<f32>,
  @location(2) pmDir         : vec2<f32>,   // unit direction in screen space
};

@vertex fn vs_main(in : VInput) -> VOutput {
  // Center of the star in clip space.
  let center4 = uniforms.viewProj * vec4(in.starPos, 1.0);
  let center  = center4.xyz / center4.w;

  // Distance for magnitude calc — use the un-projected camera-space depth.
  let camRel = (uniforms.view * vec4(in.starPos, 1.0)).xyz;
  let distPc = length(camRel);

  // Brightness.
  let appMag = in.absMag + 5.0 * log10(max(distPc, 1e-3) / 10.0);
  let flux   = pow(10.0, -0.4 * (appMag - uniforms.magRef));
  let radius = mix(2.0, 14.0, smoothstep(0.0, 1.0, flux));

  // Quad expansion in pixel space.
  let pxToClip = vec2(2.0 / uniforms.viewportSize.x, 2.0 / uniforms.viewportSize.y);
  let offset   = in.quadCorner * radius * pxToClip;

  // Color via curve lookup.
  let col = sampleColorCurve(in.bpRp);

  var out : VOutput;
  out.clipPos = vec4(center.xy + offset, center.z, 1.0);
  out.uv      = in.quadCorner + vec2(0.5);
  out.color   = col * clamp(flux, 0.05, 1.0);
  out.pmDir   = normalize(in.pmScreen + vec2(1e-6));
  return out;
}
```

Fragment shader:

```wgsl
@fragment fn fs_main(in : VOutput) -> @location(0) vec4<f32> {
  // Anisotropic radius — slightly elongated along PM direction.
  let centered = in.uv - vec2(0.5);
  let along    = dot(centered, in.pmDir);
  let across   = dot(centered, vec2(-in.pmDir.y, in.pmDir.x));
  let r2       = (along * along) / (1.08 * 1.08) + (across * across) / (0.96 * 0.96);
  let r        = sqrt(r2);

  let core  = smoothstep(0.18, 0.10, r);
  let halo  = exp(-r * r * 16.0);
  let alpha = clamp(core + 0.4 * halo, 0.0, 1.0);
  let rgb   = in.color * (core + halo * 0.7);
  return vec4(rgb, alpha);
}
```

The pipeline blend state is **additive** (`src = ONE`, `dst = ONE`) so overlapping star halos sum — physically correct for emissive light sources, and visually correct for "this is a bright cluster region."

### 6.4 Memory + draw call counts

- **Buffers:** vertex (48 B) + instance (240 KB) + uniform (~1 KB) = ~241 KB on the GPU.
- **Draw calls per frame:** 1 (`drawIndexed` with 6 indices, 7,500 instances).
- **Pipeline state objects:** 1.
- **Bind groups:** 1.

Compare to the existing point-cloud renderer's ~3.5M instances and dozens of per-frame uniform updates — this is two orders of magnitude smaller in every dimension.

---

## 7. Labels

Labels use the MSDF label renderer from `2026-05-07-msdf-labels-design.md`, with shell-2-specific anchor logic. Per [`shells/00-shell-overview.md`](00-shell-overview.md) §"Render passes per shell", the labels pass runs after the star pass, projected through the same per-shell projection matrix.

**Anchor:** each label's anchor position is the world-space (shell-relative parsec) position of its underlying star, fetched by `anchorIdx` from the `stars-near.json` sidecar (§3).

**Label set lifecycle within the shell:**

| Time | Event |
|------|-------|
| T+0:15 | Shell starts. **All labels at α=0**. The user is still adjusting to the star field. |
| T+0:16 | Labels begin to fade in. Top-5 by apparent magnitude that fall within ±25° of frame center. Fade duration: 600 ms. |
| T+0:17 → T+0:22 | Labels track their stars across screen as the camera tilts. The MSDF renderer's per-frame layout pass keeps them clear of one another (existing leader-line / repulsion code). |
| T+0:22 | Labels begin to fade out. Same 600 ms fade. The reason: as the camera widens FoV and tilts, more stars become candidates and the label set would otherwise churn distractingly. |
| T+0:24 | All labels at α=0 by handoff to Shell 3. |

**Why the early fade-out?** The last 2 seconds of the shell are about visual transition to Shell 3 (the rising Milky Way glow). Labels would compete with that gestalt change and feel cluttered. The user has already had 5 s to read names; that's enough.

**Variable-pitch label collisions** (e.g., Sirius and Procyon are within ~25° on the sky and labels can overlap in some camera angles): the MSDF renderer drops the lower-priority label (higher apparent magnitude wins; ties broken by alphabetical for determinism). No leader-line system in v1; revisit if testing shows confusion.

**Betelgeuse asterisk:** if Open Question 3 is resolved in favour of including beyond-50-pc named stars, Betelgeuse renders as a dim red point at the far right of frame. Its label has a tiny "(168 pc)" suffix to set expectations — the user might otherwise infer it's nearby.

---

## 8. Transitions

### 8.1 Entry — Shell 1 → Shell 2 (T+0:14 → T+0:16, 2 s crossfade)

At T+0:14 the Shell 1 (Solar System) renderer's `fadeAlphaAt` begins descending from 1 → 0 over 2 s. Simultaneously Shell 2's begins ascending 0 → 1. The orchestrator runs both renderers during the overlap (per [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §"Crossfades").

The visual choreography during the crossfade:

- The Sun + planets collapse into a single point of light. This happens **inside Shell 1's renderer** — the Sun sprite shrinks geometrically as the camera pulls back, the orbits fade to α=0 by T+0:14.5, and the planet billboards become sub-pixel and disappear naturally.
- The Shell 2 starfield fades in **behind and around** the collapsing Sun. By T+0:16, Shell 1 contributes nothing and Shell 2 is fully responsible for rendering the Sun (which is now just one of its 7,500 stars at position (0,0,0)).

The visual seam is invisible because the Sun is rendered by **both** renderers during the overlap, with their alphas summing. Provided the two Sun sprites land at the same pixel and have similar color (Shell 1's yellow-orange Sun should match the BP-RP=0.82 yellow-white of Shell 2's Sun; tune `magRef` to make this true), the user perceives one continuous Sun.

### 8.2 The Milky Way glow at T+0:20

Shell 3's impostor renderer's `fadeAlphaAt` is normally 0 outside the camera's range for Shell 3. We **override** this for the duration of the Shell 2 → Shell 3 transition window via a `tour script hint`: a per-shell `tourFadeOverride: [start, end, peak]` field that Shell 2's beat in `tour/script.ts` sets to `[T+0:20, T+0:25, 0.22]`. This forces the Shell 3 renderer to run early at α≤0.22 — a faint diffuse glow that gradually brightens through the Shell 2 → Shell 3 cut.

**Why 0.22?** Pre-tested mentally: 0.10 is invisible against the bright stars; 0.40 dominates the frame and steals from Shell 2; 0.20–0.25 is the sweet spot where the user *feels* the disk before *seeing* it. Final value to be set after a design QA pass with the actual impostor rendering.

The Shell 3 impostor in this preview state should render with **only the diffuse-disk component** — no spiral arms, no Sun marker, no globulars. Those features come on at T+0:25 when Shell 3 takes over fully. This is a `previewMode: boolean` flag in the impostor renderer's draw call.

### 8.3 Exit — Shell 2 → Shell 3 (T+0:24 → T+0:26, 2 s crossfade)

Symmetric to entry. Shell 2's α descends 1 → 0 over 2 s. Stars dim out individually; the brightest (Sirius, Vega) take the longest to perceptually disappear, which is correct behaviour and emerges naturally from the magnitude-modulated alpha.

The Shell 3 impostor's α ascends from 0.22 (its preview level) to 1.0 over the same 2 s, with the spiral-arm and Sun-marker components fading in only over the *last* 1 s (T+0:25 → T+0:26) to preserve the "Milky Way reveal" moment.

---

## 9. Performance budget

Shell 2's target is **≤ 2 ms per frame** (the inner-shells budget from [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md) §"Performance budget"). Headroom analysis:

| Cost | Estimate | Notes |
|------|----------|-------|
| Vertex shader | 7,500 instances × 6 vertices = 45,000 invocations | Trivial; integrated GPUs handle this in ~0.1 ms. |
| Fragment shader | ~7,500 sprites × ~50 px² avg = ~375K fragments | Additive blending; ~0.3 ms on integrated GPUs. Bright stars (~14 px radius → ~600 px²) inflate this somewhat — call it 0.5 ms worst-case. |
| Uniform updates per frame | 1 (view + proj + magRef) | Negligible. |
| Draw call overhead | 1 draw call | Negligible. |
| **Subtotal star pass** | **~0.6 ms** | Well under budget. |
| MSDF label pass (≤5 labels) | ~0.2 ms | Per labels spec. |
| Shell 3 preview pass at α=0.22 (during T+0:20–T+0:24) | ~1 ms | Same impostor cost as Shell 3 itself. |
| **Total during the busy window** | **~1.8 ms** | **Within 2 ms target.** |

7,500 stars is **trivial** on any WebGPU-capable hardware. The risk is not raw performance; it's the "shell preview" overlap with Shell 3 during T+0:20–T+0:24, which essentially doubles the rendering cost during that window. We have the budget for it; the orchestrator must just *be aware* that two shells are concurrently active and not assume only one is.

The dominant cost in this shell, paradoxically, will be the **MSDF label layout pass** if a future iteration adds many more labels (e.g., showing every Hipparcos-named star within 10 pc → ~40 labels). Stay disciplined: ≤5 visible labels is part of the design, not an arbitrary cap.

---

## 10. Mobile fallback

Mobile (per [`ux/05-mobile.md`](../ux/05-mobile.md), spec to be written) constraints to assume:

- **GPU bandwidth ~10× lower** than desktop integrated. Fill rate is the bottleneck; geometry and draw calls are not.
- **Screen resolution often higher per inch** but smaller in absolute pixels. A 14 px sprite is much more visually prominent on a 6" screen.
- **Touch interaction during the tour: paused.** No drag-orbit during shell beats. The tour is a passive cinematic on mobile.

Adjustments for Shell 2 on mobile:

- **Reduce sprite max radius from 14 px to 10 px.** Bright stars look better small at high DPI; Sirius doesn't need to be a 14-pixel splat on a phone.
- **Halo gaussian falloff coefficient from 16 → 24** (tighter halos). Reduces overdraw fill cost roughly proportionally; the visual difference is modest because the halo is already a soft falloff.
- **Cap label count at 3 instead of 5.** Phone screens are crowded; three labels (Sirius, Vega, Procyon as the canonical anchor set) communicate the message.
- **Skip the proper-motion anisotropy.** A 1.08/0.96 elliptical shape on a 6-pixel sprite is invisible and the extra varying interpolation isn't worth the GPU cycles.
- **No reduction in star count.** 7,500 instanced points is well within mobile WebGPU's draw budget; reducing the star count would visibly thin the field and cheapen the shell.

The mobile path is a uniform-flag toggle (`uniforms.mobile : u32`) inside the same shader, not a separate pipeline. One pipeline state object for both.

---

## 11. Open questions

1. **Motion-blur encoding — keep it?** The 1.08/0.96 anisotropy (§4.4) is a perception trick that survives only if the camera tilts enough for the user to notice. If user testing finds the effect is invisible, drop it and save the per-instance `pmScreen` varying. **RECOMMENDATION:** keep for v1; revisit after first round of QA recordings. Drop is a 5-line shader change.

2. **`magRef` calibration — manual or auto?** Currently a uniform tuned by hand. The alternative is to compute `magRef` from the brightest star in view per frame so the brightest is always at saturation. **RECOMMENDATION:** manual for v1; auto risks distracting brightness pumping during the camera tilt.

3. **Include named stars beyond 50 pc (Betelgeuse, Antares, Rigel, Aldebaran, etc.)?** They are not part of the "stellar neighborhood" geographically, but they are the named stars the user knows from the night sky. **RECOMMENDATION:** yes — include a small "famous extras" sidecar of ~30 named stars to 250 pc, rendered with the same shader but flagged so the labels include their distance. Without this, the user sees no red supergiant and the color palette feels incomplete (the BP-RP curve's red end is mostly populated by dim red dwarfs, which won't be sprite-prominent enough to register as "red stars").

4. **Should we hint at the celestial-sphere constellations the user grew up with?** A super-faint constellation-line overlay ("look, those four are Orion") would be a strong recognition cue. But constellations are an Earth-observer 2D projection, and once the camera tilts in 3D they are *no longer constellations*. Drawing them as fixed lines in the heliocentric frame would be wrong; drawing them as Earth-perspective lines that warp with camera motion would be correct but visually noisy. **RECOMMENDATION:** skip in v1; revisit only if first-round user testing shows the recognition cue is missing.

5. **Variable-star pulsing.** Mira-class long-period variables (a few entries in the 50 pc cut) could pulse over the 9 s of the shell. Charming detail or distracting noise? **RECOMMENDATION:** skip in v1; the `flags` bit is reserved for it. Easy to enable later.

---

## 12. Test criteria

A Shell 2 implementation is complete when **all** of:

- **Visual.** A side-by-side comparison of a static frame at T+0:18 against a reference astrophotograph of the same field (cropped from a wide-field DSLR shot of the celestial neighbourhood, available on Astrobin or NASA APOD archives) shows recognisable agreement in star color distribution and overall brightness ratios. Subjective; the QA bar is "an astronomer would not flinch."
- **Recognition.** A user unfamiliar with the tour, on first viewing, can name at least one labelled star from memory ("oh, Sirius!"). Test with five users.
- **Parallax.** Capture a video of T+0:15 → T+0:24. Pause at T+0:18 and T+0:22; the relative positions of Sirius (2.6 pc), Procyon (3.5 pc), and Arcturus (11 pc) on screen visibly shift between the two frames.
- **Milky Way preview.** At T+0:20 the diffuse glow is visible but not dominant. Pixel-mean RGB inside a 200×200 sample box at the back of the scene is between (8, 8, 12) and (24, 24, 32) on a calibrated reference monitor at 100% display brightness.
- **Performance.** On a Chromebook with integrated Iris Xe (the perf reference target), the shell renders at locked 60 fps (16.6 ms frame time) for the full 9 s, with ≤2 ms attributable to Shell 2's pass per the WebGPU `timestamp-query` profiler.
- **Mobile.** On a representative phone (iPhone 14, Pixel 7), the shell renders at locked 60 fps with the mobile flag set. Visual: the labelled star count is 3, the named stars are recognisable, and overall mood matches the desktop version.
- **Fallback.** If the network is throttled to fail the `stars-near.bin` fetch, the hardcoded 50-star fallback renders, the shell still tells its story, and a small toast `"Reduced star data"` appears for 2 s.
- **Crossfade integrity.** The Sun position is identical (within 1 px) between the last Shell 1 frame and the first Shell 2 frame. The Milky Way preview at T+0:20 fades in monotonically (no flicker, no popping).
- **Tests.** Unit tests cover: (a) the BP-RP → RGB curve sampler matches expected colors at the 16 stops, (b) the `distMod` calculation matches a hand-computed reference for Sirius, (c) the binary decoder round-trips through the `pointCloudFormat`-style header check, (d) the fallback path activates on fetch failure within 1.5 s.

---

## 13. Files touched

New:

```
public/data/
  stars-near.bin             — Gaia DR3 cut, ~7,500 records, 240 KB.
  stars-named.json           — named-star sidecar, ≤30 entries.

src/services/gpu/
  starRenderer.ts            — the ShellRenderer for Shell 2.
  shaders/stars.wgsl         — vertex + fragment shaders, with WESL imports
                               for the shared CameraUniforms prefix.

src/services/gpu/shaders/lib/
  colorCurve.wesl            — BP-RP → RGB lookup helper, also reusable in shell 3
                               if we ever colour individual MW stars.

src/data/
  starsFallback.ts           — 50-star hardcoded subset for offline / fetch-fail.
  starsBinaryFormat.ts       — header/version/decoder, mirrors pointCloudFormat.ts conventions.

src/services/engine/scale/
  shellDefinitions.ts (shared file) — adds the Shell 2 entry: id, unit=pc, near=0.001 pc,
                                       far=200 pc, anchor=Sun, fade band etc.

tools/
  buildStarsNearBin.ts       — Gaia DR3 fetch + cut + cross-match against named-star
                               registry + binary encode. Run once, not per build.

tests/services/gpu/
  starRenderer.test.ts        — magRef calibration, distMod formula, binary decode.
tests/data/
  starsBinaryFormat.test.ts   — round-trip, header version mismatch.
```

Modified:

```
src/services/engine/runFrame.ts        — register Shell 2 in the orchestrator.
src/services/engine/tour/script.ts     — add Shell 2 ShellBeat with waypoints from §5
                                          and the Shell 3 preview override from §8.2.
src/services/gpu/milkyWayImpostor.ts   — add the `previewMode` draw flag from §8.2
                                          (assumes the impostor exists per its own spec).
src/@types/                             — add `StarShellRenderer` and `StarsNearPayload` types.
```

The new code is small (~600 lines of TypeScript + ~150 lines of WGSL/WESL) because almost all of the heavy lifting lives in the shared scale architecture, the existing instanced-billboard pattern, and the MSDF label renderer. Shell 2's own surface area is the renderer file, the shader, the binary format, and the tour beat — that's it.
