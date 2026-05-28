# Skymap Backlog

Curated list of pickup-able work and surfaced issues. Living document — update when a plan starts, completes, or a new issue is captured. The git log is the ground truth for *what shipped*; this file is the ground truth for *what's next*.

> **Conventions**
> - Anything in `docs/superpowers/plans/completed/` or `docs/superpowers/specs/completed/` is shipped and intentionally absent from this file.
> - "Pickup-able" = the writing is done (or done enough) that an implementer could start without re-doing design.
> - "Deferred" = scoped out of an existing plan or ADR with a paper trail; needs its own plan when prioritised.
> - "Surfaced issue" = a known wart with a diagnosis but no plan or spec yet. May graduate to either.
>
> **Process**
> - When a plan ships, `/feature-done` audits and (on READY) moves the plan + matching spec to `completed/`.
> - When a spec graduates to a plan, leave the spec where it is; the plan links back to it. Both move together once the plan ships.
> - When an issue here gets a plan, delete its line; the plan link replaces it.

---

## ADRs

| ADR | Status | Executed by |
|---|---|---|
| [0001 — Fade ownership](adrs/0001-fade-ownership.md) | Accepted 2026-05-27 | [renderer-interface-extraction plan](superpowers/plans/2026-05-27-renderer-interface-extraction.md) — not started |

---

## Plans ready to pick up

Plans live in `docs/superpowers/plans/`. All have TDD task lists with checkboxes; pick one and run it via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

- **[2026-05-27 Renderer interface extraction](superpowers/plans/2026-05-27-renderer-interface-extraction.md)** — executes ADR 0001 + closes the "Option C" outlier in the renderer conventions doc. 14 tasks. `FieldEntry` 12 → 5 props; per-slot setter cascade collapses to one `applySettings`; fade GPU resources move to `FadeRegistry`.
- **[2026-05-20 Splash screen — Part 1 (core)](superpowers/plans/2026-05-20-splash-screen-01-core.md)** — loading curtain + AboutPill + `useSplash` hook + WebGPU gate. Part 2 stubbed during this plan.
- **[2026-05-20 Splash screen — Part 2 (stub tour)](superpowers/plans/2026-05-20-splash-screen-02-stub-tour.md)** — replaces Part 1's no-op Tour button with a stub camera tour. **Depends on Part 1 landing first.**

---

## Specs awaiting plans

Design is captured; an implementer or `superpowers:writing-plans` needs to turn each into a task list before pickup.

- **[2026-05-07 Tour animation](superpowers/specs/2026-05-07-tour-animation-design.md)** — brainstorm-in-progress; needs to be finished before it can be planned. May be subsumed by the splash-screen Part 2 stub-tour.

---

## Deferred from existing plans / ADRs

Scoped out of a parent plan or ADR with explicit rationale; needs its own ADR or plan when picked up.

From [renderer-interface-extraction plan §Out of scope](superpowers/plans/2026-05-27-renderer-interface-extraction.md):
- **Source-registry factory** — auto-generate fetcher + slot + UI rows from a single `SOURCE_REGISTRY` entry.
- **Render-graph / frame-graph restructuring** of `runFrame.ts` and the pass DAG.
- **Settings schema with auto-generated UI** for `VolumeFieldRow`'s seven sliders.
- **Half-res offscreen ↔ post-process resize coupling** type-enforcement.
- **Selection / picking GPU resource migration** to its subsystem (parallel to fade per ADR 0001; needs its own ADR — pick texture is per-camera, not per-handle).

From [ADR 0001 §"explicitly not deciding"](adrs/0001-fade-ownership.md):
- **Label fade opt-in / opt-out decision** — per-character MSDF opacity may not fit the per-handle bind-group pattern; needs a follow-up ADR if labels opt out.

---

## Surfaced issues

Diagnosed but unplanned. Captured here so they don't get lost; promote to a spec or plan when prioritised. Most have richer notes in agent memory (`~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/`).

- **Thumbnail quality** — five ranked fix options (mask, sky-sub, per-galaxy size, DESI source, brightness norm). See memory `project_thumbnail_quality`. Partially addressed for famous galaxies via [procedural-disk fade-out](superpowers/specs/completed/2026-05-28-procedural-disk-fade-out-design.md) (2026-05-28); SDSS/DSS branches still open.
- **Famous-galaxy high-res LOD** — curated WebPs are 128 px; soft when zoomed close. Needs LOD pyramid vs single-high-res decision; atlas-vs-bespoke-texture trade-off. Identified in the 2026-05-28 famous-galaxy thumbnail brainstorm (Issue #2 of three).
- **Famous-galaxy in-app calibration** — curated WebPs aren't always centred/scaled/rotated correctly on the disk. Proposed UX: draw a line from disk centre to edge in-app to pin scale + rotation. Storage in `famous_calibration.json` sidecar JSON. Warrants an ADR for the storage choice. Identified in the 2026-05-28 famous-galaxy thumbnail brainstorm (Issue #3 of three).
- **GLADE shell artifact at ~400 Mpc** — hard depth boundary created by Task 7 abs-mag filter; 3 fix options deferred 2026-05-04. See memory `project_glade_shell_artifact`.
- **Per-frame thumbnail-priority loop CPU cost** — RoD + stride decimation (PR #79) addressed panning case; BVH or compute-shader pass needed if scaling to larger tiers. See memory `project_thumbnail_loop_perf`.
- **Cosmic zoom plan** — 60-doc "Powers of Ten" walkthrough plan drafted in worktree `cosmic-zoom-plan` (2026-05-08), awaiting user review. See memory `project_cosmic_zoom_plan`.

---

## External / blocked

Tracked here so the dependency is visible; no skymap-side work until unblocked.

- **Rhizome SDSS calibration** — in flight in the PolyPhy fork (branch `rhizome-spec`, PR #114). Skymap is read-only on this surface until calibration lands. See memory `project_rhizome_handoff_in_flight`.
- **HyperLEDA cache backfill** — R2 cache is intentionally partial (52k / ~1.5M PGCs). Do not auto-trigger a re-fetch; promote only if a concrete need surfaces. See memory `project_hyperleda_partial_cache`.

---

## Outreach (long-tail)

The outreach push has its own per-task plan tree under [`superpowers/plans/2026-05-05-outreach-and-promotion/`](superpowers/plans/2026-05-05-outreach-and-promotion/). The actionable open items live in [`TODO.md`](superpowers/plans/2026-05-05-outreach-and-promotion/TODO.md). Top-level outstanding:

- JOSS submission (Task 3) — `paper/paper.md` + `paper/paper.bib`.
- RNAAS submission (Task 6) — short note + PDF.
- Remaining Reddit posts (Task 4) — r/Astronomy (video), r/WebGPU (video), reschedule r/MapPorn.
- 5 academic outreach emails (Task 5) — SDSS, GLADE, AAS WWT, CDS, LVK EM.

---

## Reference docs (not pickup-able)

Living context docs; cite them from plans rather than turning them into work.

- [`audits/`](audits/) — backward-looking codebase critiques (code reviews, renderer audits)
- [`research/`](research/) — forward-looking surveys (cluster/void viz, cosmic web)
- [`superpowers/conventions/`](superpowers/conventions/) — renderer + plan conventions
