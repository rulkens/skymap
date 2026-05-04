# Milky Way Procedural Impostor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a single procedural Milky Way impostor — a screen-aligned quad centred at the world origin (Earth/Sun) — that gives close-in viewers a sense of being "inside" our galaxy. The shader is a hand port of the CC0 ShaderToy "Spiral galaxy" by an unattributed CC0 author (header `// License CC0: Spiral galaxy`). Distance-fades to zero across 10–50 Mpc so the impostor doesn't clutter wide cosmic-web views, with a default-ON SettingsPanel toggle and slow time-based animation.

**Architecture:** New sibling renderer `MilkyWayRenderer` parallel to `ProceduralDiskRenderer` — single-instance pipeline (one quad), uniform-buffer driven (`viewProj`, `viewport`, `camPosWorld`, `iTime`, `fadeAlpha`), screen-aligned vertex stage that emits a quad in clip-space whose position rides with the camera (so the quad always covers the central FOV regardless of where the camera is looking). Fragment stage runs the ported WGSL ray-marched galaxy code, outputs LINEAR HDR colour, premultiplied additive blend into the existing HDR target. Engine integration hooks in `renderFrame.ts` BEFORE the points pass so points overdraw the impostor; the impostor's distance fade ensures it disappears before the points pass would visually clash.

**Tech Stack:** WebGPU + WGSL, TypeScript, Vitest. No new runtime dependencies.

**Locked design decisions:**

| Question | Decision |
|---|---|
| Quad orientation | Screen-aligned (option a) — billboard-style. World-fixed disk-plane orientation deferred as future enhancement. |
| Quad sizing | Quad emitted in clip-space directly from the vertex stage; covers `[-1,1]²` NDC plus a 5% bleed margin so smoothstep edge fade has room. Effective world size is irrelevant. |
| Distance fade | Linear in distance from origin: `fadeAlpha = 1 - smoothstep(10.0, 50.0, |camPosWorld|)` (Mpc). Below 10 Mpc the impostor renders at full alpha; above 50 Mpc it's fully gone. |
| Time / animation | `iTime` uniform driven by engine wall-clock seconds, multiplied by `0.1` already (the ShaderToy already divides by 10 via its `#define TIME (iTime*0.1)`). One additional outer scale of `0.25` applied at the WGSL boundary so the rotation feels "slow and alive" rather than spinning. Net: `animationTimeSec = (perfNowMs - epoch) * 0.001 * 0.25`. |
| HDR vs display-space | Output is LINEAR. The ported `postProcess()` function is DELETED entirely — no `pow(col, 0.75)` gamma, no contrast S-curve, no saturation lift, no vignette. Engine's tone-map pass downstream handles all display-space mapping. |
| Composite order | Impostor renders AFTER clear, BEFORE points. Premultiplied additive blend (same as procedural-disk pass). Point billboards drawn on top hide it where they overlap, which is fine — the points are accurate galaxies, the impostor is an artistic foreground. |
| Default visibility | `DEFAULT_MILKY_WAY_ENABLED = true`. |
| Pause on tab-hidden | No special handling. Engine already gates the frame loop on `document.visibilityState === 'visible'` via the existing render-on-demand path. |

---

## File Structure

**Create:**
- `src/services/gpu/milkyWayRenderer.ts` — render pipeline + draw method.
- `src/services/gpu/shaders/milkyWayImpostor.wgsl` — vertex (clip-space quad) + fragment (ported ShaderToy galaxy).
- `tests/services/gpu/milkyWayRenderer.test.ts` — pipeline-construction smoke test (mirror of `proceduralDiskRenderer.test.ts`).
- `src/utils/math/milkyWayFade.ts` — pure function `milkyWayFadeAlpha(camDistMpc): number`. Tested in isolation so the fade curve is regression-checked without WebGPU.
- `tests/utils/math/milkyWayFade.test.ts`

**Modify:**
- `src/data/defaults.ts` — add `DEFAULT_MILKY_WAY_ENABLED = true`.
- `src/@types/EngineSettingsState.d.ts` — add `milkyWayEnabled: boolean` field.
- `src/@types/EngineHandle.d.ts` — add `setMilkyWayEnabled?(enabled: boolean): void` setter.
- `src/@types/EngineCallbacks.d.ts` — add `onMilkyWayEnabledChange?(enabled: boolean): void` echo.
- `src/services/engine/renderFrame.ts` — add `milkyWayRenderer` GPU handle field, `milkyWayEnabled` setting, and a `runMilkyWayPass` invocation in the HDR pass before the points draw.
- `src/services/engine/engine.ts` — instantiate `MilkyWayRenderer`, seed `milkyWayEnabled` setting, wire `setMilkyWayEnabled` setter, plumb `iTime` epoch, pass renderer + enabled flag into `renderFrame`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — add "Show Milky Way" checkbox row.
- `src/App.tsx` — `useState` for `milkyWayEnabled`, wire callback, pass to SettingsPanel.

**Why a separate renderer module rather than tucking the quad into `proceduralDiskRenderer`?** This impostor is conceptually distinct: it's exactly one instance, screen-aligned, no per-galaxy data, no orientation, no crossfade. Mixing it into the per-galaxy pipeline would force every per-galaxy draw call through a one-instance code path or vice-versa. Two siblings is cleaner — same skeletal pipeline shape (uniform + vertex buffer + draw), divergent vertex stage (screen-aligned vs. 3D-oriented) and divergent fragment stage (ray-marched procedural galaxy vs. analytic profile).

---

## Conventions

- Didactic comments throughout. Match existing project style — multi-paragraph headers explaining WHY (the screen-aligned vs. world-fixed trade, why drop the postProcess, why the fade band is 10–50 Mpc not 5–100, what the WGSL port preserves vs. simplifies).
- `type` aliases not interfaces.
- Tests under `tests/` mirror the `src/` tree.
- All commands run from `/Users/rulkens/Development/js/skymap`.
- Vitest. `npx vitest run <path>` for one file; `npm test` for the whole suite.
- All shader edits must keep the `// License CC0: Spiral galaxy` attribution comment at the top of the WGSL file.

---

## Task 0: Reference — original ShaderToy GLSL source

This task does NOT modify any files. It exists so subagent implementers porting the shader in Task 4 don't have to leave the plan to find the source.

The original GLSL (CC0 license, header reads `// License CC0: Spiral galaxy`):

```glsl
// License CC0: Spiral galaxy
//  Would benefit from anti-aliasing but looks okish when I run it in fullscreen in FF
//  Lots of random coding and little thought so the code is kind of messy
#define PI  3.141592654
#define TAU (2.0*PI)

#define TIME (iTime*0.1)

#define LESS(a,b,c) mix(a,b,step(0.,c))

#define SABS(x,k)    LESS((.5/k)*x*x+k*.5,abs(x),abs(x)-k)

#define RESOLUTION   iResolution

const float twirly =2.5;

vec2 toPolar(vec2 p) {
  return vec2(length(p), atan(p.y, p.x));
}

vec2 toRect(vec2 p) {
  return p.x*vec2(cos(p.y), sin(p.y));
}

vec2 mod2(inout vec2 p, vec2 size) {
  vec2 c = floor((p + size*0.5)/size);
  p = mod(p + size*0.5,size) - size*0.5;
  return c;
}

float noise1(vec2 p) {
  float s = 1.0;

  p *= tanh(0.1*length(p));
  float tm = TIME;

  float a = cos(p.x);
  float b = cos(p.y);

  float c = cos(p.x*sqrt(3.5)+tm);
  float d = cos(p.y*sqrt(1.5)+tm);

  return a*b*c*d;
}

void rot(inout vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  p = vec2(c*p.x + s*p.y, -s*p.x + c*p.y);
}

vec2 twirl(vec2 p, float a, float z) {
  vec2 pp = toPolar(p);
  pp.y += pp.x*twirly + a;
  p = toRect(pp);

  p *= z;

  return p;
}

float galaxy(vec2 p, float a, float z) {
  p = twirl(p, a, z);

  return noise1(p);
}

float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}


vec2 raySphere(vec3 ro, vec3 rd, vec3 center, float radius)
{
    //get the vector from the center of this circle to where the ray begins.
    vec3 m = ro - center.xyz;

    //get the dot product of the above vector and the ray's vector
    float b = dot(m, rd);

    float c = dot(m, m) - radius*radius;

    //exit if r's origin outside s (c > 0) and r pointing away from s (b > 0)
    if(c > 0.0 && b > 0.0) return vec2(-1.0, -1.0);

    //calculate discriminant
    float discr = b * b - c;

    //a negative discriminant corresponds to ray missing sphere
    if(discr < 0.0) return vec2(-1.0);

    //ray now found to intersect sphere, compute smallest t value of intersection
    float normalMultiplier = 1.0;
    float s = sqrt(discr);
    float t0 = -b - s;
    float t1 = -b + s;;

    // return the time t that the collision happened, as well as the surface normal
    return vec2(t0, t1);
}


vec3 stars(vec2 p) {
  float l = length(p);

  vec2 pp = toPolar(p);
  pp.x /= (1.0+length(pp.x))*0.5;
  p = toRect(pp);

  float sz = 0.0075;

  vec3 s = vec3(10000.0);

  for (int i = 0; i < 3; ++i) {
    rot(p, 0.5);
    vec2 ip = p;
    vec2 n = mod2(ip, vec2(sz));
    float r = rand(n);
    vec2 o = -1.0 + 2.0*vec2(r, fract(r*1000.0));
    s.x = min(s.x, length(ip-0.25*sz*o));
    s.yz = n*0.1;
  }

  return s;
}

float height(vec2 p) {
  float ang = atan(p.y, p.x);
  float l = length(p);
  float sp = mix(1.0, pow(0.75 + 0.25*sin(2.0*(ang + l*twirly)), 3.0), tanh(6.0*l));
  float s = 0.0;
  float a = 1.0;
  float f = 15.0;
  float d = 0.0;
  for (int i = 0; i < 11; ++i) {
    float g = a*galaxy(p, TIME*(0.025*float(i)), f);
    s += g;
    a *= sqrt(0.45);
    f *= sqrt(2.0);
    d += a;
  }

  s *= sp;

  return SABS((-0.25+ s/d), 0.5)*exp(-5.5*l*l);
}

vec3 normal(vec2 p) {
  vec2 eps = vec2(0.000125, 0.0);

  vec3 n;

  n.x = height(p - eps.xy) - height(p + eps.xy);
  n.y = 2.0*eps.x;
  n.z = height(p - eps.yx) - height(p + eps.yx);

  return normalize(n);
}

const vec3 colDust = vec3(1.0, 0.9, 0.75);

vec3 galaxy(vec2 p, vec3 ro, vec3 rd, float d) {
  rot(p, 0.5*TIME);

  float h = height(p);
  vec3 s = stars(p);
  float th = tanh(h);
  vec3 n = normal(p);

  vec3 p3 = vec3(p.x, th, p.y);
  float lh = 0.5;
  vec3 lp1 = vec3(-0.0, lh, 0.0);
  vec3 ld1 = normalize(lp1 - p3);
  vec3 lp2 = vec3(0.0, lh, 0.0);
  vec3 ld2 = normalize(lp2 - p3);

  float l = length(p);
  float tl = tanh(l);

  float diff1 = max(dot(ld1, n), 0.0);
  float diff2 = max(dot(ld2, n), 0.0);

  vec3 col = vec3(0.0);
  col += vec3(0.5, 0.5, 0.75)*h;
//  col += vec3(0.5)*pow(diff1, 20.0);
  col += 0.25*pow(diff2, 4.0);
  col += pow(vec3(0.5)*h, n.y*1.75*(mix(vec3(0.5, 1.0, 1.5), vec3(0.5, 1.0, 1.5).zyx, 1.25*tl)));
//  col += 0.9*vec3(1.0, 0.9, 0.75)*exp(-10*l*l);


  float sr = rand(s.yz);
  float si = pow(th*sr, 0.25)*0.001;
  vec3 scol = sr*5.0*exp(-2.5*l*l)*tanh(pow(si/(s.x), 2.5))*mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.75, 0.5), sr*0.6);
  scol = clamp(scol, 0.0, 1.0);
  col += scol*smoothstep(0.0, 0.35, 1.0-n.y);

  float ddust = (h - ro.y)/rd.y;
  if (ddust < d) {
    float t = d - ddust;
    col += 0.7*colDust*(1.0-exp(-2.0*t));
  }

  return col;
}

vec3 render(vec3 ro, vec3 rd) {
  float dgalaxy = (0.0 - ro.y)/rd.y;

  vec3 col = vec3(0);

  if (dgalaxy > 0.0) {
    col = vec3(0.5);
    vec3 p = ro + dgalaxy*rd;

    col = galaxy(p.xz, ro, rd, dgalaxy);
  }

  vec2 cgalaxy = raySphere(ro, rd, vec3(0.0), 0.125);

  float t;

  if (dgalaxy > 0.0 && cgalaxy.x > 0.0) {
    float t0 = max(dgalaxy - cgalaxy.x, 0.0);
    float t1 = cgalaxy.y - cgalaxy.x;
    t = min(t0, t1);
  } else if (cgalaxy.x < cgalaxy.y){
    t = cgalaxy.y - cgalaxy.x;
  }

  col += 1.7*colDust*(1.0-exp(-1.0*t));


  return col;
}


vec3 postProcess(vec3 col, vec2 q)  {
  col=pow(clamp(col,0.0,1.0),vec3(0.75));
  col=col*0.6+0.4*col*col*(3.0-2.0*col);  // contrast
  col=mix(col, vec3(dot(col, vec3(0.33))), -0.4);  // satuation
  col*=0.5+0.5*pow(19.0*q.x*q.y*(1.0-q.x)*(1.0-q.y),0.7);  // vigneting
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 q = fragCoord/RESOLUTION.xy;
  vec2 p = -1. + 2. * q;
  p.x *= RESOLUTION.x/RESOLUTION.y;

  vec3 ro = vec3(0.0, 0.7, 2.0)*0.75;
  vec3 la = vec3(0.0, 0.0, 0.0);
  vec3 up = vec3(-0.5, 1.0, 0.0);
  vec3 ww = normalize(la - ro);
  vec3 uu = normalize(cross(up, ww));
  vec3 vv = normalize(cross(ww,uu));
  vec3 rd = normalize(p.x*uu + p.y*vv + 2.5*ww);


  vec3 col = render(ro, rd);

  col = postProcess(col, q);

  fragColor = vec4(col, 1.0);
}
```

**WGSL port differences (apply in Task 4):**

| GLSL | WGSL replacement |
|---|---|
| `iTime` global | `u.iTime` from the uniform buffer |
| `iResolution` global | Removed entirely. The fragment receives `uv` in `[-1, 1]²` from the vertex stage; aspect ratio handled at the vertex stage by stretching the quad in clip-space. |
| `mainImage(out vec4, in vec2)` | `@fragment fn fs(in: VsOut) -> @location(0) vec4<f32>` |
| `inout` parameters (`mod2`, `rot`) | WGSL has no `inout`; convert to functions that return modified value. `mod2` must return a struct `{ p: vec2<f32>, c: vec2<f32> }`. |
| `for (int i = ...)` | `for (var i: i32 = ...; ...; i = i + 1)` — WGSL is strict about types. |
| `vec3(0.5)` constructor splat | `vec3<f32>(0.5)` |
| `mix(a, b, c)` | `mix(a, b, c)` (same) |
| `pow(col, vec3(0.75))` (in postProcess) | DELETED — postProcess function not ported. |
| `clamp(col, 0.0, 1.0)` | DELETED — we want HDR overflow. |
| Function overload `galaxy(p, a, z)` vs. `galaxy(p, ro, rd, d)` | WGSL has no overloading; rename the 4-arg overload to `shadeGalaxyDisk` and keep the 3-arg as `galaxy`. |
| `0.5*TIME` etc. | Inline `(u.iTime * 0.1)` (the ShaderToy's `TIME` macro) at each call site, OR define `let TIME = u.iTime * 0.1;` once at the top of `fs`. Preferred: define once. |
| `vec3(1.0, 0.9, 0.75).zyx` swizzle | `vec3<f32>(0.75, 0.9, 1.0)` written out — WGSL supports swizzles, but writing the literal makes the swap explicit for review. |

**ShaderToy lines that must be DROPPED (not ported):**

```glsl
vec3 postProcess(vec3 col, vec2 q)  {
  col=pow(clamp(col,0.0,1.0),vec3(0.75));    // ← display-space gamma — engine tone-map handles this
  col=col*0.6+0.4*col*col*(3.0-2.0*col);     // ← display-space contrast S-curve
  col=mix(col, vec3(dot(col, vec3(0.33))), -0.4);  // ← saturation pump
  col*=0.5+0.5*pow(19.0*q.x*q.y*(1.0-q.x)*(1.0-q.y),0.7);  // ← vignette
  return col;
}
```

The body of `mainImage` after `vec3 col = render(ro, rd);` becomes simply:

```wgsl
return vec4<f32>(col * fadeAlpha, fadeAlpha);
```

(premultiplied alpha, with the per-frame `fadeAlpha` from the uniform, no postProcess pipeline).

---

## Task 1: Pre-flight — confirm clean baseline

**Files:** none.

- [ ] **Step 1: Confirm working tree status**

Run: `git -C /Users/rulkens/Development/js/skymap status`

Expected: any pending changes are unrelated to engine, GPU renderers, or the SettingsPanel. If anything in `src/services/gpu/`, `src/services/engine/`, or `src/components/SettingsPanel/` is uncommitted, commit or stash before starting.

- [ ] **Step 2: Confirm tests are green**

Run: `npm test`

Expected: all tests pass (currently 155+; an earlier in-flight plan may have raised this number — record the actual count and any "failed" lines must be unrelated to this plan's surfaces).

- [ ] **Step 3: Confirm dev server is running**

Per `CLAUDE.md`, `npm run dev` is left running. The canvas should show the existing galaxy field. This is the visual baseline for Task 11's manual verification.

---

## Task 2: Pure fade math — `milkyWayFadeAlpha`

**Files:**
- Create: `src/utils/math/milkyWayFade.ts`
- Create: `tests/utils/math/milkyWayFade.test.ts`

The fade curve is a smoothstep from full-on at 10 Mpc to fully-faded at 50 Mpc. Tested in isolation first so the ramp shape is regression-locked without WebGPU.

- [ ] **Step 1: Write failing tests**

Create `tests/utils/math/milkyWayFade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { milkyWayFadeAlpha } from '../../../src/utils/math/milkyWayFade';

describe('milkyWayFadeAlpha', () => {
  it('returns 1.0 at the world origin (camera on Earth)', () => {
    expect(milkyWayFadeAlpha(0)).toBe(1.0);
  });

  it('returns 1.0 at the inner edge (10 Mpc) — full impostor visibility', () => {
    expect(milkyWayFadeAlpha(10)).toBe(1.0);
  });

  it('returns 0.0 at the outer edge (50 Mpc) — fully faded', () => {
    expect(milkyWayFadeAlpha(50)).toBe(0.0);
  });

  it('returns 0.0 well beyond the outer edge', () => {
    expect(milkyWayFadeAlpha(100)).toBe(0.0);
    expect(milkyWayFadeAlpha(10000)).toBe(0.0);
  });

  it('returns 0.5 at the midpoint (30 Mpc) — smoothstep symmetry', () => {
    // Smoothstep at t=0.5 evaluates to 0.5 exactly: 3·0.5² − 2·0.5³ = 0.5.
    // Our fade is `1 - smoothstep(10, 50, x)`, so at x=30 (midpoint of band)
    // smoothstep returns 0.5, fade returns 0.5.
    expect(milkyWayFadeAlpha(30)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically non-increasing across the band', () => {
    let prev = Infinity;
    for (let d = 0; d <= 60; d += 0.5) {
      const a = milkyWayFadeAlpha(d);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('clamps negative input to full visibility (defensive)', () => {
    expect(milkyWayFadeAlpha(-5)).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/math/milkyWayFade.test.ts`

Expected: FAIL — module `../../../src/utils/math/milkyWayFade` not found.

- [ ] **Step 3: Write the implementation**

Create `src/utils/math/milkyWayFade.ts`:

```ts
/**
 * milkyWayFade — distance-based alpha curve for the Milky Way impostor.
 *
 * The procedural impostor is a 2D ray-marched picture of "the galaxy
 * around you", parameterised for a viewer who is *inside* it.  Once the
 * camera flies more than a few Mpc from Earth, that framing is no longer
 * physically meaningful: from outside the Local Group, the Milky Way is
 * just a Sb-galaxy point in the SDSS catalog (which we don't render —
 * it's at the origin where there's no SDSS row to draw).  Letting the
 * impostor stay full-bright on a wide cosmic-web view would put a
 * cartoon spiral in the foreground of every shot.
 *
 * The band 10..50 Mpc is chosen as follows:
 *
 *   - 10 Mpc is well outside the Local Group (~3 Mpc) but inside the
 *     supergalactic plane out to Virgo.  At this distance the impostor
 *     is still the visually dominant element when the user looks
 *     "back at home", which is the experience we want.
 *   - 50 Mpc is roughly the distance at which 2MRS / GLADE galaxies
 *     start to dominate the field of view; past this point the user is
 *     scientifically interested in the catalog galaxies and the
 *     impostor would just be visual noise.
 *
 * A smoothstep gives a perceptually-soft fade — a hard cut would
 * pop visibly on a slow fly-out.
 *
 * Returns a number in `[0, 1]`:
 *   - `1.0` at distance ≤ 10 Mpc (full impostor visibility).
 *   - `0.0` at distance ≥ 50 Mpc.
 *   - Smoothstepped between.
 *
 * Negative input (defensive — should never happen with a real camera
 * distance which is `length(camPos) ≥ 0`) clamps to `1.0`.
 */

const FADE_INNER_MPC = 10.0;
const FADE_OUTER_MPC = 50.0;

export function milkyWayFadeAlpha(camDistMpc: number): number {
  if (camDistMpc <= FADE_INNER_MPC) return 1.0;
  if (camDistMpc >= FADE_OUTER_MPC) return 0.0;
  const t = (camDistMpc - FADE_INNER_MPC) / (FADE_OUTER_MPC - FADE_INNER_MPC);
  // Standard smoothstep: 3t² - 2t³.  Maps [0,1] → [0,1] with zero
  // derivative at both endpoints, so the fade has no visible kink at
  // the band edges.
  const s = t * t * (3.0 - 2.0 * t);
  return 1.0 - s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/math/milkyWayFade.test.ts`

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/math/milkyWayFade.ts tests/utils/math/milkyWayFade.test.ts
git commit -m "feat(milky-way): add fade-alpha helper for distance-based visibility"
```

---

## Task 3: Settings plumbing — defaults + state types + handle setter

**Files:**
- Modify: `src/data/defaults.ts`
- Modify: `src/@types/EngineSettingsState.d.ts`
- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/@types/EngineCallbacks.d.ts`

This is the type-and-default skeleton that every later task can depend on. Doing it before any GPU work means the engine can hold the new flag (defaulted) before there's a renderer to consume it.

- [ ] **Step 1: Add the default constant**

Open `src/data/defaults.ts`. After the `DEFAULT_DEPTH_FADE_ENABLED` block (around line 104), add:

```ts
/**
 * Procedural Milky Way impostor defaults ON.  The single screen-aligned
 * quad at the world origin gives the user a visceral "you are here"
 * sense before they fly out into the cosmic-web view.  See
 * `services/gpu/milkyWayRenderer.ts` and `utils/math/milkyWayFade.ts`
 * for the rendering rationale and the distance-fade band.
 */
export const DEFAULT_MILKY_WAY_ENABLED = true;
```

- [ ] **Step 2: Add the field to `EngineSettingsState`**

Open `src/@types/EngineSettingsState.d.ts`. Inside the `EngineSettingsState` type, add `milkyWayEnabled: boolean;` after `galaxyTexturesEnabled`:

```ts
export type EngineSettingsState = {
  pointSizePx: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  exposure: number;
  toneMapCurve: ToneMapCurve;
};
```

- [ ] **Step 3: Add the handle setter**

Open `src/@types/EngineHandle.d.ts`. After `setGalaxyTexturesEnabled?:` add:

```ts
  /**
   * Toggle the procedural Milky Way impostor at world origin.  Default
   * ON (see `data/defaults.ts:DEFAULT_MILKY_WAY_ENABLED`).  Off is a
   * pure GPU-time saver and a "I want to see the cosmic web without
   * cartoon foreground" escape hatch.
   */
  setMilkyWayEnabled?: (enabled: boolean) => void;
```

- [ ] **Step 4: Add the echo callback**

Open `src/@types/EngineCallbacks.d.ts`. Find the spot where `onGalaxyTexturesEnabledChange` is declared and add after it:

```ts
  /**
   * Fired when the engine's `setMilkyWayEnabled` updates the flag.
   * The React shell uses this to drive the SettingsPanel checkbox so
   * the UI reflects the engine's authoritative state.
   */
  onMilkyWayEnabledChange?: (enabled: boolean) => void;
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: TypeScript will report missing `milkyWayEnabled` in the engine's settings-state initialiser (`engine.ts` around line 248). This is expected — the next task fixes it. If any OTHER file fails typecheck (e.g., a file that exhaustively destructures `EngineSettingsState`), add the field there too with a default of `DEFAULT_MILKY_WAY_ENABLED`.

- [ ] **Step 6: Commit**

```bash
git add src/data/defaults.ts src/@types/EngineSettingsState.d.ts src/@types/EngineHandle.d.ts src/@types/EngineCallbacks.d.ts
git commit -m "feat(milky-way): add settings type + default for impostor toggle"
```

---

## Task 4: WGSL shader — vertex + fragment ported from ShaderToy

**Files:**
- Create: `src/services/gpu/shaders/milkyWayImpostor.wgsl`

Hand-port the Task 0 GLSL into a single WGSL file. Vertex stage emits a clip-space quad covering the full viewport (with 5% bleed on each side so the smoothstep edge fade has room). Fragment stage runs the ported galaxy code. No texture sampling.

- [ ] **Step 1: Write the shader**

Create `src/services/gpu/shaders/milkyWayImpostor.wgsl`:

```wgsl
// License CC0: Spiral galaxy
// Ported to WGSL from the original ShaderToy GLSL (CC0).  See plan
// docs/superpowers/plans/2026-05-04-milky-way-impostor.md Task 0 for
// the verbatim original source and the WGSL-port deltas.
//
// ─────────────────────────────────────────────────────────────────────
//
// milkyWayImpostor.wgsl — single-quad procedural Milky Way at world origin.
//
// This pass renders ONE screen-aligned quad that covers the full
// viewport (plus a 5% bleed margin on each side, so the fragment-side
// smoothstep edge fade has room to come down to zero before the
// quad's hard edge).  The fragment stage runs a ray-marched procedural
// galaxy that gives the viewer a sense of being "inside" the Milky Way.
//
// The impostor is purely cosmetic — there is no Milky Way row in any
// of the three catalogs (SDSS, 2MRS, GLADE) at the world origin, so
// without this pass the user looks at empty space when they look "down"
// at Earth.  With it, they see a slowly-rotating spiral that visually
// anchors the rendered universe to a meaningful "here".
//
// ── Why screen-aligned, not world-fixed disk plane?
//
// A future enhancement would orient the quad to lie in the actual
// galactic disk plane (Galactic latitude 0°), which in the equatorial
// J2000 coordinates this engine uses corresponds to a tilted plane
// rotated ~62.6° from the celestial equator.  That would be visually
// more "correct" but requires a per-camera-distance fudge so the disk
// looks dramatic at small distances and flat at larger ones, and the
// user would see a thin streak instead of a face-on spiral when
// looking edge-on.  Screen-aligned matches the ShaderToy's 2D framing
// directly — the camera orbits AROUND the galaxy in the shader's own
// coordinates, regardless of where it sits in skymap world space.
//
// ── Why output linear HDR colour?
//
// Every other pass in this engine writes linear-light into the rgba16f
// HDR target and the tone-map pass downstream applies the curve +
// exposure + (sRGB conversion via swap-chain format).  The original
// ShaderToy applied display-space gamma (`pow(col, 0.75)`), a contrast
// S-curve, a saturation pump, and a vignette in its `postProcess`
// function — all of which are display-space operations that would
// double-up with the engine's tone-map pass and produce muddy crushed
// blacks.  Those four operations are DELETED, not ported.
//
// ── Coordinate convention inside the fragment stage
//
// The fragment receives `uv` in `[-1.05, 1.05]²` (the 5% bleed
// margin).  We feed `uv` directly into the ShaderToy's `mainImage`
// equivalent as the "p" vector after aspect-ratio normalisation —
// since the vertex stage already pre-stretches the quad in clip-space
// to compensate for non-square viewports, the fragment shader sees a
// square-aspect-ratio uv and doesn't need to know iResolution.
//
// ── ShaderToy → WGSL specific notes
//
//   - GLSL `inout` parameters in `mod2(inout vec2 p, ...)` and
//     `rot(inout vec2 p, ...)` become value-returning helpers that
//     return the modified value (and a struct for `mod2`'s two-output
//     case).
//   - The two `galaxy()` overloads (one taking `(vec2 p, float a,
//     float z)` for the noise hatching, one taking `(vec2 p, vec3 ro,
//     vec3 rd, float d)` for the full disk shading) collide in WGSL
//     which has no overloading.  We rename the four-arg overload to
//     `shadeGalaxyDisk` and keep the three-arg one as `galaxy`.
//   - `for (int i = 0; i < 11; ++i)` becomes `for (var i: i32 = 0; i
//     < 11; i = i + 1)`.

struct Uniforms {
  // mat4 viewProj — UNUSED in this pass (the quad is emitted directly
  // in clip-space) but kept in the struct for ABI symmetry with the
  // other GPU passes; the renderer module writes it anyway from the
  // shared per-frame snapshot.
  viewProj: mat4x4<f32>,
  // viewport (px) — UNUSED in this pass for the same reason.  Kept
  // for ABI symmetry.
  viewport: vec2<f32>,
  // Distance-fade alpha pre-computed on the CPU
  // (`utils/math/milkyWayFade.ts`).  Multiplied into the fragment's
  // emissive output and into alpha for premultiplied blend.
  fadeAlpha: f32,
  // iTime in seconds, scaled by 0.25 on the CPU before upload so the
  // ShaderToy's internal `TIME = iTime*0.1` works out to a slow,
  // alive-but-not-spinning rotation.
  iTime: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uv: vec2<f32>,  // [-1.05, 1.05]²
};

// Emit a clip-space quad that covers the full viewport plus a 5% bleed.
// Six vertices, one triangle-list quad.  The 5% bleed exists so the
// fragment stage's edge fade can come down to zero alpha before the
// quad's hard edge — without it, you'd see a sharp rectangular cut
// against the cleared HDR target.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.05, -1.05),
  vec2<f32>( 1.05, -1.05),
  vec2<f32>( 1.05,  1.05),
  vec2<f32>(-1.05, -1.05),
  vec2<f32>( 1.05,  1.05),
  vec2<f32>(-1.05,  1.05),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  let c = CORNERS[vid];
  var out: VsOut;
  // Clip-space directly — w=1 so the quad sits at the near plane and
  // never gets occluded by the depth buffer.  Note we DON'T use the
  // viewProj matrix; the impostor is conceptually a screen-space
  // backdrop, like a skybox layer, not a 3D object.
  out.clipPos = vec4<f32>(c, 0.0, 1.0);
  out.uv = c;
  return out;
}

// ── Ported helpers (see Task 0 of the plan for the original GLSL) ────

const TWIRLY: f32 = 2.5;

fn toPolar(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(length(p), atan2(p.y, p.x));
}

fn toRect(p: vec2<f32>) -> vec2<f32> {
  return p.x * vec2<f32>(cos(p.y), sin(p.y));
}

// GLSL's `mod2` mutated `p` in-place via `inout` and returned the cell
// index `c`.  WGSL has no `inout`; we return both via a struct.
struct Mod2Out {
  p: vec2<f32>,
  c: vec2<f32>,
};

fn mod2(p_in: vec2<f32>, size: vec2<f32>) -> Mod2Out {
  // GLSL `mod` is the floored modulo; WGSL's `%` is truncated and
  // `fract`-based.  Replicate the GLSL formula explicitly:
  //   mod(x, y) = x - y * floor(x/y)
  let pPlusHalf = p_in + size * 0.5;
  let c = floor(pPlusHalf / size);
  let q = pPlusHalf - size * floor(pPlusHalf / size);
  var out: Mod2Out;
  out.p = q - size * 0.5;
  out.c = c;
  return out;
}

fn noise1(p_in: vec2<f32>, tm: f32) -> f32 {
  let p = p_in * tanh(0.1 * length(p_in));
  let a = cos(p.x);
  let b = cos(p.y);
  let c = cos(p.x * sqrt(3.5) + tm);
  let d = cos(p.y * sqrt(1.5) + tm);
  return a * b * c * d;
}

fn rot(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x + s * p.y, -s * p.x + c * p.y);
}

fn twirl(p_in: vec2<f32>, a: f32, z: f32) -> vec2<f32> {
  var pp = toPolar(p_in);
  pp.y = pp.y + pp.x * TWIRLY + a;
  let p = toRect(pp) * z;
  return p;
}

fn galaxy(p: vec2<f32>, a: f32, z: f32, tm: f32) -> f32 {
  return noise1(twirl(p, a, z), tm);
}

fn rand(co: vec2<f32>) -> f32 {
  return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn raySphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> vec2<f32> {
  let m = ro - center;
  let b = dot(m, rd);
  let c = dot(m, m) - radius * radius;
  if (c > 0.0 && b > 0.0) { return vec2<f32>(-1.0, -1.0); }
  let discr = b * b - c;
  if (discr < 0.0) { return vec2<f32>(-1.0, -1.0); }
  let s = sqrt(discr);
  return vec2<f32>(-b - s, -b + s);
}

fn stars(p_in: vec2<f32>) -> vec3<f32> {
  // Polar squish gives the inner stars more density.
  var pp = toPolar(p_in);
  pp.x = pp.x / ((1.0 + length(pp.x)) * 0.5);
  var p = toRect(pp);

  let sz: f32 = 0.0075;
  var s = vec3<f32>(10000.0);

  for (var i: i32 = 0; i < 3; i = i + 1) {
    p = rot(p, 0.5);
    let m = mod2(p, vec2<f32>(sz));
    let r = rand(m.c);
    let o = -1.0 + 2.0 * vec2<f32>(r, fract(r * 1000.0));
    s.x = min(s.x, length(m.p - 0.25 * sz * o));
    s.y = m.c.x * 0.1;
    s.z = m.c.y * 0.1;
  }
  return s;
}

// SABS is a smooth absolute-value: linear far from zero, parabolic near
// zero with knee `k`.  GLSL macro: `LESS((.5/k)*x*x+k*.5,abs(x),abs(x)-k)`.
// `LESS(a, b, c) = mix(a, b, step(0., c))` — i.e., `c >= 0` ? b : a.
// Substituting `c = abs(x) - k`: when `|x| >= k` use `abs(x)`, else use
// the parabolic blend.  WGSL `select` does the same job.
fn sabs(x: f32, k: f32) -> f32 {
  let a = (0.5 / k) * x * x + k * 0.5;
  let ax = abs(x);
  return select(a, ax, ax >= k);
}

fn height(p: vec2<f32>, tm: f32) -> f32 {
  let ang = atan2(p.y, p.x);
  let l = length(p);
  let sp = mix(1.0, pow(0.75 + 0.25 * sin(2.0 * (ang + l * TWIRLY)), 3.0), tanh(6.0 * l));
  var s: f32 = 0.0;
  var a: f32 = 1.0;
  var f: f32 = 15.0;
  var d: f32 = 0.0;
  for (var i: i32 = 0; i < 11; i = i + 1) {
    let g = a * galaxy(p, tm * (0.025 * f32(i)), f, tm);
    s = s + g;
    a = a * sqrt(0.45);
    f = f * sqrt(2.0);
    d = d + a;
  }
  s = s * sp;
  return sabs(-0.25 + s / d, 0.5) * exp(-5.5 * l * l);
}

fn galaxyNormal(p: vec2<f32>, tm: f32) -> vec3<f32> {
  let eps = vec2<f32>(0.000125, 0.0);
  var n: vec3<f32>;
  n.x = height(p - eps.xy, tm) - height(p + eps.xy, tm);
  n.y = 2.0 * eps.x;
  n.z = height(p - eps.yx, tm) - height(p + eps.yx, tm);
  return normalize(n);
}

const COL_DUST = vec3<f32>(1.0, 0.9, 0.75);

fn shadeGalaxyDisk(p_in: vec2<f32>, ro: vec3<f32>, rd: vec3<f32>, d: f32, tm: f32) -> vec3<f32> {
  let p = rot(p_in, 0.5 * tm);

  let h = height(p, tm);
  let s = stars(p);
  let th = tanh(h);
  let n = galaxyNormal(p, tm);

  let p3 = vec3<f32>(p.x, th, p.y);
  let lh: f32 = 0.5;
  let lp1 = vec3<f32>(0.0, lh, 0.0);
  let ld1 = normalize(lp1 - p3);
  let lp2 = vec3<f32>(0.0, lh, 0.0);
  let ld2 = normalize(lp2 - p3);

  let l = length(p);
  let tl = tanh(l);

  // (diff1 was commented out in the original ShaderToy and is omitted.)
  let diff2 = max(dot(ld2, n), 0.0);

  var col = vec3<f32>(0.0);
  col = col + vec3<f32>(0.5, 0.5, 0.75) * h;
  col = col + 0.25 * pow(diff2, 4.0);
  // The third additive term mixes between (0.5, 1.0, 1.5) and its zyx
  // swap (1.5, 1.0, 0.5) — written explicitly here for review clarity.
  let warmCool = mix(vec3<f32>(0.5, 1.0, 1.5), vec3<f32>(1.5, 1.0, 0.5), 1.25 * tl);
  col = col + pow(vec3<f32>(0.5) * h, n.y * 1.75 * warmCool);

  let sr = rand(s.yz);
  let si = pow(th * sr, 0.25) * 0.001;
  var scol = sr * 5.0 * exp(-2.5 * l * l) * tanh(pow(si / s.x, 2.5))
    * mix(vec3<f32>(0.5, 0.75, 1.0), vec3<f32>(1.0, 0.75, 0.5), sr * 0.6);
  scol = clamp(scol, vec3<f32>(0.0), vec3<f32>(1.0));
  col = col + scol * smoothstep(0.0, 0.35, 1.0 - n.y);

  let ddust = (h - ro.y) / rd.y;
  if (ddust < d) {
    let t = d - ddust;
    col = col + 0.7 * COL_DUST * (1.0 - exp(-2.0 * t));
  }

  return col;
}

fn renderGalaxy(ro: vec3<f32>, rd: vec3<f32>, tm: f32) -> vec3<f32> {
  let dgalaxy = (0.0 - ro.y) / rd.y;

  var col = vec3<f32>(0.0);

  if (dgalaxy > 0.0) {
    let p = ro + dgalaxy * rd;
    col = shadeGalaxyDisk(p.xz, ro, rd, dgalaxy, tm);
  }

  let cgalaxy = raySphere(ro, rd, vec3<f32>(0.0), 0.125);

  var t: f32 = 0.0;

  if (dgalaxy > 0.0 && cgalaxy.x > 0.0) {
    let t0 = max(dgalaxy - cgalaxy.x, 0.0);
    let t1 = cgalaxy.y - cgalaxy.x;
    t = min(t0, t1);
  } else if (cgalaxy.x < cgalaxy.y) {
    t = cgalaxy.y - cgalaxy.x;
  }

  col = col + 1.7 * COL_DUST * (1.0 - exp(-1.0 * t));

  return col;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // Match the ShaderToy's `TIME` macro: the inner code uses
  // `tm = iTime * 0.1`.  CPU has already pre-multiplied `iTime` by the
  // outer animation-speed factor of 0.25 (see milkyWayRenderer.ts), so
  // by the time we get here a uniform `iTime` of 1.0 corresponds to
  // 4 seconds of wall-clock time and `tm` becomes 0.1 (slow but alive).
  let tm = u.iTime * 0.1;

  // Original mainImage: q = fragCoord/RESOLUTION; p = -1 + 2*q; p.x *= aspect.
  // Our vertex stage already emits uv in [-1.05, 1.05]² so we use it
  // directly.  The 5%-bleed becomes the smoothstep fade region near
  // the corners — without that bleed the user would see the rectangle
  // edge of the impostor.
  let p = in.uv;

  // Camera: hard-coded from the original ShaderToy.  This is the
  // vantage point the artist chose for the most aesthetically pleasing
  // framing of the spiral, and it's deliberately fixed regardless of
  // the user's actual orbit camera — the impostor is a 2D backdrop,
  // not a 3D scene the engine's camera can fly through.  See the
  // header comment for the screen-aligned-vs-world-fixed trade.
  let ro = vec3<f32>(0.0, 0.7, 2.0) * 0.75;
  let la = vec3<f32>(0.0, 0.0, 0.0);
  let up = vec3<f32>(-0.5, 1.0, 0.0);
  let ww = normalize(la - ro);
  let uu = normalize(cross(up, ww));
  let vv = normalize(cross(ww, uu));
  let rd = normalize(p.x * uu + p.y * vv + 2.5 * ww);

  let col = renderGalaxy(ro, rd, tm);

  // Smooth edge fade: the bleed margin runs from radius 1.0 to 1.05.
  // Inside the unit square (radius ≤ 1.0 in either component) we're at
  // full alpha; from 1.0 to ~1.05 we fade to zero so there's no hard
  // rectangular edge against the cleared HDR background.
  //
  // We use the L∞ norm here (max of |x|, |y|) because the visual
  // structure of the galaxy is bounded inside the unit square in this
  // shader — a circular fade would crop the diagonal extents.
  let r = max(abs(in.uv.x), abs(in.uv.y));
  let edgeFade = 1.0 - smoothstep(1.0, 1.05, r);

  // Final alpha is the per-frame distance-fade (CPU-computed from
  // camera distance to origin) times the per-pixel edge fade.
  let alpha = u.fadeAlpha * edgeFade;

  // Output LINEAR HDR colour with premultiplied alpha to match the
  // engine's other passes.  No postProcess() — the engine's downstream
  // tone-map pass handles gamma + curve + exposure + sRGB conversion.
  return vec4<f32>(col * alpha, alpha);
}
```

- [ ] **Step 2: Verify the WGSL parses (sanity check via build)**

Run: `npm run build`

Expected: vite + tsc both clean. The shader file is imported as a `?raw` string by the not-yet-existing renderer module, so it isn't validated at build time — but vite's import-analyzer would still flag any malformed file path. If `npm run build` fails, the failure should be unrelated to this file (the renderer doesn't exist yet, so no module imports the .wgsl).

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/shaders/milkyWayImpostor.wgsl
git commit -m "feat(milky-way): add WGSL port of CC0 spiral-galaxy shader"
```

---

## Task 5: `MilkyWayRenderer` — pipeline + draw method

**Files:**
- Create: `src/services/gpu/milkyWayRenderer.ts`
- Create: `tests/services/gpu/milkyWayRenderer.test.ts`

A near-mirror of `proceduralDiskRenderer.ts` but with no per-instance vertex buffer (single draw, six vertices, no instance attributes). Uniform buffer is 96 bytes to match the existing pass ABI.

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/milkyWayRenderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MilkyWayRenderer } from '../../../src/services/gpu/milkyWayRenderer';

describe('MilkyWayRenderer', () => {
  it('exports the class as a constructor', () => {
    // Instantiation requires a real GPUDevice; vitest's jsdom env has
    // none, so we only verify the export shape and prototype methods
    // — same approach as proceduralDiskRenderer.test.ts.  Visual
    // correctness is verified manually in Task 11.
    expect(typeof MilkyWayRenderer).toBe('function');
    expect(MilkyWayRenderer.prototype.draw).toBeTypeOf('function');
    expect(MilkyWayRenderer.prototype.destroy).toBeTypeOf('function');
  });

  it('exposes the documented uniform buffer size constant', () => {
    // The renderer uploads exactly UNIFORM_BUFFER_SIZE bytes per frame.
    // Pinning this in a test ensures the WGSL `Uniforms` struct and
    // the JS-side `ArrayBuffer(UNIFORM_BUFFER_SIZE)` allocation can
    // never silently drift.
    expect(MilkyWayRenderer.UNIFORM_BUFFER_SIZE).toBe(96);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/gpu/milkyWayRenderer.test.ts`

Expected: FAIL — module `../../../src/services/gpu/milkyWayRenderer` not found.

- [ ] **Step 3: Write the renderer**

Create `src/services/gpu/milkyWayRenderer.ts`:

```ts
/**
 * milkyWayRenderer — single-quad procedural Milky Way impostor at the
 * world origin.
 *
 * Sibling to `proceduralDiskRenderer.ts` (per-galaxy 3D-oriented
 * impostors) and `quadRenderer.ts` (textured screen-aligned thumbnails)
 * but with a degenerate cardinality: this pass renders exactly ONE
 * instance per frame.  No per-galaxy vertex buffer, no instancing —
 * just a six-vertex `draw(6, 1)` call.
 *
 * The GPU side is a hand port of a CC0 ShaderToy "Spiral galaxy"
 * fragment shader.  See `shaders/milkyWayImpostor.wgsl` for the WGSL
 * source and the per-line port notes.
 *
 * ### Uniform buffer ABI
 *
 * 96 bytes total — padded to the same shape as the procedural-disk
 * uniform layout so future refactors that share a uniform-pack helper
 * across passes don't have to special-case this one:
 *
 *   offset 0  | mat4x4<f32> viewProj    — UNUSED (kept for ABI symmetry)
 *   offset 64 | vec2<f32>   viewport    — UNUSED (kept for ABI symmetry)
 *   offset 72 | f32         fadeAlpha   — distance-based alpha, [0..1]
 *   offset 76 | f32         iTime       — animation time (sec * 0.25)
 *   offset 80 | (16 bytes padding for std140-ish 96-byte total)
 *
 * The two UNUSED slots are intentional:
 *   - viewProj: the impostor is emitted directly in clip-space, so the
 *     vertex stage doesn't need a view matrix.  But every other pass in
 *     this engine uploads viewProj in slot 0; mirroring it here lets a
 *     future "renderFrame uniform-pack helper" stay pass-agnostic.
 *   - viewport: same rationale — every other pass uses it for
 *     pxPerRad-style derivations.  This pass doesn't need pixel
 *     coordinates because the fragment shader works in [-1.05, 1.05]
 *     uv space directly, but uploading it costs effectively nothing
 *     and preserves ABI symmetry.
 *
 * ### Why no instance vertex buffer?
 *
 * `proceduralDiskRenderer.ts` packs per-galaxy data (xyz, size,
 * orientation, colour-index, crossfade) into a per-instance vertex
 * buffer.  This pass has no such per-galaxy data — there is exactly
 * one impostor at one fixed position (the world origin, baked into the
 * shader).  We do not even need a vertex buffer; the vertex stage
 * looks up its corner from a const `array<vec2<f32>, 6>` indexed by
 * `@builtin(vertex_index)`.
 */

import wgsl from './shaders/milkyWayImpostor.wgsl?raw';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
};

export class MilkyWayRenderer {
  /**
   * Public constant pinning the on-the-wire uniform buffer size.  Must
   * match the WGSL `Uniforms` struct's std140-ish layout (mat4 + vec2 +
   * 2 f32 + 16 bytes padding = 96 bytes) byte-for-byte.  Changing one
   * without the other yields silent uniform-read corruption.
   */
  static readonly UNIFORM_BUFFER_SIZE = 96;

  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.uniformBuffer = device.createBuffer({
      size: MilkyWayRenderer.UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied additive — same blend mode as the procedural
            // disk pass and the points pass, so the impostor composites
            // correctly with downstream additive contributions when
            // both are drawing the same pixels.
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue the single-instance draw.  Encodes a 6-vertex / 1-instance
   * call after writing the uniform buffer.  Caller is responsible for
   * gating on the user's "Show Milky Way" toggle and the distance-fade
   * threshold (`fadeAlpha === 0` is the natural skip condition; the
   * caller should `return` instead of submitting a no-op draw to keep
   * the per-frame cost honest at zero when the impostor is invisible).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    fadeAlpha: number,
    iTimeSec: number,
  ): void {
    // Pack uniforms into a 96-byte ArrayBuffer matching the WGSL
    // `Uniforms` struct layout.  See the class doc-comment for the
    // offset table.
    const uniforms = new ArrayBuffer(MilkyWayRenderer.UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniforms);
    // mat4 viewProj (offsets 0..63 / floats 0..15)
    f32.set(viewProj, 0);
    // viewport (offsets 64..71 / floats 16..17)
    f32[16] = viewport[0];
    f32[17] = viewport[1];
    // fadeAlpha (offset 72 / float 18)
    f32[18] = fadeAlpha;
    // iTime (offset 76 / float 19)
    f32[19] = iTimeSec;
    // floats 20..23 are padding — already zero from ArrayBuffer init.
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, 1);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/gpu/milkyWayRenderer.test.ts`

Expected: PASS — both tests green.

- [ ] **Step 5: Run the full suite to verify no regression**

Run: `npm test`

Expected: all tests pass; the new file's two tests are added to the count.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: clean. (The `?raw` import is already wired for the existing renderers, so vite-env types should already cover it.)

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/milkyWayRenderer.ts tests/services/gpu/milkyWayRenderer.test.ts
git commit -m "feat(milky-way): add MilkyWayRenderer pipeline + uniform layout"
```

---

## Task 6: Engine integration — instantiate + plumb iTime epoch + setter

**Files:**
- Modify: `src/services/engine/engine.ts`

The engine creates the renderer at startup, holds an `iTimeEpoch` (`performance.now()` snapshot at construction) so the per-frame iTime is `(now - epoch) * 0.001 * 0.25`, seeds the `milkyWayEnabled` setting from the default, and exposes the `setMilkyWayEnabled` setter on the public handle.

- [ ] **Step 1: Add the import**

In `src/services/engine/engine.ts` near the other GPU-renderer imports (around line 112-114), add:

```ts
import { MilkyWayRenderer } from '../gpu/milkyWayRenderer';
```

And add `DEFAULT_MILKY_WAY_ENABLED` to the import block from `'../../data/defaults'` near line 73-87.

- [ ] **Step 2: Seed the setting**

In the engine's `state.settings = { ... }` initialiser (around line 248 where `galaxyTexturesEnabled: DEFAULT_GALAXY_TEXTURES_ENABLED,` lives), add immediately after that line:

```ts
      milkyWayEnabled: DEFAULT_MILKY_WAY_ENABLED,
```

- [ ] **Step 3: Construct the renderer**

In the engine's GPU-startup block (look for `const proceduralDiskRenderer = new ProceduralDiskRenderer({ ... });` — that's the closest sibling), add immediately after it:

```ts
    // Procedural Milky Way impostor at world origin.  See
    // `services/gpu/milkyWayRenderer.ts` for the rationale on why this
    // is a sibling renderer rather than tucked into the per-galaxy
    // procedural-disk pass, and `utils/math/milkyWayFade.ts` for the
    // distance-fade band.
    const milkyWayRenderer = new MilkyWayRenderer({
      device,
      format: presentationFormat,
    });
```

(If the local variable name for the format differs in the file, use whatever the existing renderers pass — grep for `format: presentationFormat` near the existing renderer constructions.)

- [ ] **Step 4: Add the iTime epoch**

Near the top of the engine's per-frame state block (where `lastTickMs` or similar wall-clock baselines live; if no such block exists, immediately above the `frame()` function definition), add:

```ts
  /**
   * Wall-clock epoch (ms, from `performance.now`) snapshot taken at
   * engine construction.  Per-frame the Milky Way impostor's iTime
   * is computed as `(performance.now() - milkyWayITimeEpochMs) * 0.001 *
   * 0.25` — outer factor `0.25` is the slow-but-alive animation scale
   * decided in the plan.  See `shaders/milkyWayImpostor.wgsl` line
   * tagged `Match the ShaderToy's TIME macro` for the inner `* 0.1`
   * factor that runs on top of this.
   */
  const milkyWayITimeEpochMs = performance.now();
```

- [ ] **Step 5: Wire the public-handle setter**

Find the existing `setGalaxyTexturesEnabled` setter (around line 1346). Immediately after its closing brace, add:

```ts
    setMilkyWayEnabled(enabled) {
      // Mirror of `setGalaxyTexturesEnabled`: mutate the per-frame
      // setting bag in place (the render-on-demand scheduler will
      // notice the next tick) and fire the echo callback so React's
      // SettingsPanel state stays in sync with the engine truth.
      state.settings.milkyWayEnabled = enabled;
      cb.onMilkyWayEnabledChange?.(enabled);
      scheduler.requestRender();
    },
```

(`scheduler.requestRender()` may already be done implicitly by the assignment in the existing setters; check the local pattern and match it.)

- [ ] **Step 6: Pass the renderer + iTime + flag into the per-frame `renderFrame` call**

In the engine's `frame()` function, find the call site that builds the `renderFrame(...)` input bag (around lines 950-1000 — search for `renderFrame(`). You'll add three new fields to the input.

Locate the line(s) that pass `pointRenderer`, `toneMapPass`, etc., and `settings: { ... galaxyTexturesEnabled: state.settings.galaxyTexturesEnabled, ... }`. After `pointRenderer,` in the GPU handles section add:

```ts
      milkyWayRenderer,
```

In the `settings: { ... }` initialiser add (after `galaxyTexturesEnabled`):

```ts
        milkyWayEnabled: state.settings.milkyWayEnabled,
```

At top level of the input bag (next to `viewProj`, `cam`, etc.) add:

```ts
      milkyWayITimeSec: (performance.now() - milkyWayITimeEpochMs) * 0.001 * 0.25,
```

Type errors will pop here — that's expected; Task 7 fixes them.

- [ ] **Step 7: Hook destroy**

If the engine has a `handle.destroy()` block that destroys other renderers (e.g., `proceduralDiskRenderer.destroy()`), add `milkyWayRenderer.destroy();` next to it.

- [ ] **Step 8: Typecheck (will fail on `renderFrame` shape until Task 7)**

Run: `npm run typecheck`

Expected: TypeScript reports `Property 'milkyWayRenderer' does not exist on type 'RenderFrameInput'` (and same for `milkyWayITimeSec`, `milkyWayEnabled`). This is expected — Task 7 widens the type. Do NOT commit yet; go straight to Task 7.

---

## Task 7: Engine integration — `renderFrame` early Milky Way pass

**Files:**
- Modify: `src/services/engine/renderFrame.ts`

Widen `RenderFrameInput` and `RenderFrameSettings`, then add a Milky Way draw call inside the HDR pass BEFORE the points draw and BEFORE the thumbnails. Premultiplied additive blend means draw order doesn't change the math, but conceptually the impostor is a backdrop, so we put it first.

- [ ] **Step 1: Add the import**

At the top of `renderFrame.ts`:

```ts
import type { MilkyWayRenderer } from '../gpu/milkyWayRenderer';
import { milkyWayFadeAlpha } from '../../utils/math/milkyWayFade';
```

- [ ] **Step 2: Add to `RenderFrameSettings`**

In the `RenderFrameSettings` type definition (around line 99-141), add after `galaxyTexturesEnabled`:

```ts
  /**
   * Whether to render the procedural Milky Way impostor at the world
   * origin.  See `services/gpu/milkyWayRenderer.ts` for the rationale.
   * When false, the pass is skipped entirely (zero GPU cost beyond a
   * branch in the host CPU code).
   */
  milkyWayEnabled: boolean;
```

- [ ] **Step 3: Add to `RenderFrameInput`**

In the `RenderFrameInput` type definition (around line 148-179), in the GPU handles section add after `pointRenderer: PointRenderer;`:

```ts
  milkyWayRenderer: MilkyWayRenderer;
```

And after the `viewProj: mat4;` field, add:

```ts
  /**
   * Animation time in seconds for the Milky Way impostor, already
   * scaled by the engine's chosen "slow but alive" factor (0.25× wall
   * clock).  See `engine.ts` for the epoch-relative calculation.
   */
  milkyWayITimeSec: number;
```

- [ ] **Step 4: Destructure them**

Inside `renderFrame`, in the `const { ... } = input;` block (around line 192-210), add `milkyWayRenderer,` next to `pointRenderer,` and `milkyWayITimeSec,` next to `viewProj,`.

- [ ] **Step 5: Add the early Milky Way pass**

Inside the HDR `pass = encoder.beginRenderPass(...)` block, BEFORE the `pointRenderer.draw(...)` call (line 266 area), add:

```ts
  // ── Milky Way impostor (procedural backdrop at world origin) ──────
  //
  // Drawn before the points pass so per-galaxy point billboards
  // overdraw the impostor where they overlap (an SDSS row at the
  // dead centre would compete; in practice there isn't one, but the
  // ordering is the principled choice regardless).  The pass is
  // skipped entirely when:
  //
  //   - the user has toggled "Show Milky Way" off, or
  //   - the camera is far enough from the world origin that the
  //     distance fade has fully attenuated alpha to zero.
  //
  // Both are CPU branches; neither costs GPU time when the gate is
  // closed.  See `utils/math/milkyWayFade.ts` for the band.
  if (settings.milkyWayEnabled) {
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc);
    if (fadeAlpha > 0) {
      milkyWayRenderer.draw(
        pass,
        // viewProj is uploaded for ABI symmetry only; the impostor's
        // vertex stage emits clip-space directly without sampling it.
        viewProj as Float32Array,
        [canvasWidth, canvasHeight],
        fadeAlpha,
        milkyWayITimeSec,
      );
    }
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: clean (or only errors unrelated to this task).

- [ ] **Step 7: Run all tests**

Run: `npm test`

Expected: all tests pass. The renderer test from Task 5 still passes; the fade test from Task 2 still passes. No new tests in this task — engine wiring is verified manually in Task 11.

- [ ] **Step 8: Commit (Tasks 6 + 7 together)**

Tasks 6 and 7 are coupled — Task 6 leaves the engine in a non-typechecking state. Commit them as one unit:

```bash
git add src/services/engine/engine.ts src/services/engine/renderFrame.ts
git commit -m "feat(milky-way): wire impostor renderer through engine + render-frame"
```

---

## Task 8: SettingsPanel — "Show Milky Way" checkbox

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`

Add an optional pair of props (`milkyWayEnabled` + `onMilkyWayEnabledChange`), gated render of a checkbox row alongside the existing "Galaxy thumbnails" toggle.

- [ ] **Step 1: Add props**

In the `Props` type definition (around line 84-220), after `onGalaxyTexturesChange`, add:

```ts
  /**
   * Whether the procedural Milky Way impostor at world origin is
   * rendered.  Optional — older call sites without this prop see no
   * Milky Way row in the panel.  See
   * `services/gpu/milkyWayRenderer.ts` for what the impostor is.
   */
  milkyWayEnabled?: boolean;
  /** Fired when the user toggles the "Show Milky Way" checkbox. */
  onMilkyWayEnabledChange?: (enabled: boolean) => void;
```

- [ ] **Step 2: Destructure and add gate**

In the function signature destructuring (around line 242-276), after `onGalaxyTexturesChange,` add:

```ts
  milkyWayEnabled,
  onMilkyWayEnabledChange,
```

After the existing `showOrientationToggles` / `showBiasControls` gate constants (around line 290-320), add:

```ts
  // Milky Way checkbox: rendered only when both the value and the
  // change-callback are wired by the parent.  Same opt-in idiom as
  // every other optional section in this panel.
  const showMilkyWayToggle =
    milkyWayEnabled !== undefined && onMilkyWayEnabledChange !== undefined;
```

- [ ] **Step 3: Render the row**

Find the existing "Galaxy thumbnails" checkbox in the JSX (search for `galaxyTexturesEnabled` in the JSX body — it'll be a `<input id="toggle-galaxy-textures" type="checkbox" ...>`). Immediately after that row's closing `</div>`, add:

```tsx
      {showMilkyWayToggle && (
        <div className={styles.panelRow}>
          <label htmlFor="toggle-milky-way">Show Milky Way</label>
          <input
            id="toggle-milky-way"
            type="checkbox"
            checked={milkyWayEnabled}
            onChange={(e) => onMilkyWayEnabledChange(e.target.checked)}
          />
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx
git commit -m "feat(milky-way): add Show Milky Way toggle to SettingsPanel"
```

---

## Task 9: App.tsx — wire React state to the new toggle

**Files:**
- Modify: `src/App.tsx`

A `useState` for `milkyWayEnabled`, an echo wiring through the engine callback, and the prop pass-through to SettingsPanel.

- [ ] **Step 1: Add the import**

At the top of `App.tsx`, in the import block from `'./data/defaults'`, add `DEFAULT_MILKY_WAY_ENABLED`. (If `defaults` is imported as a namespace, no change needed.)

- [ ] **Step 2: Add the state**

Find the existing `useState` for `galaxyTexturesEnabled` (around line 157). Immediately after that line, add:

```tsx
  const [milkyWayEnabled, setMilkyWayEnabled] =
    useState<boolean>(DEFAULT_MILKY_WAY_ENABLED);
```

- [ ] **Step 3: Wire the engine callback**

Find where `onGalaxyTexturesEnabledChange: setGalaxyTexturesEnabled,` is passed into the engine init callbacks (around line 290). Immediately after that line, add:

```tsx
      onMilkyWayEnabledChange: setMilkyWayEnabled,
```

- [ ] **Step 4: Pass to SettingsPanel**

Find the `<SettingsPanel ...>` usage where `galaxyTexturesEnabled={galaxyTexturesEnabled}` and `onGalaxyTexturesChange={...}` are passed (around line 469-474). Immediately after the `onGalaxyTexturesChange` line, add:

```tsx
        milkyWayEnabled={milkyWayEnabled}
        onMilkyWayEnabledChange={(enabled) => {
          handleRef.current?.setMilkyWayEnabled?.(enabled);
        }}
```

(Mirror the `galaxyTexturesEnabled` pattern — engine's echo callback updates React state, no optimistic local set needed.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 6: Run all tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(milky-way): wire SettingsPanel toggle through React state"
```

---

## Task 10: Build verification

**Files:** none.

- [ ] **Step 1: Build**

Run: `npm run build`

Expected: clean — both `tsc --noEmit` and `vite build` succeed without warnings related to this plan's surfaces. (Pre-existing warnings unrelated to Milky Way are fine.)

- [ ] **Step 2: Run the full suite once more**

Run: `npm test`

Expected: all tests pass; the test count is exactly +9 over the baseline recorded in Task 1 (7 from `milkyWayFade`, 2 from `milkyWayRenderer`).

- [ ] **Step 3: Commit (if anything changed during build — should be nothing)**

If `npm run build` shifted any auto-generated file (it shouldn't), commit it. Otherwise skip.

---

## Task 11: Manual visual verification

**Files:** none.

`CLAUDE.md` notes the dev server stays running. Per its convention: "to verify a UI change, ask the user to look (or describe what they should see)."

- [ ] **Step 1: Describe what to look for**

Tell the user to open the canvas in the browser. They should see:

  1. A slowly-rotating procedural spiral galaxy (the impostor) covering most of the viewport when the camera is at default starting position (~few Mpc from origin in the SDSS volume).
  2. The catalog galaxies (SDSS / 2MRS / GLADE) draw on top of the impostor — points and procedural disks composite additively, so dense regions blend bright against the spiral.
  3. The SettingsPanel has a new "Show Milky Way" row, default ON. Toggling it off makes the spiral disappear instantly with no other visual change.
  4. Flying the camera "outward" (orbit-out / scroll) past ~10 Mpc starts to fade the impostor; past ~50 Mpc it's invisible. Flying back in, it re-emerges smoothly.
  5. The animation is slow — visible motion if you watch for a few seconds, but not "spinny" or distracting.

- [ ] **Step 2: Note any visual issues**

If the user reports issues — e.g., the impostor is too bright, too dim, washes out the points pass, has a visible rectangular edge, or the fade band feels off — record them in this task before declaring done. Likely fix surfaces:

  - Too bright / washes out points: lower the per-frame `fadeAlpha` ceiling (multiply by 0.5 in `renderFrame.ts`).
  - Visible rectangular edge: the WGSL `smoothstep(1.0, 1.05, r)` band is too narrow; widen to `smoothstep(0.95, 1.05, r)`.
  - Fade feels too aggressive: bump the band to `[20, 100]` Mpc in `milkyWayFade.ts` (and update its test fixtures).
  - Animation too fast: lower the engine's outer scale from 0.25 to 0.10.
  - Shader doesn't compile: WebGPU console will show a precise WGSL error — most likely a missed `inout` removal or a `vec3(...)` literal that should be `vec3<f32>(...)`. Fix in `milkyWayImpostor.wgsl` and reload.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Port GLSL to WGSL inline at `shaders/milkyWayImpostor.wgsl` | Task 4 |
| `iTime` as a uniform | Tasks 4, 5, 6, 7 |
| Quad-local UVs in `[-1,1]²` (with 5% bleed) | Task 4 vertex stage |
| Screen-aligned quad at world origin | Task 4 vertex stage (clip-space) |
| Distance-fade across `[10, 50]` Mpc | Task 2 (math) + Task 7 (apply) |
| Drop ShaderToy `postProcess` | Task 0 reference + Task 4 explicit list |
| New `milkyWayRenderer.ts` mirrors `proceduralDiskRenderer.ts` | Task 5 |
| Engine integration via `renderFrame.ts` (after sky background, before points) | Task 7 (note: there's no separate "sky background" pass — the HDR clear is the sky background; the impostor draws right after that) |
| SettingsPanel "Show Milky Way" default ON | Tasks 3, 8, 9 |
| Pipeline / uniform-layout test | Task 5 |
| Slow time scale (animation) | Task 6 (epoch + 0.25× scale) + Task 4 (further 0.1× inside shader) |
| Premultiplied additive HDR composite | Task 5 (blend state) + Task 4 (alpha output) |
| Linear HDR output (no display-space ops) | Task 4 |

All requirements covered.

**2. Placeholder scan**

No "TBD", "fill in", "implement later", or `<placeholder>`. The Task 0 reference embeds the full GLSL verbatim. Every code block in every task is complete and runnable.

**3. Type-name consistency**

- `MilkyWayRenderer` (class name) — Tasks 5, 6, 7. Consistent.
- `setMilkyWayEnabled` (handle setter) — Tasks 3, 6, 9. Consistent.
- `onMilkyWayEnabledChange` (callback) — Tasks 3, 6, 8, 9. Consistent.
- `milkyWayEnabled` (settings field) — Tasks 3, 6, 7, 8, 9. Consistent.
- `milkyWayFadeAlpha` (helper) — Tasks 2, 7. Consistent.
- `milkyWayITimeSec` (renderFrame field) — Tasks 6, 7. Consistent.
- `MilkyWayRenderer.UNIFORM_BUFFER_SIZE` (static constant) — Tasks 5. Internal only.
- `DEFAULT_MILKY_WAY_ENABLED` — Tasks 3, 6, 9. Consistent.
- WGSL `Uniforms` struct field names: `viewProj`, `viewport`, `fadeAlpha`, `iTime` — Task 4 + Task 5 packing layout. Consistent.

No drift. Plan is internally consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-04-milky-way-impostor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review.

**2. Inline Execution** — batch execution with checkpoints.
