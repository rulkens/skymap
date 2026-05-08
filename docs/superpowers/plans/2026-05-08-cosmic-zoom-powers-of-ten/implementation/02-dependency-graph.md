# Dependency Graph

This document maps the dependency web of the cosmic zoom — what blocks what, where the bottlenecks are, and what can be parallelised. It complements [`00-phasing.md`](00-phasing.md) (which orders work into phases) and [`04-milestones.md`](04-milestones.md) (which puts dates on those phases). If `00-phasing.md` is the *plan*, this is the *graph behind the plan*.

## 1. Goal

Make explicit which units of work block which other units, so we can:

- identify the **critical path** — the longest blocking chain, which sets minimum ship time;
- spot **bottlenecks** — nodes with high downstream fan-out, where investment pays back most;
- find **parallel opportunities** — independent nodes that can be staffed concurrently;
- understand **slip risk** — when a node is at risk, what cascades?

Without this graph, the natural tendency is to schedule the heaviest blocking node *last*, which is exactly wrong.

## 2. Top-down dependency diagram

Top-to-bottom is upstream → downstream. `A → B` means "A must land before B can start." `[brackets]` are external in-flight specs; `(parens)` are cosmic-zoom-internal nodes.

```
                          EXTERNAL IN-FLIGHT WORK
                          ───────────────────────

   [Engine restructure         [MSDF labels]      [Asset-loading       [Milky Way      [CF-4 DM
    Spec B, 5 PRs]                   │             primitive]           impostor]       volume]
            │                        │                  │                   │              │
            ▼                        │                  │                   │              │
   ┌──────────────────┐              │                  │                   │              │
   │ Spec C (services │              │                  │                   │              │
   │ layout) — soft   │              │                  │                   │              │
   └────────┬─────────┘              │                  │                   │              │
            │                        │                  │                   │              │
            ▼                        │                  │                   │              │
                       COSMIC-ZOOM FOUNDATIONS
                       ───────────────────────
            │                        │                  │                   │              │
   (Scale architecture) ◀────────────┘                  │                   │              │
            │                                           │                   │              │
            ├────────────────► (Floating origin) ───┐   │                   │              │
            │                                       │   │                   │              │
            ├────────────────► (Depth precision) ───┤   │                   │              │
            │                                       │   │                   │              │
            ├────────────► (Shell transition layer) │   │                   │              │
            │                                       │   │                   │              │
            │                  (Tour/script engine) │   │                   │              │
            │                          │            │   │                   │              │
            │                          ▼            ▼   ▼                   │              │
            │                  (Overlay component / copy renderer) ◀────────┤              │
            │                                                               │              │
                       SHELLS (parallel after foundations)                 │              │
                       ───────────────────────────────────                  │              │
            │                                                               │              │
            ├──► (Shell 1: Solar System renderer) ───┐                      │              │
            ├──► (Shell 2: Stars renderer) ──────────┤                      │              │
            ├──► (Shell 3: MW renderer) ◀────────────┼──────────────────────┘              │
            ├──► (Shell 4: Local Group renderer) ────┤                                     │
            ├──► (Shell 5: Local Sheet renderer) ────┤                                     │
            ├──► (Shell 6: Virgo renderer) ──────────┤                                     │
            ├──► (Shell 7: Laniakea renderer) ◀──────┼─────────────────────────────────────┘
            ├──► (Shell 8: Cosmic web renderer) ─────┤
            └──► (Shell 9: Observable Universe) ─────┤
                                                     ▼
                       INTEGRATION
                       ───────────
                                            (Tour wiring per shell)
                                                     │
                                                     ▼
                                            (End-to-end tour playback)
                                                     │
                                                     ▼
                       POLISH
                       ──────
                                          (Perf budget, a11y, mobile,
                                           onboarding, copy review)
                                                     │
                                                     ▼
                                                  SHIPPED
```

Read this as a constraint network, not a Gantt chart. Vertical position is downstream order, not calendar time.

## 3. External dependencies (in-flight specs)

These live outside this plan, in `docs/superpowers/specs/` or their own plans. See [`../README.md`](../README.md) and [`../decisions/0009-existing-plan-coordination.md`](../decisions/0009-existing-plan-coordination.md).

| External work | Blocks | Why | Status |
|---------------|--------|-----|--------|
| Engine restructure (Spec B, 5 PRs) | Scale architecture | Scale-arch attaches new phases to a clean engine; doing it on the old engine is ~2x rework | In progress (3 of 5 PRs landed) |
| Spec C (services folder layout) | Cosmic-zoom code layout | Soft — can land cosmic-zoom code in new folders directly | Not started |
| MSDF labels | Text overlay, all 9 shells' labels | Every shell renders labels via MSDF | Designed |
| Asset-loading primitive | Per-shell data slots (lifecycle in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)) | Cosmic zoom adds ~10 slots to the generic `EMPTY → LOADING → READY → ACTIVE → IDLE → UNLOADED` facility | Designed |
| Milky Way impostor | Shell 3 hero visual | Shell 3 *is* the impostor; fallback is a flat textured disk | Pending plan |
| CF-4 dark-matter volume | Shell 7 hero visual | Shell 7 *is* the DM volume; fallback is galaxy points only | Pending plan |

The first four are *hard* dependencies — cosmic zoom cannot ship without them. The last two are *soft* — shells 3 and 7 have documented fallbacks (see the per-shell fallback table in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)), so the tour can ship with degraded versions of those shells.

## 4. Internal dependencies (within the cosmic-zoom plan)

Entirely under our control. Each linked doc has full detail.

| Node | Depends on | Notes |
|------|------------|-------|
| Scale architecture ([`../rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md)) | Engine restructure | Single most blocking internal node. Per-shell scale system, unit types, conversion pipeline. |
| Floating origin ([`../rendering/05-floating-origin.md`](../rendering/05-floating-origin.md)) | Scale architecture | Focused add-on once scale arch lands. |
| Depth precision ([`../rendering/06-depth-precision.md`](../rendering/06-depth-precision.md)) | Scale architecture | Reverse-Z buffer + per-shell near/far. |
| Shell transition layer ([`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md)) | Scale architecture | Crossfade band, alpha-blend two shells in flight. |
| Tour engine ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md)) | Scale architecture | Script-driven camera + beat sequencer. |
| Overlay component ([`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md)) | Tour engine + MSDF labels | Listens for `BeatChange` events. |
| Per-shell renderer (×9) | Scale architecture | Each codes against scale-arch primitives. |
| Per-shell data ingest (×9) | None | Build scripts in `tools/` are independent. |
| Tour wiring (per shell) | Renderer + data + tour engine | Glue: beat reads data slot, hands off to renderer. |

The crucial loose coupling: a per-shell renderer can be **coded against a fixture** (a hand-written `PointCloud`) before real per-shell data lands. That decouples renderer track from data-ingest track, unlocking the parallelism in section 5.

## 5. Parallel opportunities

Once foundations land, the work fans out wide. These sets are mutually independent — staff concurrently with zero coordination cost.

| Parallel set | Members | Concurrency | Notes |
|--------------|---------|-------------|-------|
| Data ingestion | All 9 `tools/buildXyz.ts` scripts | Up to 9 agents | Self-contained parser + binary writer each. Shared touchpoint is `src/data/scaleSpecificFormat.ts` — write first, fan out. |
| Shell renderers | All 9 per-shell renderers | Up to 9 agents *after* scale arch lands | Each lives under `services/gpu/shells/`. Shared concerns live in scale-arch primitives. |
| Copy / overlay text | Per-shell prose in [`../ux/02-information-content.md`](../ux/02-information-content.md) | Parallel to renderer work | Pure prose. Lands before polish phase. |
| Decision documents | Remaining ADRs in [`../decisions/`](../decisions/) | Parallel to everything | One-shot choices, no cross-ADR ordering. |

The shape is a diamond: narrow at top (foundations), wide in middle (shells × renderers × data), narrow at bottom (integration + polish).

## 6. Critical path

The longest unbroken chain of blocking dependencies, end-to-end:

```
Engine restructure (Spec B, 5 PRs)         ~3 weeks remaining
        │
        ▼
Scale architecture                         ~2 weeks
        │
        ▼
Tour engine                                ~1 week
        │
        ▼
Tour wiring (one shell, end-to-end)        ~3 days
        │
        ▼
Polish (perf, a11y, mobile, copy review)   ~2 weeks
                                          ──────────
                                  TOTAL    ~8–10 weeks
```

Note that **per-shell renderers are not on the critical path** — they fan out in parallel after scale architecture lands and finish well before integration. Same for data ingest. The critical path runs through the *foundations and integration glue*, not the visible per-shell work.

This is counterintuitive and is the most important insight here. A naive plan would schedule shells sequentially and report a 6-month timeline; the graph shows two months **if** foundations land on time.

## 7. Bottlenecks

A bottleneck has high *out-degree* — many downstream nodes depend on it.

| Node | Out-degree | Why it bottlenecks |
|------|------------|---------------------|
| Scale architecture | ~13 (all 9 shell renderers + floating origin + depth + transitions + tour engine) | The single most blocking node in the entire graph |
| Engine restructure | ~14 (everything downstream of scale-arch + scale-arch itself) | Doubly load-bearing because it sits one hop further upstream |
| Tour engine | ~10 (all per-shell tour wiring + overlay component) | Once it lands, the integration phase fans out fast |
| MSDF labels | 9 (every shell uses labels) | Pure visual blocker — fallback is "render without labels," which is shippable but ugly |

Takeaway: **invest disproportionately in the foundations**. Every day saved on scale architecture saves a day at every downstream shell; every day saved on engine restructure compounds further.

## 8. Risk if a bottleneck slips

| Bottleneck | If it slips by 1 week | Mitigation |
|------------|------------------------|------------|
| Engine restructure | Critical path slips by 1 week. No work-around — all shell work is gated on scale-arch which is gated on engine. | Land cosmic-zoom code against the *current* engine and refactor as part of restructure. Costs ~2x the rework but unblocks the parallel tracks. |
| Scale architecture | Critical path slips by 1 week. All 9 shell renderers wait. | Have one or two shells pioneer scale-arch concretely (treat it as a vertical slice) before generalising. |
| Tour engine | Integration slips. Renderers are done but cannot be wired into the tour. | Build a hand-written, hardcoded "tour playback" script as a bridge; replace with the proper engine when it lands. |
| MSDF labels | All shells render without text overlays — looks unfinished but is technically complete. | Fallback to a DOM overlay (absolutely-positioned divs) for tour-only labels. Ugly but shippable. |
| Milky Way impostor | Shell 3 falls back to flat disk. Tour still completes. | Documented fallback. Acceptable for v0.1 ship. |
| CF-4 volume | Shell 7 falls back to galaxy points only. Tour still completes. | Documented fallback. Acceptable for v0.1 ship. |

So the *hard* slip risks are engine restructure and scale architecture; everything else has a degraded-but-shippable fallback. This is by design — the per-shell fallback table in [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) ensures no single shell can block ship.

## 9. Cross-cutting concerns

Spanning the whole graph, no discrete completion event:

- **Performance budget** ([`../rendering/07-performance.md`](../rendering/07-performance.md)). Per-shell 16ms target at 1080p mid-range GPU. Measure as you build — a regression caught in shell 5's own PR is cheap; the same regression found during integration is archaeology.
- **Accessibility** ([`../ux/04-accessibility.md`](../ux/04-accessibility.md)). Reduced-motion, captions, keyboard-only nav. Every renderer touches this.
- **Mobile** ([`../ux/05-mobile.md`](../ux/05-mobile.md)). Tour must complete on a 2021 iPhone over 4G. Constrains data sizes and shader complexity (shell 7 volumetric is the hot spot).
- **Type aliases not interfaces** ([`../../../../CLAUDE.md`](../../../../CLAUDE.md)). Every new file uses `export type X = { ... }`.
- **Didactic comments.** Same source. Multi-paragraph module headers explaining *why* and *what the alternative was*.

These appear in the polish phase as a final audit, not as their first treatment — they must be held continuously throughout.

## 10. Coordination meetings / sync points

Most work is async. Three points need a real sync — a human or lead agent reviewing across tracks:

1. **End of foundations** — scale arch, floating origin, depth, transitions, tour engine all landed. Sync: do the primitives compose? Build one shell end-to-end as a verification slice (recommended: shell 4, Local Group — median complexity, reuses existing renderers).
2. **End of shell-build phase** — all 9 renderers + 9 data slots landed. Sync: stitch into tour engine, run end-to-end. Expect surprises at the seams.
3. **End of polish** — ship-readiness review. Walk the tour on desktop Chrome, iPhone Safari, mid-range Android. The user (rulkens@) is the gate.

Outside these three, agents work independently and report into [`04-milestones.md`](04-milestones.md).

## 11. Open questions

- **Serialise scale-arch with engine restructure, or land cosmic-zoom code on the current engine and migrate?** Default is "wait for restructure" but parallelising (at 2x rework) may be worth it if restructure slips past two weeks.
- **Is shell 7 worth blocking on the CF-4 volume render?** The fallback is fine but unspectacular. Ship without it or wait?
- **Tour authoring tool — dependency or polish?** `tour/script.ts` is hand-edited TS today. A visual editor would be nice but isn't on the critical path.
- **Pre-fetch policy depth.** The shell-overview document specifies "fetch all 9 shells when user clicks Take the Tour" — ~370 MB for first-time visitors. The first visit matters most for impressions. Revisit during polish.
