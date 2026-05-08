# Performance — per-shell and total frame budget

**Status:** Companion spec to [`00-scale-architecture.md`](00-scale-architecture.md). Numbers in this document are the contract every per-shell renderer must meet.
**Required for:** Every shell. Tour cannot ship if any shell exceeds its budget on the reference desktop machine.

## Why this exists as its own spec

The cosmic zoom is the first time skymap runs **multiple render pipelines per frame** (one per active shell, plus a brief overlap during crossfades). Today's renderer has one hot loop with cost characterised down to the millisecond — see the `engine.ts` per-frame-loop notes in `CLAUDE.md` (3.5M-galaxy gating, hoisted `Math.tan`, render-on-demand). With nine shells and a 60 fps target, every shell must declare a **time budget**, a **VRAM budget**, and an **adaptive-quality knob**, and the orchestrator must enforce them. This document is the single source of truth so per-shell specs reference rather than restate, and the CI perf benchmark has one table to compare against.

## 1. Total frame budget

Skymap targets **60 fps on a 2024 mid-tier laptop** (M1/M2 Mac, RTX 3050, Iris Xe, Radeon 760M): **16.67 ms** wall-clock, rounded to **16 ms** for compositor and present-deadline jitter slack.

| Bucket | Target | Notes |
|--------|--------|-------|
| GPU shell render passes | 12 ms | All active shells, post-process, labels |
| CPU per-frame work | 2 ms | Tour orchestrator, ROD scheduler, label rebuild, picking |
| Browser + present | 2 ms | RAF callback, swap chain present, compositor |

The **30 fps fallback** (33 ms total) covers older M1-air-class hardware. We do not support sub-30 fps — below that, tour camera ramps and crossfades feel broken regardless of visuals. Sub-30 fps devices fall back to today's static wide view (shell 8 only) with an explanatory banner. The **mobile target** is 30 fps on iPhone 14 / Pixel 7-class hardware; Android without WebGPU keeps today's point-cloud experience and the tour entry-point is disabled (section 8).

## 2. Per-shell GPU budget

Refined from the looser bucket in [`shells/00-shell-overview.md`](../shells/00-shell-overview.md) (1-3 ≤ 2 ms, 4-6 ≤ 4 ms, 7-9 ≤ 8 ms):

| # | Shell | GPU | Dominant cost | Adaptive knob |
|---|-------|----:|---------------|---------------|
| 1 | Solar System | 1.5 ms | Per-pixel ray-march of Sun (small footprint, ~200 px) | Lower noise-octave count |
| 2 | Stellar Neighborhood | 1.0 ms | ~50k Gaia DR3 point pass | Magnitude cutoff: 50k → 25k stars |
| 3 | Milky Way | 1.5 ms | Impostor + halo billboards | Drop halos; impostor only |
| 4 | Local Group | 2.0 ms | Disk renderer for MW/M31/M33 + dwarf fuzzies | Reduce dwarfs ~100 → ~30 |
| 5 | Local Sheet | 2.5 ms | Group-coloured pass over ~1.5M points | Switch to flat-coloured pass |
| 6 | Virgo Supercluster | 4.0 ms | Cluster X-ray volumetric (8 halos) | Halve raymarch steps; drop to billboards |
| 7 | Laniakea | **8.0 ms** | 256³ DM density raymarch + 32k flow vectors | Steps 64 → 32; flow grid 32³ → 16³ |
| 8 | Cosmic Web | 4.0 ms | Existing 2.5M point cloud + filaments | Tier large → medium → small |
| 9 | Observable Universe | 2.0 ms | Inside-sphere CMB shell (textured) | CMB texture 4k → 2k |
| – | Labels (MSDF) | 0.5 ms | Bundled across active shells | Skip non-hero labels |
| – | Post-process | 0.5 ms | Tonemap + bloom on Sun/X-ray pixels | Skip bloom |

**Steady-state total** (camera parked in one shell): shell + 1 ms shared overhead, well within 12 ms. Even shell 7 at 8 ms leaves 3 ms headroom. Non-obvious rows: shell 5 is shell 8's pass plus a per-point group-membership LUT fetch. Shell 6's eight half-res X-ray volumetrics with 32 steps amount to ~128M sample-ops, comfortable on RTX 3050. Shell 9's CMB sphere is ALU-cheap; cost is texture bandwidth.

## 3. Worst case — two shells active during transition

Crossfades last **1.0–2.0 s** at boundaries (per [`01-shell-transitions.md`](01-shell-transitions.md)). Two render passes execute back-to-back into the same backbuffer.

| Boundary | Sum | Headroom |
|----------|----:|---------:|
| 6 → 7 | 4.0 + 8.0 = 12.0 ms | 0.0 ms |
| 7 → 8 | 8.0 + 4.0 = 12.0 ms | 0.0 ms |
| 5 → 6 | 2.5 + 4.0 = 6.5 ms | 5.5 ms |
| All others | ≤ 6 ms | comfortable |

The 6↔7 and 7↔8 transitions sit at the ceiling. Shell 7 is the hero; we will not cut its quality for an easier transition. Mitigation: during any crossfade involving shell 7, **drop both shells' quality knobs by one step** for the fade duration. Camera is moving fast, user is mid-transition; nobody notices a half-resolution density volume for 1.5 s. Quality restores as soon as the fade resolves. The same trick rescues 30 fps fallback hardware on every transition.

## 4. Hot-path measurement strategy

**4.1 GPU timestamp queries.** Wrap each shell's render pass in `writeTimestamp` calls, resolve one frame later (one-frame-latency pattern; never read same-frame). 4-frame ring so we never stall. If `timestamp-query` is unavailable (Safari, some integrated GPUs), fall back to `performance.now()` brackets around `submit()` — coarser but trend-useful.

**4.2 Render bundles.** Each shell uses `GPURenderBundle` for its draw sequence. This cuts CPU encoder cost (relevant for the 2 ms CPU budget) and gives a single timed handle per shell. Today's `pointRenderer.ts` does not use bundles; the Phase 1 scale-architecture refactor converts it, preserving the draw-call shape so existing tests pass.

**4.3 Dev-mode HUD.** Toggled with `?debugPerf=1`. Shows wall-clock frame time, CPU time inside `runFrame()`, per-shell GPU time (60-frame rolling), active quality knobs, VRAM by slot state, ROD wake reason. Never bundled into production.

## 5. Adaptive quality

Each shell exposes a `qualityLevel: 0 | 1 | 2 | 3` (3 = max). A frame-time controller drives it:

```ts
type QualityController = {
  rollingFrameMsP95: number;  // 60-frame p95
  budget: number;              // 16.0 (60 fps) or 33.0 (30 fps)
  hysteresis: number;          // 1.5 ms — don't oscillate
};
```

If `p95 > budget + hysteresis` for 30 frames, drop the highest-cost shell by one level. If `p95 < budget - hysteresis` for 300 frames, raise the most-recently-dropped shell. Changes clamp to active shells only. Knobs per section 2: halving volumetric steps roughly halves shell GPU time (loss: softer transfer function, grainier filaments — acceptable). Flow grid 32³ → 16³ is 8× (convergence pattern remains legible). Label fade skips non-hero labels. Point-cloud tier drop is already a runtime control via `cloudLoader`.

The controller never auto-degrades **shell 1's Sun** — it reads as broken rather than graceful. Shell 1 is at-quality or skipped (toast fallback per [`shells/00-shell-overview.md`](../shells/00-shell-overview.md)).

## 6. Render-on-demand interaction

ROD sleeps when nothing is changing — see the wake predicate in `CLAUDE.md` (`autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade`). Tour interaction:

- **Tour mode keeps the loop awake.** While `tourState.phase !== 'idle'`, the orchestrator forces `requestRender()` every frame, so a paused dwell beat still drives label fade and orientation drift.
- **Crossfade frames are mandatory.** Both shells render every frame for the fade duration regardless of camera motion.
- **Quiescent state.** Once the tour ends or the user pauses and stops moving, ROD takes over. The cosmic-zoom architecture **does not bypass ROD**; it adds one new wake reason (`tourActive`).

The 16 ms ceiling is steady-state during active rendering, not an integrated cost over wall-clock time.

## 7. Specific concerns per shell

### 7a. Shell 7 — the dominant risk

Shell 7's volumetric raymarch cost is `pixels × steps × samples_per_step`. At 1080p, 64 steps, 1 sample/step: ~133M voxel fetches per frame. Mitigations: **half-resolution raymarch** with temporal upsample (~4× cut); **front-facing-only** marching from AABB front to back; **empty-space skipping** via a 32³ MIN/MAX summary texture (voxels below transfer-function threshold are skipped); **step count** is the user-visible knob (64 default, 32 degraded, 16 mobile — visible quality loss but basin shape readable).

If shell 7 cannot hit 8 ms after these mitigations, the renderer downgrades to an **additive-billboard fallback** — a precomputed 2D screen-space density imposter projected from the volume. Loses parallax, keeps silhouette and colour. This is the v1 mobile fallback (section 8) and an acceptable desktop fallback.

### 7b. Shell 1 — small-screen but per-pixel expensive

The Sun is at most ~200 px tall in the framing. The shader is rich (4-octave noise, granulation, limb-darkening, prominence wisps) but screen footprint caps cost. Per the existing `tools/sun-prototype/`, full quality fits in ~1.5 ms. Risk: framings that fill the screen with the Sun. The tour script forbids this (Sun ≤ 30% frame height). Free-fly applies screen-space noise-octave reduction when projected radius exceeds 40% of the viewport.

### 7c. Shell 8 — already known-good

Shell 8 is today's renderer. Cost is well-characterised: 3-4 ms with medium tier, 5-6 ms with large, on the reference machine. We treat it as the reference: any new shell exceeding shell 8's per-frame cost without justification is suspect. The only changes from this plan: wrap draws in a render bundle (section 4.2) and accept the new `shellId` parameter. Both are free at runtime.

## 8. Mobile fallback policy

Centralised from per-shell specs and [`shells/00-shell-overview.md`](../shells/00-shell-overview.md):

| Shell | Mobile WebGPU (≥ 30 fps) | Mobile non-WebGPU / sub-30 fps |
|-------|--------------------------|-------------------------------|
| 1 | Pre-baked Sun sprite; planets as flat dots | Skip |
| 2 | 25k stars, white points, no colour shader | Skip |
| 3 | Lowest-LOD impostor only | Skip |
| 4 | MW + M31 + LMC + SMC only, hard-coded | Skip |
| 5 | Existing point cloud, no group colour | Existing point cloud, small tier |
| 6 | Cluster centres only, no X-ray volume | Cluster centres only |
| 7 | Additive billboard fallback; flow grid 16³ | Skip volumetric, point cloud only |
| 8 | Existing point cloud, small tier | Existing point cloud, small tier (today's mobile experience) |
| 9 | 2k CMB texture | Static dim CMB JPEG (~1 MB) |

Boot decision tree:

1. Probe `navigator.gpu`, request adapter.
2. No WebGPU or software adapter → non-WebGPU column → tour disabled, static wide view.
3. WebGPU + viewport width < 768 → mobile WebGPU column.
4. Otherwise → desktop column (the main spec).

## 9. Memory budget — VRAM

| Shell | Data | Textures | Total |
|-------|-----:|---------:|------:|
| 1 | 1 MB | 4 MB | 5 MB |
| 2 | 4 MB | 1 MB | 5 MB |
| 3 | – | 16 MB | 16 MB |
| 4 | 1 MB | 12 MB | 13 MB |
| 5 | 60 MB | 1 MB | 61 MB |
| 6 | 100 MB | 8 MB | 108 MB |
| 7 | 36 MB | 1 MB | 37 MB |
| 8 | 100 MB | 8 MB | 108 MB |
| 9 | – | 32 MB | 32 MB |
| Depth attachments (2 active × 1080p × 4 B) | – | – | 16 MB |
| Pick texture (1080p × 4 B r32uint) | – | – | 8 MB |

**Total (all shells loaded):** ~410 MB. **Total (typical: 2 active + neighbours preloaded):** ~250 MB. Fits comfortably on 4 GB integrated GPUs.

The asset slot lifecycle (per [`shells/00-shell-overview.md`](../shells/00-shell-overview.md)) keeps non-adjacent shells `IDLE`. Pressure threshold: **300 MB total VRAM**; over that, unload the furthest-from-camera `IDLE` shell first.

## 10. GPU bandwidth — vertex/instance/texture

| Asset | Size | Transfer pattern |
|-------|------|------------------|
| Per-shell vertex buffers | 1–100 MB per shell | One-time at slot `LOADING → READY` |
| CF-4 density texture | 32 MB | One-time at shell 7 `LOADING → READY` |
| Per-frame uniforms | < 1 KB | `writeBuffer` once per frame, before bundles |
| Per-instance galaxy data | baked into vertex buffer | **No per-frame transfer** |
| MSDF label glyph instances | < 100 KB | `writeBuffer` only on label-set change (debounced) |

The "no per-frame transfer of per-instance state" rule is load-bearing — see the `WebGPU queue.writeBuffer race` entry in `CLAUDE.md`. Every shell follows it: per-instance data is baked at load time; only camera/time/fade uniforms change per frame, totaling < 1 KB.

## 11. CPU budget per frame

The 2 ms CPU bucket from section 1:

| Subsystem | Target |
|-----------|-------:|
| Tour orchestrator (tween eval, fade-alpha, current-shell determination) | 0.4 ms |
| Per-shell `setUniforms` (view, projection, fade per active shell) | 0.5 ms |
| Label `setLabels` on change frames (debounced) | 0.6 ms |
| ROD scheduler (wake predicate + RAF schedule) | 0.1 ms |
| Picking dispatch (when hovering) | 0.3 ms |
| Slack | 0.1 ms |

The biggest CPU risk is `setLabels` being called every frame instead of only on change. The MSDF label spec already debounces this; the perf benchmark (section 13) re-verifies.

## 12. Profiling tools

- **Chrome DevTools Performance tab** — CPU work and GPU-process activity. The "GPU" track shows submit → present timing. First port of call for "frame is slow, where?".
- **`chrome://gpu`** — confirms WebGPU device, adapter capabilities, software vs. hardware. Run on every test device.
- **DevTools Memory tab + `performance.measureUserAgentSpecificMemory()`** — catches regressions where a shell-unload doesn't free its `ArrayBuffer`.
- **WebGPU validation layer** — `device.pushErrorScope('validation')` around suspect submissions in dev; per-shell renderers must add it for their pass setup.
- **PerformanceObserver `longtask`** — surfaces main-thread blockages > 50 ms. Tour beats cannot afford long tasks; data decode happens off-main-thread (Web Worker) for larger payloads.
- **WebGPU `timestamp-query`** — section 4.1.

## 13. Test methodology

**13.1 Golden-frame perf benchmark per shell.** A Vitest+Playwright test loads the app with a query param forcing the camera to the shell's hero waypoint, mocks `performance.now()`, renders 120 frames with the perf HUD, and asserts: per-shell GPU time p95 ≤ shell budget + 1 ms; full-frame wall-clock p95 ≤ 18 ms.

**13.2 Crossfade benchmark.** Per adjacent shell pair: combined GPU time p95 during the fade ≤ 14 ms; frame time never exceeds 33 ms during the fade.

**13.3 Memory regression.** Run the full tour to completion; assert VRAM and JS heap return to within 10% of pre-tour baseline within 30 s.

**13.4 CI integration.** WebGPU in CI is possible but fragile — Chrome headless on Linux with `--enable-unsafe-webgpu --use-vulkan=swiftshader` works but is software-rendered, so timing is useless there. The split: **correctness tests** (no GPU validation errors) on every PR, software backend; **timing benchmarks** on a self-hosted runner (Mac mini M2) nightly and on PRs touching `src/services/engine/` or `src/services/gpu/`, results posted as PR comments; **memory regression** in CI (software backend is fine for accounting). CI uses **relative trend** as the primary regression detector — a shell suddenly taking 2× its prior GPU time fails even if absolute numbers are within budget.

## 14. References

- [`00-scale-architecture.md`](00-scale-architecture.md) — multi-shell composition; per-shell budget summary at the bottom.
- [`01-shell-transitions.md`](01-shell-transitions.md) — crossfade durations and easing.
- [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) — per-shell budget table source-of-truth and fallback policy.
- [`../shells/07-laniakea.md`](../shells/07-laniakea.md) — shell-7 specifics (the dominant perf risk).
- `CLAUDE.md` (project root) — existing renderer perf notes: 3.5M-galaxy gating, hoisted `Math.tan`, `maxCamDistForVisibility` precomputation, render-on-demand wake predicates, WebGPU `queue.writeBuffer` race rule.
- `src/services/engine/engine.ts` — per-frame loop these budgets must integrate with.
- `src/services/engine/renderScheduler.ts` — render-on-demand implementation.
- `tests/services/engine/` — existing perf-adjacent tests; new perf benchmarks slot alongside.
