# Cosmic Zoom — Phasing & Build Order

**Status:** Draft (2026-05-08)
**Owner:** @rulkens
**Audience:** the engineer (or coordinator) deciding what to start tomorrow morning, plus future readers asking "why was the build sequenced this way?"
**Companion doc:** [`02-dependency-graph.md`](02-dependency-graph.md) (visual; this file is the prose).

This is the build order for the cosmic zoom — what gets built first, what depends on what, and where the natural milestones land. The plan is written in **phases** rather than a flat task list because the work has genuine fan-in/fan-out structure: some phases serialize, some parallelize, and the scariest items want to land before, not after, the cheap ones.

The phasing is also a forecasting tool. The user's first question after reading the [`SUMMARY.md`](../SUMMARY.md) ("how long is this going to take?") deserves an answer with structure — "12-16 weeks" is meaningless without knowing which weeks are critical-path and which are parallelizable.

## 1. Overview — the 5+1 phases

The plan resolves into **six** numbered phases, with Phase 0 sitting outside the cosmic-zoom build proper because its work is already in flight under separate specs.

| # | Phase | Duration | Parallelizable? | Critical path? |
|---|-------|----------|-----------------|----------------|
| 0 | Prerequisites (in-flight specs) | 3-6 weeks | partial | yes — nothing else starts |
| 1 | Skeleton (architecture + one shell) | ~2 weeks | no | yes |
| 2 | Data ingestion (9 datasets) | ~3 weeks | yes — high fan-out | partially |
| 3 | Per-shell renderers | ~4-6 weeks | yes — moderate fan-out | partially |
| 4 | Choreography + copy | ~2 weeks | no | yes |
| 5 | Performance + polish | ~2 weeks | partial | yes |
| 6 | Launch | ~1 week | no | yes |

**Calendar total:** 12-16 weeks of focused work after Phase 0 lands; with parallel agent dispatch on Phases 2 and 3, compressible to 8-10 weeks. See section 9.

The "+1" in "5+1" is Phase 0. It is not cosmic-zoom-specific work, but it is on the cosmic-zoom critical path, and skipping it ahead of time hides 3-6 weeks of dependency from the schedule.

## 2. Phase 0 — Prerequisites (in-flight specs)

Existing specs in `docs/superpowers/specs/` that must land before Phase 1 starts. The cosmic zoom is the **integration target** that gives them a shared deadline.

### 2.1 Engine restructure Spec B (5 PRs)

Spec: [`../../../specs/2026-05-08-engine-internal-restructure-design.md`](../../../specs/2026-05-08-engine-internal-restructure-design.md). Reduces `engine.ts` from 2377 → ~1500 lines by extracting five concerns (settings setter table, tween-to-galaxy helper, `runFrame.ts`, point-source slot registry, bootstrap-IIFE → ordered phases). Five PRs, smallest-blast first, each independently mergeable.

**Why first.** The cosmic zoom adds a tour-engine state machine, per-shell controllers, and ~10 new asset slots. Attaching that surface to the current 2377-line `engine.ts` would re-inflate the file past what's reviewable. Spec B carves out the attachment points (`phases/wireSlots.ts`, `runFrame.ts`, `pointSourceRegistry`) that cosmic-zoom controllers can plug into.

**Calendar:** ~2-3 weeks. The bootstrap-phases PR is already in flight on the active branch (`src/services/engine/phases/*` + tests are staged).

### 2.2 MSDF labels (13 tasks)

Spec: [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md). Build pipeline (`tools/buildFontAtlas.ts`) + runtime `LabelRenderer` + `MarkerLineRenderer` + a "you are here" controller.

**Why first.** Every shell uses MSDF labels — shell names, famous-galaxy callouts (M31, M87), orientation markers. Without MSDF, every shell needs an HTML-overlay fallback that won't depth-sort against the 3D scene; cheaper to land MSDF first than to migrate later.

**Calendar:** ~2-3 weeks. Independent of engine restructure; runs in parallel.

### 2.3 Asset-loading primitive

Spec: [`../../../specs/2026-05-07-asset-loading-design.md`](../../../specs/2026-05-07-asset-loading-design.md). Single `AssetSlot` primitive that owns fetch → decode → commit → atomic swap, with retry policy. Fixes today's tier-swap race conditions.

**Why first.** Cosmic zoom adds ~10 new datasets. Each needs the same lifecycle. Building 10 more bespoke loaders multiplies the existing pattern fragmentation tenfold; building on `createAssetSlot` makes each shell a one-line wiring change.

**Calendar:** ~2 weeks. Mostly parallelizable with engine restructure (different files), though both touch the bootstrap.

### 2.4 Milky Way impostor

Spec: `2026-05-04-milky-way-impostor.md` (referenced from the [`README.md`](../README.md) coordination table). Hero visual for Shell 3 — composite IRAS / 2MASS / textured-disk impostor with Sun marker and halo stars.

**Why first.** Shell 3 has no fallback better than "render a flat textured disk." Without the impostor, Shell 3 is the visual weak link. Land during Phase 0 so Shell 3 is finished the moment cosmic zoom wires it in.

**Calendar:** ~1-2 weeks.

### 2.5 Phase 0 total

Bounded by the longest parallel track (engine restructure or MSDF labels), not the sum.

| Spec | Weeks | Critical path? |
|------|-------|----------------|
| Engine restructure | 2-3 | yes |
| MSDF labels | 2-3 | yes (parallel with engine) |
| Asset loading | 2 | yes (parallel) |
| Milky Way impostor | 1-2 | yes (parallel) |

**Effective Phase 0 duration:** **3-6 weeks.** If Phase 0 slips, every later phase slips with it.

## 3. Phase 1 — Skeleton (~2 weeks)

The first cosmic-zoom-specific phase. Builds three things, in order.

### 3.1 Scale architecture refactor

Spec: [`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md). Today's renderer assumes Mpc throughout. The cosmic zoom spans 27 orders of magnitude (Sun radius to observable universe) — five times the float-32 budget. We add **nested camera-relative frames** with a floating origin per shell: each shell renders in its own native unit (AU / pc / kpc / Mpc / Gpc) with the camera at the local origin, and a single shell-transform matrix maps the active shell's frame into clip space.

**Why first.** Every other piece of cosmic-zoom code reads camera position. Inconsistent units → discontinuity bug at every transition. Doing it once at the start beats touching it every time we add a renderer.

**Estimated duration:** ~5-8 days.

### 3.2 Tour-engine state machine

A new `services/engine/tour/` directory: `tourEngine.ts` (orchestrator), `tourState.ts` (`type TourState = { phase: 'idle' | 'playing' | 'paused' | 'transitioning'; currentShell: ShellId; ... }`), `tourController.ts` (public handle methods: `start`, `pause`, `resume`, `skipTo`, `exit`), `script.ts` (author-defined `ShellBeat[]`, stub in Phase 1).

**No** camera animation logic here yet — that's Phase 4. Phase 1 just proves the skeleton: `tour.start()` enters a beat, fires `onShellEnter`, sits there, `tour.exit()` returns control to free-fly.

**Estimated duration:** ~3-4 days.

### 3.3 One end-to-end shell — Shell 4 Local Group (recommended)

Why Shell 4 first: it uses **mostly existing infrastructure** (galaxy point cloud, label renderer); the only new asset is the small NED Local Volume Catalog (~100 KB). Its scale (~5 Mpc native) sits inside the existing renderer's comfort zone — no new precision tricks. It has visible "wow" content (Andromeda + LMC + SMC as textured disks) without new GPU techniques. And it exercises the full cosmic-zoom skeleton end-to-end.

The shell is built as a vertical slice: data ingestion (one dataset), shell controller, renderer pipeline, tour-script entry, overlay copy. **The proof that the architecture works** before we fan out into Phase 2.

**Estimated duration:** ~5-7 days.

### 3.4 Phase 1 exit criteria

- Scale architecture refactor merged. Existing test suite green.
- Tour engine state machine merged with stub `ShellBeat` for Shell 4.
- User can click "Take the tour" → camera glides to LG barycenter → Shell 4 renders with NED LVC + labels → user clicks "exit" → returns to free-fly at the prior camera pose.
- One regression test per major new module.

## 4. Phase 2 — Data ingestion (~3 weeks, parallelizable)

Build the **9 new datasets**, each as a build script under `tools/`, mirroring the existing `tools/buildAllBins.ts` pattern. Per [`../data/00-data-sources.md`](../data/00-data-sources.md):

| # | Dataset | Source | Build script | Output | Effort |
|---|---------|--------|--------------|--------|--------|
| 1 | Solar System ephemeris | JPL DE440 | `tools/buildEphemeris.ts` | `ephemeris.bin` | 2 d |
| 2 | Gaia DR3 (≤50 pc) | ESA Gaia | `tools/buildGaiaNearby.ts` | `gaia-nearby.bin` | 3 d |
| 3 | Composite MW textures | IRAS/2MASS | `tools/buildMilkyWayTex.ts` | `mw-*.webp` | 2 d |
| 4 | NED Local Volume | NED + Karachentsev | `tools/buildLVC.ts` | `lvc.bin` | 2 d |
| 5 | Tully 2MASS Group cat | Tully 2015 | `tools/buildTullyGroups.ts` | `tully-2gc.bin` | 2 d |
| 6 | Abell + ACO clusters | NED | `tools/buildClusters.ts` | `clusters.bin` | 2 d |
| 7 | Cosmicflows-4 velocity | Tully 2023 | `tools/buildCF4.ts` | `cf4.bin` | 4 d |
| 8 | ROSAT all-sky X-ray | ROSAT archive | `tools/buildROSAT.ts` | `rosat.bin` | 3 d |
| 9 | Planck SMICA CMB | Planck Legacy | `tools/buildCMB.ts` | `cmb-512.webp` | 2 d |

**Why parallelizable.** Each script is a standalone Node module that reads `data/raw/`, runs a parser, writes a binary. Zero shared state. Dispatch as parallel agent jobs (per `subagent-driven-development`); each runs to a fresh implementer with the per-dataset spec from `data/0N-*.md`.

**R2 sync extension.** `tools/syncR2.ts`'s ALLOW filter is a hardcoded set of `.bin` paths (per [`CLAUDE.md`](../../../../CLAUDE.md) deploy section). Add the 9 new outputs. One PR, mechanical.

**Phase 2 exit criteria:**

- All 9 build scripts produce deterministic output from `data/raw/`.
- All outputs synced to R2 via `npm run sync-r2`.
- Each dataset has a `decode<Name>` function in `src/data/` with a unit test on a small fixture.
- Total bandwidth budget for the tour: ~80 MB across all shells.

## 5. Phase 3 — Per-shell renderers (~4-6 weeks)

Implement the visual technique for each of the 9 shells. Wide variance because **technique difficulty is non-uniform**: shells 5 and 8 are essentially "what skymap already does, styled differently"; shells 1, 7, and 9 require GPU techniques that have **no precedent in the codebase**.

### 5.1 Recommended order: easy first, hard last

Counter-intuitive but two reasons:

1. The easy shells (5, 8, 4) reuse existing infrastructure. Building them first surfaces gaps in the Phase 1 architecture *cheaply* — finding a scale-architecture bug while wiring the cosmic web is far less painful than finding one halfway through CMB sphere ray-marching.
2. The hard shells (1, 7, 9) are research spikes. Each needs a brainstorm + design pass + a possibly-throwaway prototype. Doing them last gives more time for the techniques to bake in the background.

Build order:

| # | Shell | Difficulty | Reuses | New code | Effort |
|---|-------|-----------|--------|----------|--------|
| 1 | Shell 5 — Local Sheet | trivial | point cloud, labels | group-colour pass | 2-3 d |
| 2 | Shell 8 — Cosmic Web | trivial | point cloud, filaments, thumbs | none | 1-2 d |
| 3 | Shell 4 — Local Group | done in Phase 1 | — | — | 0 |
| 4 | Shell 6 — Virgo Supercluster | moderate | point cloud, filaments | cluster X-ray volumetric | 5-7 d |
| 5 | Shell 2 — Stellar Neighborhood | moderate | point cloud upload | star renderer (color-mag) | 4-5 d |
| 6 | Shell 3 — Milky Way | moderate | MW impostor (Phase 0) | halo + globulars, Sun marker | 4-5 d |
| 7 | Shell 1 — Solar System | hard | none | ray-traced Sun, planet billboards, orbits | 7-10 d |
| 8 | Shell 7 — Laniakea | hard | none | DM density volume, flow vectors | 7-10 d |
| 9 | Shell 9 — Observable Universe | hard | none | inside-sphere CMB renderer | 5-7 d |

**Parallel-agent fan-out.** Shells 1-6 can be dispatched in parallel after Phase 1 lands. Shells 7-9 (research spikes) want serial human attention; parallel-agent work on those tends to produce plausible-looking-but-physically-wrong visuals that need rework.

**Phase 3 exit criteria:**

- Each shell renders standalone (test page: `/?shell=N`) without the tour engine.
- Each shell's render pass list per [`shells/00-shell-overview.md`](../shells/00-shell-overview.md) "Render passes per shell" is implemented.
- Each shell's fallback renders correctly when its primary asset fails.

## 6. Phase 4 — Choreography + copy (~2 weeks)

Now that every shell renders standalone, **wire them together as a tour**.

### 6.1 Wire the tour engine

Replace the Phase 1 stub `ShellBeat[]` in `tour/script.ts` with the full 9-entry script. Each `ShellBeat` has the author-controlled fields per [`shells/00-shell-overview.md`](../shells/00-shell-overview.md) "Per-shell author-control points":

```ts
type ShellBeat = {
  shell: ShellId;
  enter: { position: Vec3; lookAt: Vec3; fovDeg: number };
  exit: { position: Vec3; lookAt: Vec3; fovDeg: number };
  durationMs: number;       // typically 6000-11000
  internalPath: 'linear' | 'arc' | 'orbit';
  fadeBeats: { elementId: string; fadeInMs: number; startMs: number }[];
  overlay: OverlayContent;
};
```

Tour engine's `runFrame`-time hook reads the active beat, computes the camera lerp/easing, updates `state.cam` before the renderer's frame body. Per [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md).

### 6.2 Write overlay copy

Per [`../ux/02-information-content.md`](../ux/02-information-content.md). Each shell gets ≤3 sentences, fact-checked against a primary scientific source. The **only writing-heavy task** in the plan; budget for review iterations.

### 6.3 Polish transitions

- Crossfade band tuning per [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md). Tune by eye.
- Pre-fetch policy validation: every shell `READY` before camera arrives.
- Pause/resume polish: pause cleanly on user interaction (mouse drag, keyboard) and resume on next "play" without re-fetching.

**Phase 4 exit criteria:**

- A first-time user can click "Take the tour" → 60-90 seconds plays end to end → user is dropped at wide-zoom default view.
- User can pause at any shell, free-fly inside it, resume.
- All 9 overlay copy blocks signed off.

## 7. Phase 5 — Performance + polish (~2 weeks)

### 7.1 60 fps target

Profile each shell on the reference machine (an integrated-graphics laptop, per [`../rendering/07-performance.md`](../rendering/07-performance.md)). Likely heavy hitters:

- Per-frame trig in CPU-side galaxy gating (already optimized in `engine.ts` per [`CLAUDE.md`](../../../../CLAUDE.md) "Things that have bitten us before"; reapply principle to new shells).
- DM density volume render in Shell 7 (untested on integrated GPUs; budget contingency).
- CMB sphere fragment shader in Shell 9.

### 7.2 Mobile fallbacks

Per [`../ux/05-mobile.md`](../ux/05-mobile.md). Mobile probably skips Shells 1 (ray-traced Sun) and 9 (CMB sphere) on `< iPhone 12` / `< Pixel 5` class hardware, replacing with simpler fallbacks per the per-shell fallback table in [`shells/00-shell-overview.md`](../shells/00-shell-overview.md). Detection via `requestAdapter().limits` at engine init, not user-agent sniffing.

### 7.3 Accessibility audit

Per [`../ux/04-accessibility.md`](../ux/04-accessibility.md). Tour controls fully keyboard-navigable; overlay text screen-reader readable; respects `prefers-reduced-motion` (a no-camera-motion variant where shells transition by crossfade instead of camera flight).

**Phase 5 exit criteria:**

- 60 fps on the reference machine across all 9 shells.
- Tour completes without dropped frames on a 2019 MacBook Air (integrated Iris Plus).
- Mobile fallbacks active and visually acceptable on iPhone 11.
- WCAG AA pass for tour UI.

## 8. Phase 6 — Launch (~1 week)

### 8.1 Outreach

- Blog post: "Powers of Ten in your browser" — narrative + screenshots + technical aside on the scale architecture.
- Hacker News submission with a direct tour link.
- /r/Astronomy + /r/dataisbeautiful with a short clip.
- Email to data providers (Tully, Karachentsev) with thank-you and link.

### 8.2 Demo clip

~30-second screen recording of the tour, used as the social-share preview. OBS + post-edit; no audio.

### 8.3 Social posts

Twitter/Bluesky/Mastodon thread, one post per shell with screenshot + one-line fact. Pre-schedule across launch day.

**Phase 6 exit criteria:** tour live; blog post + clip published; social schedule posted.

## 9. Total calendar

**Sequential, single engineer:** Phase 0 (3-6) + 1 (2) + 2 (3) + 3 (4-6) + 4 (2) + 5 (2) + 6 (1) = **17-22 weeks**.

**With parallel agent dispatch on Phases 0, 2, 3:**

- Phase 0: parallel tracks bound to longest, ~3-4 weeks.
- Phase 2: 9 datasets dispatched as 9 parallel agent jobs, bound to slowest (CF-4, ~1 week), so ~1 week wall-clock.
- Phase 3: 6 of 9 shells parallelize cleanly; the 3 hard shells serial. ~3-4 weeks instead of 4-6.

Compressed total: **14-16 weeks from today** (2026-05-08), or **8-10 weeks of cosmic-zoom-specific work** if Phase 0 was already done.

## 10. Per-phase exit criteria (consolidated)

- **Phase 0:** engine restructure + MSDF + asset loader + MW impostor merged. 895+ tests green.
- **Phase 1:** scale architecture merged; tour engine skeleton merged; Shell 4 plays end-to-end.
- **Phase 2:** 9 datasets generated + decoded + R2-synced; per-dataset unit tests on small fixtures.
- **Phase 3:** 9 shells render standalone via `/?shell=N`; fallbacks work.
- **Phase 4:** tour plays end-to-end; pause/resume works; overlay copy signed off.
- **Phase 5:** 60 fps on reference machine; mobile fallbacks live; WCAG AA pass.
- **Phase 6:** live; blog post + clip published; social posts scheduled.

## 11. Dependency graph (text representation)

The visual graph lives in [`02-dependency-graph.md`](02-dependency-graph.md). The text version:

```
Phase 0 (parallel):
  engine-restructure ─┐
  msdf-labels         ├─→ Phase 1
  asset-loader        ┤
  mw-impostor         ┘

Phase 1 (sequential):
  scale-architecture ─→ tour-engine ─→ Shell 4 (vertical slice)

Phase 2 (parallel after Phase 1):
  ephemeris ─┐
  gaia       ├─→ Phase 3
  ...        │
  cmb        ┘

Phase 3 (easy parallel, hard serial):
  shell-5 ─┐
  shell-8  │
  shell-6  ├─→ Phase 4
  shell-2  │   then sequential: shell-1, shell-7, shell-9
  shell-3  ┘

Phase 4 (sequential):
  tour-script → overlay-copy → transition-polish → Phase 5

Phase 5 (parallel):
  perf-pass        ─┐
  mobile-fallbacks  ├─→ Phase 6
  a11y-audit       ┘

Phase 6 (sequential):
  outreach → clip → posts → live
```

## 12. Risk to schedule — top risks and contingency

Full register in [`03-risk-register.md`](03-risk-register.md). Top three with calendar impact:

1. **Phase 0 slips.** Engine restructure or MSDF takes 5-6 weeks instead of 2-3. Cosmic-zoom Phase 1 cannot start. **Contingency:** dispatch parallel agents on the smaller engine restructure PRs to compress that track. If MSDF blocks, ship Phase 1 with HTML-overlay labels as a stopgap and migrate at Phase 3.
2. **Hard-shell research spike fails.** Shell 1 (ray-traced Sun) or Shell 7 (DM volume) takes 3+ weeks instead of 1-2. **Contingency:** every hard shell has a documented fallback per [`shells/00-shell-overview.md`](../shells/00-shell-overview.md). Ship the fallback for v1, move technique to a v2 follow-up. Don't block launch on a single shell's hero visual.
3. **Mobile performance cliff.** Flagship iPhone runs at 30 fps; integrated-graphics Android at 8 fps. **Contingency:** mobile gets a "lite tour" with skipped shells (1, 7, 9) and reduced point counts. The mobile spec accepts this as an explicit fork.

Smaller risks (each with own contingency in the register): R2 sync limits, CORS regressions on new datasets, Cosmicflows-4 license terms, MSDF atlas needing a second page for additional glyphs.

## 13. Decision points along the way

The **user (= @rulkens) needs to make these calls** at named milestones, not as a continuous stream:

1. **End of Phase 0 — proceed?** If Phase 0 took 6 weeks instead of 3, is the cosmic-zoom budget still defensible?
2. **End of Phase 1 — Shell 4 is the architecture proof. Does it feel right?** First time the user sees the "cosmic zoom feeling." If transition-in-and-out doesn't feel cinematic, architecture or choreography needs rework before Phase 2.
3. **Mid-Phase 2 — dataset surprises.** Each build script may surface licensing, format, or quality issues. Per dataset: ship as planned, substitute, or drop.
4. **Mid-Phase 3 — hard-shell go/no-go.** After easy/moderate shells land, decide whether the three hard shells are tractable in the remaining schedule or whether to ship fallbacks.
5. **End of Phase 4 — copy review.** Overlay copy is the only writing in the plan. Sign off as-is, or commission a second editorial pass.
6. **End of Phase 5 — launch readiness.** Performance bar met? Mobile acceptable? A11y bar met? Ship now or hold one polish week.

## 14. Open questions

Intentionally not resolved here — need a decision before the relevant phase starts.

1. **Who writes the copy?** Phase 4. Drafting workflow needed.
2. **What's the perf budget on mobile?** Phase 5. Target frame rate per device tier. (Current proposal: 60 fps desktop, 30 fps high-end mobile, "doesn't crash" on low-end.)
3. **Is the launch tied to a specific date?** Phase 6. If yes, Phases 4 and 5 compress to fit.
4. **Does Phase 3 dispatch hard shells in parallel after all?** Risk vs. speed. Recommendation: serial. If calendar pressure mounts, parallelizing across multiple research-prototype agents is an option — accepting that 1-2 prototypes will be discarded.
5. **Phase 2 R2 sync — per dataset PR or batched at end of phase?** Batching is cheaper; per-PR is safer for catching CORS / cache issues early.
6. **Spec C (services folder structure) — land before, during, or after?** Soft dependency per the [`README.md`](../README.md) coordination table. Recommendation: let cosmic-zoom code land in the new locations directly and let Spec C absorb.

These questions are flagged so they appear in the user's morning review, not buried inside per-phase prose.
