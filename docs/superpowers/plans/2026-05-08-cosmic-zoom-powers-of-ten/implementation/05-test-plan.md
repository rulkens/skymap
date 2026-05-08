# Test Plan — Cosmic Zoom

**Status:** Implementation companion to the [product vision](../vision/00-product-vision.md), the [performance spec](../rendering/07-performance.md), and the [accessibility spec](../ux/04-accessibility.md). Single source of truth for *how we know the cosmic zoom is shippable*.
**Owns:** Vitest suites, Playwright e2e specs, perf-bench harness, manual QA checklists, usability protocol.

## 1. Goal

Two intertwined goals:

1. **Verify the cosmic zoom hits the [five product-vision success criteria](../vision/00-product-vision.md#how-well-know-its-done):** completable on a fresh browser by a first-time visitor; impressive enough to share; scientifically accurate; degrades gracefully on a low-end Android; passes a Lighthouse a11y audit.
2. **Catch regressions in existing skymap functionality.** The cosmic-zoom work touches `engine.ts`, `pointRenderer.ts`, the asset-slot lifecycle, the camera, and the input pipeline. Today's 590+ Vitest suite is the floor — every PR keeps it green, *and* every new subsystem ships with its own coverage.

A regression in free-fly that ships the cosmic zoom is a failed release. So is a cosmic zoom that crashes on Intel Iris Xe. Both bars must clear simultaneously.

The didactic principle the rest of skymap follows applies to tests too: a test that describes *why* a behaviour matters is worth two that just assert it. New `*.test.ts` files open with a 4–8 line module header explaining the invariant, what would break if it slipped, and the production bug history that motivated it (where applicable).

## 2. Test pyramid

We stack the pyramid heavily toward unit tests. Vitest is fast (~6 s for the existing 590 cases), and most cosmic-zoom complexity that *can* be made pure (scale conversions, fade-alpha math, waypoint interpolation, copy-length validation) lives in pure helpers by deliberate design — see the "minimize stateful surface" memory. Stateful and GPU-touching code is concentrated in a thin shell.

| Tier | Approx. count | Tools | Runtime | Run on |
| --- | ---: | --- | --- | --- |
| Unit (pure helpers) | ~250 new | Vitest | < 5 s | Every PR, in CI |
| Integration (renderer construction, state machines, asset wiring) | ~60 new | Vitest + WebGPU test-device wrapper | ~15 s | Every PR, in CI |
| Visual regression (per-shell golden screenshot) | 9 + 8 transitions | Playwright + image diff | ~90 s | PRs touching `services/gpu/` or `shells/*` |
| Perf benchmark (per-shell GPU time, full-tour wall-clock) | 9 + 1 | Playwright + WebGPU `timestamp-query` | ~3 min | Self-hosted runner, nightly + on engine PRs |
| E2E (tour walkthrough, keyboard nav, axe-core) | ~6 specs | Playwright | ~2 min | Every PR |
| Manual QA (release checklist) | ~30 items | Human | ~45 min | Pre-release |
| Usability (recorded sessions) | 5 sessions | Human | ~2 weeks elapsed | Pre-launch only |

The pyramid is wider at the bottom on purpose: every flaky integration test buys ten unit tests of debugging time.

## 3. Per-subsystem test plan

### 3.1 Scale architecture (`src/services/engine/scale/`)

The [scale architecture spec](../rendering/00-scale-architecture.md) defines a logarithmic camera-distance unit, a per-shell local-origin offset (floating-origin trick), and helpers between f64 cosmological coordinates and per-frame f32 GPU uniforms. Every conversion is pure and tested.

- `tests/services/engine/scale/scaleConversions.test.ts` — `metersToShellUnits`, `shellUnitsToMeters`, `lerpLogScale`. Property-based (fast-check) round-trip identity for `[1e-3, 1e30]` meters within 1e-6 relative tolerance. A 0.1%-per-shell drift would smear the camera by ~1% across the nine-shell tour.
- `tests/services/engine/scale/floatingOrigin.test.ts` — extreme positions (Laniakea centre ~80 Mpc, observable-universe edge ~14 Gpc) round-trip through f64→f32→f64 within the [depth-precision spec](../rendering/06-depth-precision.md) tolerance (1 part in 1e6 of the shell's reference distance).
- `tests/services/engine/scale/fadeAlphaAt.test.ts` — `fadeAlphaAt(cameraDistance, shellId)` returns 0 outside the shell's contribution range, 1 in the steady band, and a smooth `smoothstep` through the boundary. 50 sample points per shell, no NaN, no jumps > 0.05 between adjacent samples.

### 3.2 Tour engine state machine (`src/services/tour/tourEngine.ts`)

Four phases — `idle`, `playing`, `paused`, `transitioning` — driven by user input, waypoint arrival, and crossfade timers. The state machine is pure; side effects (render request, fade, copy update) happen in a thin reducer-style outer layer.

- `tests/services/tour/tourEngine.test.ts` — every `(state, event) → state` transition tabulated. Illegal transitions (e.g. `pause` from `idle`) are no-ops, *not* throws — the machine must survive double-clicks, race-y keys, and ESC mid-crossfade.
- `tests/services/tour/tourEngine.exit.test.ts` — exiting mid-tour leaves the camera at its current position (handed back to `OrbitControls`) and frees asset slots not visible in the resting view. Anti-regression target: the "pause-then-exit drops you in deep space with no landmarks" bug from the engine rewrite.
- `tests/services/tour/tourEngine.pauseResume.test.ts` — pause during a crossfade resumes from the same crossfade. Pause during a dwell pauses the dwell countdown but allows free-fly. Resume after free-fly puts the camera on the *next* waypoint with a re-easing tween (per [Principle 4](../vision/00-product-vision.md)), not snapping back.

### 3.3 Per-shell renderers (`src/services/gpu/shells/*Renderer.ts`)

Each shell ships a renderer with a uniform interface (`construct`, `setUniforms`, `render`, `dispose`). Construction tests use the existing test-WebGPU-device wrapper from `tests/services/gpu/testDevice.ts` — same pattern `pointRenderer.test.ts` already uses.

Per shell (one file each, e.g. `tests/services/gpu/shells/solarSystemRenderer.test.ts`):

1. **Construction without throwing.** `pushErrorScope('validation')` wraps `construct()`; any captured error fails the test with the message.
2. **Render-without-throwing on a 256×256 offscreen target.** No pixel assertions here — that's §4's job.
3. **Dispose releases GPU resources.** A `WeakRef` test verifies buffers and textures are GC-eligible after `dispose()`. Catches the leak class where a shell unload doesn't free its 100 MB vertex buffer.
4. **Idempotent `setUniforms`.** Identical inputs produce identical buffer contents. Catches uniform builders that accidentally accumulate.
5. **Quality-knob surface.** `qualityLevel: 0..3` is reflected in exposed config (e.g. `currentStepCount` for shell 7).

### 3.4 Data ingestion (`tools/build*.ts`)

Each new dataset (Solar System ephemeris, Gaia stars, Tully groups, cluster catalogs, CF-4, ROSAT, Planck CMB) gets a parser writing the format from [data/10-binary-formats.md](../data/10-binary-formats.md). Tested with **golden-file diffs**: a small fixture under `tests/fixtures/cosmic-zoom/<dataset>/raw/`, and the expected `.bin` byte-for-byte under `tests/fixtures/cosmic-zoom/<dataset>/expected/`.

One file per dataset: `tests/tools/buildEphemeris.test.ts`, `buildGaia.test.ts`, `buildTully.test.ts`, `buildCF4.test.ts`, `buildROSAT.test.ts`, `buildPlanckCMB.test.ts`. When a parser legitimately changes, regenerate the fixture, hand-verify a sample record, commit both. A bin diff that isn't explained by an intentional change is a regression.

### 3.5 Overlay component (`src/components/TourOverlay.tsx`)

- **Copy length fits the time budget.** [Principle 2](../vision/00-product-vision.md) requires every overlay to be readable in < 8 s. We approximate as `wordCount / 3.5` (3.5 words/s for inattentive readers viewing a moving scene). `tests/components/TourOverlay.copyBudget.test.ts` iterates every entry in [`vision/01-narrative-script.md`](../vision/01-narrative-script.md) and asserts the budget. New copy that overflows fails on the PR that adds it.
- **`aria-live` region announces correctly.** A React Testing Library test mounts the overlay, swaps the shell prop, and asserts the live region's `textContent` updates and that `aria-atomic="true"` is set. Catches refactors that silently kill screen-reader support.

## 4. Visual regression strategy

Unit tests prove the camera is at the right coordinate; only a screenshot proves the rendered pixels match the design.

**Approach:** per-shell golden screenshot at a fixed waypoint, fixed RNG seed, fixed time, captured by Playwright against real Chromium with `--enable-unsafe-webgpu` on a self-hosted Mac mini (M2). Goldens live under `tests/fixtures/cosmic-zoom/golden/<shell-id>.png` at 1280×720. Diff tolerance is 0.5% pixels different (`pixelmatch` with `threshold: 0.1`).

We rejected SwiftShader-on-Linux: its WebGPU output diverges enough from real GPUs that any meaningful tolerance either passes everything or nothing. The Mac mini doubles as the [perf-benchmark runner](../rendering/07-performance.md#13-test-methodology) — one machine, two responsibilities.

**What we golden:** one per shell at its hero waypoint (9), one per crossfade midpoint with fade alpha at exactly 0.5 (8), one of each accessibility-critical UI element rendered against three synthesized backdrops (CMB-yellow, CMB-red, deep black) — see [accessibility spec §5](../ux/04-accessibility.md#5-color-contrast).

**What we don't golden:** free-fly compositions, loading or error states, mobile viewports (covered by manual QA).

When a golden legitimately changes, the PR description must include a side-by-side image so reviewers can sanity-check.

## 5. Performance benchmarks

[Performance spec §13](../rendering/07-performance.md#13-test-methodology) defines three families:

1. **Per-shell GPU time at the hero waypoint.** 120-frame capture, p95 GPU time per shell ≤ shell budget + 1 ms. In `tests/perf/shells/<shell-id>.bench.ts`.
2. **Total tour duration.** End-to-end 90 s tour at 1× speed measured CTA-click to "Replay tour" appearing. Asserted ≥ 88 s and ≤ 95 s — the camera is on a fixed timeline; deviation means a tween is wrong.
3. **Memory peak.** `performance.measureUserAgentSpecificMemory()` sampled every 5 s, peak ≤ 450 MB JS heap. Combined with `device.lost`-watching to confirm we never hit a VRAM limit.

**CI integration:** self-hosted Mac mini runner, nightly schedule plus on PRs touching `services/engine/`, `services/gpu/`, or `services/tour/`. Results post as a PR comment with a delta-vs-main column. Shared GitHub Actions runners are explicitly **not** used for perf — they're virtualized, noisy, and produce false-positives that erode trust. A nightly trend chart catches slow regressions that any single PR's noise would mask.

## 6. Browser matrix

| Browser | Min version | WebGPU? | Tour quality | Notes |
| --- | --- | --- | --- | --- |
| Chrome / Edge (Chromium) | 113+ | Yes | Full | Reference target |
| Safari | 16.4+ | Yes (default in 17+) | Full on 17+, fall back on 16.x | Test on real macOS Safari, not Playwright WebKit |
| Firefox | Nightly 121+ | Behind `dom.webgpu.enabled` | Full when enabled | Informally tested; not a release blocker |
| iOS Safari | 17+ | Yes | Mobile column (per [perf §8](../rendering/07-performance.md#8-mobile-fallback-policy)) | iPhone 14 Pro target |
| Android Chrome | 121+ | Yes (Android 12+) | Mobile column | Pixel 7 target |
| Android Chrome (no WebGPU) | older | No | Existing point cloud, tour disabled | Verified on Moto G Power 2024 |

The dev-mode HUD captures browser/version + adapter info with every CI perf run, so when a regression hits "only on Iris Xe driver 31.0.101.5XXX" we have the data to triage.

## 7. Manual QA checklist

Run before each release. ~30 items, ~45 minutes.

**Tour entry & exit (5):** CTA appears after first paint; copy reads correctly before and after a completed tour; clicking starts the camera tween within 200 ms; ESC mid-tour returns to free-fly at the current position; completing the tour returns the camera to the wide default view, not the last shell.

**Per-shell (9):** Solar System (Sun yellow ~30% frame, planets on orbit traces); Stellar Neighborhood (Sirius blue-white, Betelgeuse red); Milky Way (disk impostor + Sun marker); Local Group (M31 + MW as discs, dwarfs as fuzzies); Local Sheet (group colouring + planar arrangement); Virgo Supercluster (Virgo + Coma centres with X-ray glow); Laniakea (density volume continuous, flow vectors toward Great Attractor); Cosmic Web (existing point cloud + filaments); Observable Universe (CMB sphere mottled, fills screen).

**Transitions (4):** crossfades visually continuous; camera speed feels log-scale constant; copy fade-out completes before next fade-in; shell-7 transitions never drop below 30 fps.

**Pause / free-fly (4):** Space pauses with copy held; drag during pause orbits; Space resumes with re-easing within 1 s; pause-then-free-fly in Laniakea for 30 s does not corrupt subsequent timing.

**Accessibility (4):** Tab focuses CTA first with visible ring; keyboard-only walkthrough completes; NVDA + Firefox announces shell prose without per-frame re-announcement; `prefers-reduced-motion: reduce` produces snap-cuts.

**Performance & robustness (4):** Dev HUD (`?debugPerf=1`) shows per-shell GPU within budget; 10 back-to-back tours do not raise peak VRAM by > 10%; disconnecting network mid-tour does not crash; tab-switch pauses RAF and resumes without time-skip.

## 8. Usability testing protocol

Before launch, run **5 recorded sessions** with first-time visitors:

- 2 from the "curious first-time" bucket (no astronomy background).
- 2 from the "science-literate enthusiast" bucket (amateur astronomers, ex-physics types).
- 1 from the "educator" bucket (teacher, planetarium operator, museum staffer).

Sessions are 30 minutes, conducted over Zoom with screen-share, recorded with consent. Script:

1. **Pre-task interview (5 min).** Astronomy background? Expectations of "3D map of the universe"? Eames film? Scale of the Universe? NASA Eyes?
2. **Cold open (1 min).** Share URL, do not explain. Time-to-tour-start is the key metric — > 30 s is a CTA-discoverability failure.
3. **Tour run (2 min).** Watch silently. Note where they squint, look away, or ask "wait, what is that?"
4. **Recall (5 min).** Without the screen: walk me through what you saw. Success bar: ≥ 5 of 9 shells in roughly the right order with the right scale intuition.
5. **Engagement rating (2 min).** 1–7 scale: how interested were you? Would you watch a longer version? Would you share?
6. **Free-fly attempt (10 min).** "Now find Andromeda yourself." This is the transition from passive viewer to active explorer — the entire reason the tour exists.
7. **Debrief (5 min).** What confused you, what would you change, anything broken.

Sessions logged in `docs/usability/2026-MM-DD-<participant-id>.md` (gitignored — PII). Findings rolled up into `docs/usability/findings.md` (committed, anonymised). A finding emerging in 3+ sessions is a launch-blocker; 1–2 sessions is a roadmap item.

## 9. Pre-launch sign-off checklist

Every box ticked before the release PR merges to main:

- [ ] All Vitest suites green (existing 590+ plus the new ~310).
- [ ] All Playwright e2e specs green on Chromium 113+.
- [ ] Visual regression goldens reviewed and approved.
- [ ] Per-shell perf benchmarks within budget on the reference Mac mini.
- [ ] Total-tour benchmark within ±5% of the 90 s target.
- [ ] Memory: peak ≤ 450 MB JS heap; post-tour returns to baseline ±10% within 30 s.
- [ ] Manual QA checklist completed by a human other than the implementer.
- [ ] 5 usability sessions completed; no 3+-repeat finding outstanding.
- [ ] Lighthouse a11y score ≥ 95 on tour landing and each mid-shell snapshot.
- [ ] `axe-core` integration test: zero violations on every shell.
- [ ] Overlay copy reviewed for scientific accuracy by a domain-literate reviewer (per [vision criterion 3](../vision/00-product-vision.md#how-well-know-its-done)).
- [ ] Mobile fallback verified on a $300 Android (per [vision criterion 4](../vision/00-product-vision.md#how-well-know-its-done)).
- [ ] Accessibility statement at `/accessibility` published and accurate.
- [ ] Browser matrix table (§6) executed; new browser-specific issues filed and triaged.
- [ ] R2 sync (`npm run sync-r2`) completed for all new `.bin` artifacts; sizes recorded in release notes.

The release-PR merge commit message contains this checklist with every box ticked and the QA reviewer's name on the manual rows.

## 10. Test data fixtures

All fixtures under `tests/fixtures/cosmic-zoom/`, organised per dataset. Each is small (< 100 KB raw, < 50 KB binary) and committed to git.

```
tests/fixtures/cosmic-zoom/
  ephemeris/   raw/jpl-horizons-sample.txt        expected/ephemeris.bin
  gaia/        raw/gaia-dr3-sample.csv            expected/gaia.bin
  tully/       raw/tully-groups-sample.dat        expected/tully.bin
  cf4/         raw/cf4-sample-32cube.bin          expected/cf4.bin
  rosat/       raw/rosat-sample.dat               expected/rosat.bin
  planck/      raw/planck-cmb-sample-low-res.fits expected/planck-cmb.bin
  golden/      shell-{1..9}-<name>.png + crossfade-{1..8}.png
  copy-script/ narrative-script-snapshot.json     (drift detector for the copy-budget test)
```

Each subdirectory has a `VERSION` file with a SHA of the upstream catalog or generation script. When the source bumps, fixture bumps, expected bumps, the bin-diff test re-asserts. Fixtures are deliberately the *minimum* slice needed to exercise edge cases — the full upstream catalogs stay gitignored under `data/raw/`. A new contributor can run the full suite without ever fetching a 100 MB upstream file.

## 11. Files touched

New test files (~310 cases):

- `tests/services/engine/scale/{scaleConversions,floatingOrigin,fadeAlphaAt}.test.ts`
- `tests/services/tour/{tourEngine,tourEngine.exit,tourEngine.pauseResume,motionPreference,tourSpeed}.test.ts`
- `tests/services/tour/accessibility/contrast.test.ts`
- `tests/services/gpu/shells/{solarSystem,stellarNeighborhood,milkyWay,localGroup,localSheet,virgoSupercluster,laniakea,cosmicWeb,observableUniverse}Renderer.test.ts`
- `tests/components/{TourOverlay.copyBudget,TourOverlay.aria,TourCTA,TourControls}.test.ts`
- `tests/tools/{buildEphemeris,buildGaia,buildTully,buildCF4,buildROSAT,buildPlanckCMB}.test.ts`
- `tests/perf/shells/<shell-id>.bench.ts` (one per shell)
- `tests/perf/{totalTour,memoryRegression}.bench.ts`
- `tests/e2e/{tour-walkthrough,tour-accessibility,tour-keyboard-only,tour-reduced-motion,visual-regression}.spec.ts`
- `tests/fixtures/cosmic-zoom/**` per §10.

Modified:

- `tests/services/gpu/testDevice.ts` — adds `withTimestampQueries()` for perf benchmarks.
- `tests/setup.ts` — registers the cosmic-zoom fixture roots and the new Playwright project.
- `vitest.config.ts` — new test roots, bumped per-test timeout for perf-bench specs.
- `playwright.config.ts` — self-hosted-runner project for visual-regression and perf benchmarks.
- `.github/workflows/perf-bench.yml` — new workflow targeting the self-hosted Mac mini.

## 12. References

- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — success criteria this plan verifies.
- [`../rendering/07-performance.md`](../rendering/07-performance.md) — perf budgets the §5 benchmarks enforce.
- [`../ux/04-accessibility.md`](../ux/04-accessibility.md) — a11y requirements §3.5 and the e2e specs cover.
- [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) — per-shell scope each renderer test targets.
- [`../data/10-binary-formats.md`](../data/10-binary-formats.md) — byte layouts the §3.4 golden-file diffs validate.
- `CLAUDE.md` (project root) — Vitest conventions, mirror-src/ tree, the existing 590-test suite this plan expands.
- `tests/services/gpu/testDevice.ts` — existing WebGPU test wrapper this plan extends.
