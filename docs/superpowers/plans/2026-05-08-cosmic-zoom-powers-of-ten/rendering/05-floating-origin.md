# Floating-origin precision — deep dive

**Status:** Foundational. Expands on the floating-origin section of [`00-scale-architecture.md`](./00-scale-architecture.md).
**Required for:** Every shell, but the failure mode bites hardest in shells 1–4.
**Audience:** Anyone touching camera state, per-instance vertex buffers, or matrix math in the engine.

Long-form companion to the sketch in [`00-scale-architecture.md`](./00-scale-architecture.md). The parent doc explains _that_ we use floating-origin; this one covers the precision math, the per-shell variant, the f64/f32 split, and how we test it. Section 1 is the load-bearing fact the whole multi-shell design rests on.

## 1. The precision problem in detail

IEEE-754 single-precision (`f32`) is 1 sign bit + 8 exponent bits + 23 mantissa bits, giving roughly **`log10(2^24) ≈ 7.22` decimal digits** of significand. That number is constant; the exponent slides the decimal point but does not add precision. Two consequences matter:

- **The gap between adjacent representable values grows with magnitude.** At `1`, the next `f32` up is `1 + 2⁻²³ ≈ 1.0000001`. At `10⁹`, the gap is `~10⁹ × 2⁻²³ ≈ 119` — every coordinate in that range snaps to a grid roughly 100 units wide. A galaxy at `(1.000_000_000, 0, 0) Gpc` and one at `(1.000_000_050, 0, 0) Gpc` collapse onto the same `f32`.
- **Subtraction destroys what little precision remains.** If `cam = 1.000_000_001 Gpc` and `obj = 1.000_000_002 Gpc`, both store as the same `f32`; their difference is `0`, not `1 Mpc`. This is catastrophic cancellation, the dominant failure mode in naive renderers at planetary scale.

For skymap, an `f32` storing positions in Mpc snaps as follows:

| Magnitude | `f32` grid | What snaps |
|---|---|---|
| `1` Mpc | `~10⁻⁷` Mpc (~30 pc) | stars unresolvable, galaxies distinct |
| `10²` Mpc | `~10⁻⁵` Mpc (~3 kpc) | small galaxies ambiguous |
| `10³` Mpc | `~10⁻⁴` Mpc (~30 kpc) | cluster cores merge |
| `10⁹` (raw units) | `~10²` units | catastrophic |

The 17-orders-of-magnitude span (Sun's surface to observable horizon) is six orders beyond what `f32` can hold in a single space. Floating-origin sidesteps this.

## 2. Standard solution: subtract camera position before sending to GPU

The textbook fix from spaceflight games: do the world-to-view subtraction in `f64` on the CPU, then narrow to `f32` for the GPU.

```ts
// Wrong — subtraction happens in shader, with f32 inputs:
//   const viewPos = (camMatrix * vec4(absolutePos, 1.0)).xyz;
// camMatrix and absolutePos are both large; their difference is small;
// f32 cancellation eats the small bits before the shader sees them.

// Right — subtraction happens in f64 on CPU:
const dx = absolutePos[0] - cameraPos[0]; // both are JS Number = f64
const dy = absolutePos[1] - cameraPos[1];
const dz = absolutePos[2] - cameraPos[2];
// Now dx,dy,dz are small (camera-relative); narrowing to f32 is lossless
// where it matters, because we burn precision on the magnitude we no longer have.
const cameraRelative = new Float32Array([dx, dy, dz]);
```

The view matrix sent to the GPU is built _as if the camera were at the origin_ — translation component zeroed, rotation/orientation kept. The "missing" translation has already been baked into every per-instance position by the subtraction above.

## 3. Per-shell origin variant: a stable nearby anchor

The pure camera-relative form has a problem: the origin moves every frame the camera moves. Any GPU-side per-instance buffer would have to be re-uploaded every frame to keep up — enormous cost with 3.5M point instances.

Skymap's variant: pick a **stable shell anchor** instead of the camera — Sun, Galactic center, Local Group barycenter, M87, or origin — chosen so the camera's plausible motion within the shell stays small relative to the shell's scale. Subtraction is `(absolutePos − shellOrigin)` rather than `(absolutePos − cameraPos)`. Because `shellOrigin` is constant within a shell, per-instance buffers are uploaded **once** and reused; only the camera's own shell-relative position changes per frame, baked into the view matrix.

The trade is precision vs. update cost. Pure camera-relative gives best precision (camera _at_ origin); per-shell-anchor gives slightly worse precision (camera offset up to the shell's working radius) in exchange for a static buffer. As long as the working radius keeps positions in the `[−1000, 1000]` shell-unit window, `f32` is comfortable.

## 4. Snapping policy — origin set ONCE per shell entry

The shell origin is a **state**, not a function of camera position. It transitions only at shell-boundary crossings (event-driven: the camera enters a new shell, or the tour engine forces a transition). Inside a shell, the origin is bit-exactly constant frame after frame.

Why this matters:
- **Determinism.** Two consecutive frames with the same camera state produce identical GPU buffers. Render-on-demand and screenshot-diff testing depend on this.
- **No jitter.** A galaxy at rest in the absolute frame stays at rest in the shell-relative frame. If `shellOrigin` drifted per frame, every static object would shimmer at sub-pixel scale.
- **Cacheability.** The CPU can pre-compute every visible object's `Float32Array` at shell entry and reuse it until shell exit.

Snap rule: when the engine commits to entering shell N, it looks up `shellDefinitions[N].anchor`, materializes the absolute `f64` coordinates of that anchor (often a constant in `src/data/`, sometimes a deterministic computation like LG barycenter), and stores it in `cameraScale.shellOrigin`. That value does not change again until a different shell is entered.

## 5. Re-anchoring at shell transitions

During the 1–2 second crossfade between shell N and shell N+1, both shells render. Each uses its own `shellOrigin`, `shellUnit`, and per-shell projection matrix — independent, no shared coordinate frame in the GPU during transitions.

The mapping lives entirely on the CPU: both anchors have known `f64` heliocentric Mpc positions, and the camera's `absolutePos` is `f64`, so the camera's shell-relative position in shell N and in shell N+1 are both computable each frame. We compute both, build two view matrices, dispatch two render passes, composite their color outputs with the crossfade alphas.

A subtle point: an object that exists in both shells (e.g., the Milky Way, a structured disk in shell 3 and a single point in shell 4) is rendered **twice** during crossfade, once per shell, with that shell's own representation. This is correct — the artistic intent is "the Milky Way smoothly turns from a disk into a point."

## 6. f64 on the CPU side — already free, just don't lose it

JavaScript's `Number` is `f64` by spec. `Float64Array` is `f64`. Arithmetic on plain Numbers is `f64`. **We already have `f64` precision on the CPU.** The work is not to add `f64` — it is to make sure we do not _accidentally_ narrow to `f32` too early.

The narrowing pitfall is `Float32Array`. A common WebGPU pattern:

```ts
// Wrong — narrowing happens immediately when the buffer is constructed:
const positions = new Float32Array(galaxies.length * 3);
for (let i = 0; i < galaxies.length; i++) {
  positions[i * 3 + 0] = galaxies[i].x; // f64 → f32 narrowing here
  positions[i * 3 + 1] = galaxies[i].y;
  positions[i * 3 + 2] = galaxies[i].z;
}
// At this point positions[] holds the absolute coordinates as f32 already.
// Any later subtraction `positions[i] - cameraPos` is f32 − f64 → f64 promotion,
// but the f32 input has already lost the precision that mattered.
```

The fix is to keep absolute positions in `Float64Array` (or plain `Number[]`) and only construct the `Float32Array` after the subtraction, using the result of `f64 − f64` arithmetic:

```ts
// Right — subtract first in f64, then narrow:
const out = new Float32Array(galaxies.length * 3);
const ox = cam.shellOrigin[0];
const oy = cam.shellOrigin[1];
const oz = cam.shellOrigin[2];
const inv = 1 / cam.shellUnit;
for (let i = 0; i < galaxies.length; i++) {
  // galaxies[i].{x,y,z} are JS Numbers (f64). cam.shellOrigin entries are f64.
  // The subtraction and multiply both happen in f64; only the assignment narrows.
  out[i * 3 + 0] = (galaxies[i].x - ox) * inv;
  out[i * 3 + 1] = (galaxies[i].y - oy) * inv;
  out[i * 3 + 2] = (galaxies[i].z - oz) * inv;
}
```

`Math.fround` (used in the snippet in [`00-scale-architecture.md`](./00-scale-architecture.md)) is only for _verifying_ an f32 round-trip is lossless; the `Float32Array` assignment already does the narrowing. We use `Math.fround` in tests, not production.

## 7. f32 on the GPU side — what we actually upload

Each shell's per-instance buffer contains positions as `vec3<f32>` in **shell-units**, nominally `[−1000, 1000]`:

- Shell 1 (Solar System, AU): Pluto at ~40 AU, heliopause at ~120 AU — well under 1000.
- Shell 4 (Local Group, Mpc): M31 at ~0.78 Mpc from LG barycenter, bound members within ~2 Mpc.
- Shell 8 (Cosmic Web, Gpc): SDSS great wall at ~0.3 Gpc, observable horizon at ~14 Gpc — slightly over, accepted because the unit was chosen for the cosmic-web body, not the horizon.

Within `[−1000, 1000]`, `f32` resolution is `~10⁻⁴` shell-units. In shell 4 (Mpc) that is `~30 pc`, finer than any visible feature. In shell 1 (AU) that is `~15,000 km`, finer than any planet perturbation we care to render.

The view matrix is also `f32` in WGSL (no choice), but its translation column is small (camera offset from shell origin in shell-units), so the multiplication with a small per-instance position keeps all operands in the `f32`-friendly range.

## 8. Worked example

Setup:
- Galaxy heliocentric position: `(50, 30, −10)` Mpc.
- Camera heliocentric position: `(45, 28, −8)` Mpc.
- Active shell: Local Group (shell 4), `shellUnit = 1` Mpc, `shellOrigin = LG_BARYCENTER ≈ (0.36, 0.12, −0.08)` Mpc heliocentric.

Per-instance position uploaded for the galaxy:
```
shellRelativeGalaxy = (50 − 0.36, 30 − 0.12, −10 − (−0.08))
                    = (49.64, 29.88, −9.92)  [Mpc, divided by shellUnit = 1]
```
That fits in `f32` with grid spacing `~3.8 × 10⁻⁶` Mpc (~120 pc) — fine.

Camera shell-relative position (used in the view matrix):
```
shellRelativeCamera = (45 − 0.36, 28 − 0.12, −8 − (−0.08))
                    = (44.64, 27.88, −7.92)  [Mpc]
```

The view matrix is built with the camera at `(44.64, 27.88, −7.92)` looking at the target. Projection uses shell 4's `near = 0.001 Mpc`, `far = 20 Mpc`. The galaxy ends up at view-space distance `sqrt(5² + 2² + 2²) ≈ 5.74` Mpc — well inside `[near, far]`, well within `f32` precision.

Without floating-origin in shell 8 (raw Gpc, no subtraction), the same camera/object pair near the horizon — camera at `(0.045, 0.028, −0.008)` Gpc against an object at `(13.999_999, 0, 0)` Gpc — loses ~7 digits in the view-matrix subtraction. The galaxy snaps to the same `f32` cell as several neighbors, and depth cannot distinguish them.

## 9. Common bugs to watch for

- **Camera matrix built from f64 then naively cast to f32.** If you compute lookAt with `f64` then call `new Float32Array(matrix16)`, precision is lost. Build lookAt with already-shell-relative inputs (small numbers) so the resulting `f32` matrix is precise where it matters.
- **Per-instance buffer storing absolute positions, with subtraction deferred to the shader.** WGSL can't recover precision its inputs never had. Subtract on CPU.
- **Per-frame shell-origin drift.** If `shellOrigin` is reassigned every frame from the camera (a copy-paste from the textbook camera-relative form), every static galaxy shimmers. Snap once at shell entry; debug-build assert it does not change within a shell.
- **Mixing units across shells.** A label attached to "M31" must be projected with shell N's matrix using shell N's unit. Labels carry their absolute Mpc coordinate plus a `shellId` and let the per-shell projection do the conversion.
- **`Float32Array` of absolute positions from `.bin` files.** Today's pipeline produces `Float32Array` directly. For inner shells (1–3), the loader has to either re-anchor at load time using `f64` arithmetic on `f32` inputs (no further loss beyond what `f32` source already lost) or regenerate as `Float64Array` if sub-`f32` precision is ever required at source.

## 10. Testing strategy

Three layers, all in `tests/services/engine/scale/`:

1. **Unit math tests** — `cameraScale.test.ts`. Known absolute position + shell origin + shell unit; assert the output `Float32Array` round-trips through `Math.fround` losslessly and that scaling back up reproduces the input within tolerance. Extreme cases: position == origin (zero), position 1000 shell-units away (exactly `1000`), position at an `f32` boundary value.
2. **Adversarial round-trip tests.** Construct positions that would catastrophically cancel under naive subtraction — e.g., `(1.000_000_001 Gpc, 0, 0)` and `(1.000_000_002 Gpc, 0, 0)` — and verify the difference survives as a clean `1 Mpc` shell-relative offset.
3. **Visual regression** — once shells render, a screenshot test of "static camera in shell 4 across 60 frames produces 60 byte-identical frames" catches per-frame origin drift and any non-determinism.

A useful dev overlay: a HUD line showing `cam.absolutePos`, `cam.shellOrigin`, `cam.shellUnit`, and `cam.absolutePos − cam.shellOrigin` in shell-units. Most precision bugs become obvious in seconds.

## 11. References

- Kerbal Space Program devblog, _"Krakensbane and the floating-origin engine"_ — canonical write-up of per-frame camera rebase.
- Outerra, _"Floating-point precision in space"_ (outerra.blogspot.com) — practical analysis of `f32` failure modes at planet scale, source of the precision-vs-magnitude table in section 1.
- Tom Forsyth, _"A matter of precision"_ — split-precision (DSFUN90-style) tricks for emulating `f64` on `f32` GPUs. Fallback if shell 1 ever needs sub-meter precision.
- Cesium engine docs, _"Precisions, Precisions"_ (cesium.com/blog) — WebGL planet-renderer equivalent; near-identical floating-origin with per-tile re-anchoring.
- IEEE-754 (2008), §3.4 — the spec; worth reading once.
