# Milestones — Cosmic Zoom

**Status:** draft · **Date:** 2026-05-08 · **Hypothetical kickoff:** Friday 2026-05-15

This document is the project's *demo schedule*. Where [`00-phasing.md`](./00-phasing.md) explains *which work happens in which phase*, this file pins each phase to a calendar date and a concrete artifact you could screen-share to a non-engineer and have them go "ah, I see it." Milestones are deliberately written as **states the system can be in**, not as **tasks the team has done**. "Engine restructure landed" is a state; "wrote 12 PRs touching engine.ts" is not.

The reason for this distinction is hard-won and worth stating up front: progress on a long graphics project is famously easy to fake to yourself. You can spend three weeks on a beautiful coordinate-system refactor and have absolutely nothing on screen. Demoable milestones force the question *"if I screen-shared right now, what would I show?"* every two-ish weeks. If the answer is "a passing test suite," the milestone is the wrong shape.

## How to read the table

Each milestone has five fields:

- **Demoable artifact** — what's on screen / what you can click.
- **Exit criteria** — concrete, checkable; the milestone is "done" iff all of these are true.
- **Risk gate** — the most likely reason this milestone slips, and what it would cost.
- **Success metric** — a number or observable that proves the milestone shipped well, not just that it shipped.
- **Decision point** — the call you (the project owner) must explicitly make at this milestone before the next phase starts.

## Milestone table

| ID | Week | Date (Fri) | Demoable artifact |
|---|---|---|---|
| **M0** | 0 | 2026-05-15 | Plan reviewed and signed off; calendar locked |
| **M1** | 3 | 2026-06-05 | MSDF labels visible in dev; engine restructure (Spec B) merged to `main` |
| **M2** | 5 | 2026-06-19 | Scale architecture refactor merged; **Local Group shell renders end-to-end** with placeholder data |
| **M3** | 8 | 2026-07-10 | All 9 ingestion scripts produce committed `.bin` artifacts in `public/data/` |
| **M4** | 10 | 2026-07-24 | All 9 shells render standalone via dev URL params (`?shell=virgo`, etc.) |
| **M5** | 12 | 2026-08-07 | Tour engine plays through 5 contiguous shells (Local Group → Laniakea) without breaking |
| **M6** | 14 | 2026-08-21 | All 9 shells integrated; full 60–90 s tour plays end-to-end |
| **M7** | 15 | 2026-08-28 | Polish, perf, accessibility audit complete; meets 60 fps target on reference laptop |
| **M8** | 16 | 2026-09-04 | Public soft launch on `skymap.rulkens.com`; tour is the default landing experience |

The 16-week calendar matches the upper bound from the SUMMARY (12–16 weeks). It does **not** assume Claude-parallelized data ingestion compression to 8–10 weeks. That compression is treated as a *buffer* (see "Buffer" below), not a plan.

## M0 — Plan reviewed and approved (week 0, 2026-05-15)

**Demoable artifact.** A green checkmark, basically. The full plan tree under [`docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/`](../) is read end-to-end; the `decisions/` directory has no open ADRs marked "draft"; the kickoff calendar is in your calendar app.

**Exit criteria.**
- All `decisions/0001`–`0010` ADRs marked "accepted" (no "draft", no "proposed").
- [`SUMMARY.md`](../SUMMARY.md), [`vision/00-product-vision.md`](../vision/00-product-vision.md), [`vision/01-narrative-script.md`](../vision/01-narrative-script.md) read in full and not contested.
- `00-phasing.md`, `01-task-breakdown.md`, `02-dependencies.md`, `03-risk-register.md`, this file, and `05-budget.md` all in `accepted` state.
- Phase 0 prerequisite plans (MSDF labels, asset-loader, engine restructure) cross-linked and confirmed in flight.

**Risk gate.** A late-breaking objection to the 9-shell scope (e.g., "let's cut to 6 shells"). Cost: ~1 week to re-plan the shell boundaries and update [`shells/00-shell-overview.md`](../shells/00-shell-overview.md).

**Success metric.** Zero open clarification questions in the plan after sign-off review. If you finish reading and want to ask "but what about X?", the plan failed and X needs a decision doc.

**Decision point.** *Are we building this?* If yes, M1 starts Monday 2026-05-18. If no, archive the plan and we're done.

## M1 — Engine restructure + MSDF labels landed (week 3, 2026-06-05)

**Demoable artifact.** Open the dev server, see the existing 2.5M-galaxy view, but now with a label overlay (e.g., "Andromeda" floating near M31). Open `engine.ts` in the editor and observe it's been split into `bootstrap`, `phases/`, and a clean `EngineHandle` boundary — the file no longer has the 800-line god-class shape.

**Exit criteria.**
- MSDF label plan merged to `main`; visible on dev with at least 5 named galaxies.
- Engine restructure (Spec B) merged to `main`; `engine.ts` invokes `bootstrap()` and is < 200 lines.
- All ~590 existing tests still pass (`npm test`).
- No visual regression vs. the pre-restructure renderer (eyeball A/B, screenshots committed in PR description).

**Risk gate.** MSDF label rendering hits a WGSL gotcha (per the [WESL skill](../../../../../CLAUDE.md) and prior shader bites). Cost: 3–7 days for visual debugging. Engine restructure could also surface a circular dependency; cost: 2–3 days.

**Success metric.** Dev startup time ≤ pre-restructure value. Test suite runtime within 10% of pre-restructure. Frame rate on reference laptop unchanged.

**Decision point.** *Is the engine boundary clean enough to attach 9 new render pipelines to?* If yes, proceed to M2. If no, schedule a one-week boundary-tightening sprint before starting Phase 1 (scale architecture).

## M2 — Scale architecture + first shell end-to-end (week 5, 2026-06-19)

**Demoable artifact.** Open dev with `?shell=local-group`. Camera lands inside the Local Group; M31, M33, the Magellanic Clouds, and ~50 dwarf companions render with correct relative scale. You can orbit. Zoom in to 100 kly and back out to 5 Mly without depth fighting on either end.

**Exit criteria.**
- Floating-origin frame implemented per [`rendering/05-floating-origin.md`](../rendering/05-floating-origin.md).
- Nested camera-relative scale frames per [`rendering/00-scale-architecture.md`](../rendering/00-scale-architecture.md).
- Local Group shell renderer dispatches and draws via the new architecture.
- One end-to-end integration test: load `local-group` shell → camera at center → 60 fps for 10 s.
- No depth-buffer striping at any zoom level within the shell's range (manual visual check, screenshot committed).

**Risk gate.** Floating-origin precision tuning takes longer than expected; specifically, transitioning across two scale frames (e.g., 1 kly to 10 kly boundary) may cause a visible jolt that takes iteration to smooth. Cost: 3–5 days.

**Success metric.** Local Group shell holds 60 fps on reference laptop with all label overlays active. Zero `NaN` or `Infinity` warnings in console across full zoom range.

**Decision point.** *Does the scale architecture generalize to the 8 other shells without per-shell hacks?* If yes, parallel data ingestion can start. If no, refactor before M3.

## M3 — All 9 ingestion pipelines running (week 8, 2026-07-10)

**Demoable artifact.** Run `npm run build-shells` (new). The console streams 9 ingestion jobs to completion. `public/data/` ends up with `solar-system.bin`, `gaia-near.bin`, `milky-way-impostor.bin`, `local-group.bin`, `local-volume.bin`, `tully-groups.bin`, `clusters.bin`, `cf4-velocity.bin`, `rosat-xray.bin`, `cmb.bin`, etc. Each `.bin` decodes cleanly via a one-shot CLI inspector (`npm run inspect <bin>`).

**Exit criteria.**
- All 9 ingestion scripts (per [`data/01`](../data/01-solar-system-ephemeris.md) – [`data/09`](../data/09-planck-cmb.md)) produce deterministic output.
- Binary formats per [`data/10-binary-formats.md`](../data/10-binary-formats.md) finalized; format versions stamped.
- `npm run sync-r2` ALLOW filter updated to include all new files.
- Each ingestion script has at least one parser-level test asserting record count and a representative record's field values.

**Risk gate.** Source data turns out to be partial, paywalled, or in an undocumented column layout (very real risk for Tully groups and CF-4). Cost: per dataset, 1–5 days depending on whether a fallback dataset exists.

**Success metric.** Total `.bin` size ≤ 500 MB (committed budget; see [`data/10-binary-formats.md`](../data/10-binary-formats.md)). All 9 scripts finish in < 30 minutes wall-clock on reference dev machine.

**Decision point.** *Are any datasets unviable and need a fallback (synthetic / sparser source)?* This is the last cheap moment to swap a dataset before its renderer is built.

## M4 — All 9 shells render standalone (week 10, 2026-07-24)

**Demoable artifact.** Nine URLs, one per shell. Each loads, renders its hero visual, holds 60 fps for 10 s, supports orbit/zoom within the shell's natural range. No tour engine yet — just the renderers, isolated, parametrized by URL.

**Exit criteria.**
- Each of the 9 shell renderers from [`shells/01`](../shells/01-solar-system.md) – [`shells/09`](../shells/09-observable-universe.md) implemented.
- Each shell has a screenshot in its plan doc that matches what the shell *actually* shows.
- Per-shell render budget (CPU + GPU) measured and recorded.
- Mobile fallback decision per shell is committed (per [`ux/05-mobile.md`](../ux/05-mobile.md)).

**Risk gate.** Two specific shells have research-spike risk: ray-traced Sun (Shell 1) and CMB sphere (Shell 9). Each could blow its budget by a week.

**Success metric.** Reference laptop holds 60 fps on every shell. Mobile reference device (mid-range Android) holds 30 fps on at least 6 of 9 shells (the rest may degrade to a sentinel fallback).

**Decision point.** *Which shells, if any, get a mobile-only simplified renderer?* Locked in here, not later.

## M5 — Tour engine integrates 5 shells (week 12, 2026-08-07)

**Demoable artifact.** Click "Start tour." Camera flies from Local Group → Local Sheet → Virgo Supercluster → Laniakea → Cosmic Web with overlay text fading in and out per shell. Tour is pausable (any shell), resumable, dismissible.

**Exit criteria.**
- Camera choreography engine per [`rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) implemented.
- Information overlay system per [`ux/01-information-overlays.md`](../ux/01-information-overlays.md) implemented.
- Pause / resume / dismiss controls per [`ux/03-controls.md`](../ux/03-controls.md) wired up.
- Shell transitions per [`rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) — no visible tearing, depth fighting, or asset pop-in across any of the 4 transitions.

**Risk gate.** Shell transition between Laniakea (volumetric) and Cosmic Web (filaments) may have visual discontinuity that needs an interstitial dissolve. Cost: 2–4 days.

**Success metric.** End-to-end 5-shell play-through holds ≥ 45 fps on reference laptop, no frame > 50 ms.

**Decision point.** *Is the camera choreography hitting the cinematic feel?* This is a taste call; if "no," budget a week of polish before adding the remaining 4 shells in M6.

## M6 — Full 9-shell tour integrated (week 14, 2026-08-21)

**Demoable artifact.** Full 60–90 s "Powers of Ten" cinematic from Sun to observable universe, plays start-to-finish on the dev server.

**Exit criteria.**
- All 9 shells in the choreography sequence.
- Tour completion drops user back at the wide-zoom default.
- "Pause and free-fly" works at every shell.
- Tour state machine has no known broken transitions in QA log.

**Risk gate.** Solar System (Shell 1) and Observable Universe (Shell 9) are the bookends and the highest-risk integrations. Either could push by a week.

**Success metric.** A naive viewer (someone who hasn't seen the dev iterations) can watch the tour end-to-end without confusion or jankiness complaint.

**Decision point.** *Is this ready to put in front of testers?* If no, push M7 by one week.

## M7 — Polish, perf, accessibility (week 15, 2026-08-28)

**Demoable artifact.** Tour plays at 60 fps on reference laptop; degrades gracefully to 30 fps on reference mobile; passes a manual accessibility checklist (keyboard nav, prefers-reduced-motion, contrast).

**Exit criteria.**
- Per-shell perf budget per [`rendering/07-performance.md`](../rendering/07-performance.md) met or documented as accepted exception.
- Accessibility audit per [`ux/04-accessibility.md`](../ux/04-accessibility.md) complete.
- Onboarding flow per [`ux/06-onboarding.md`](../ux/06-onboarding.md) implemented.
- Tour copy proofread by a non-engineer.

**Risk gate.** A perf regression discovered late may force a renderer rewrite for one shell. Cost: up to a week.

**Success metric.** No P0 / P1 bugs in QA tracker. Lighthouse perf score ≥ 80 on landing page.

**Decision point.** *Are we shipping?* If yes, M8 is one week away. If no, defer launch to a named future date.

## M8 — Public soft launch (week 16, 2026-09-04)

**Demoable artifact.** `https://skymap.rulkens.com` loads; tour is the default landing experience; "Skip to free-fly" button is present and prominent.

**Exit criteria.**
- `npm run sync-r2` complete; all `.bin` files live in R2.
- `main` branch deployed via Cloudflare GitHub integration.
- Analytics (privacy-respecting; e.g., Plausible) wired to track tour completion rate.
- Launch announcement post drafted (not necessarily published).

**Risk gate.** A first-day load-test failure (CDN cache miss storm, R2 cold path). Cost: same-day mitigation.

**Success metric.** First 100 unique visitors complete the tour at ≥ 50% rate.

**Decision point.** *Public-public announce, or stay soft?* Soft launch period of ~1 week before any public posting is recommended.

## Calendar (explicit)

| Week | Mon | Fri | Milestone |
|---|---|---|---|
| 0 | 2026-05-18 | 2026-05-22 | (M0 sign-off Friday 2026-05-15) |
| 1 | 2026-05-25 | 2026-05-29 | M1 work |
| 2 | 2026-06-01 | 2026-06-05 | **M1** due 2026-06-05 |
| 3 | 2026-06-08 | 2026-06-12 | M2 work (scale architecture) |
| 4 | 2026-06-15 | 2026-06-19 | **M2** due 2026-06-19 |
| 5 | 2026-06-22 | 2026-06-26 | M3 work (data ingestion, parallel) |
| 6 | 2026-06-29 | 2026-07-03 | M3 work |
| 7 | 2026-07-06 | 2026-07-10 | **M3** due 2026-07-10 |
| 8 | 2026-07-13 | 2026-07-17 | M4 work (per-shell renderers) |
| 9 | 2026-07-20 | 2026-07-24 | **M4** due 2026-07-24 |
| 10 | 2026-07-27 | 2026-07-31 | M5 work (tour engine + 5 shells) |
| 11 | 2026-08-03 | 2026-08-07 | **M5** due 2026-08-07 |
| 12 | 2026-08-10 | 2026-08-14 | M6 work (remaining 4 shells) |
| 13 | 2026-08-17 | 2026-08-21 | **M6** due 2026-08-21 |
| 14 | 2026-08-24 | 2026-08-28 | **M7** due 2026-08-28 |
| 15 | 2026-08-31 | 2026-09-04 | **M8** due 2026-09-04 |

## Buffer

The calendar above totals 16 weeks against a SUMMARY-stated 12–16 week range, so the entire upper-bound assumption *is* the buffer — there is no second-order slack baked in beyond it. If the SUMMARY's optimistic 8–10 week compression actually holds (parallel Claude-driven data ingestion, parallel shell renderers), milestones M3–M6 each shift left by ~1 week, opening 4 weeks of contingency between M6 and M8. That contingency, if won, should be spent on **polish** (M7), not on **scope** (more shells).

Hard rule: do not slip M0 or M1. M0 slipping means you don't have a plan, and slipping the plan is free; just re-date everything. M1 slipping means a Phase 0 prerequisite isn't actually done, and the rest of the schedule was a lie. Catch this early.

Soft rule: M3 and M4 may each absorb up to a one-week slip without cascading, because subsequent phases assume their outputs but not their *date*.

Hard rule: M8's date is a commitment to nobody but yourself. Move it freely if M7 reveals a launch-blocker. A delayed launch is forgivable; a janky launch is not.

## Communication cadence

Solo project, but discipline still helps:

- **Friday evening:** update the milestone tracker. One paragraph per milestone *currently in flight*: what shipped, what slipped, what's the next concrete demoable. Commit it to `docs/superpowers/plans/2026-05-08-cosmic-zoom-powers-of-ten/implementation/status/<date>.md` (new directory; not pre-created here).
- **Per milestone:** record a 30-second screen capture of the demoable artifact. Drop it in `docs/.../implementation/demos/`. This is your only proof, after the fact, that the milestone was real.
- **At each decision point:** write the decision and its rationale into the relevant ADR in [`decisions/`](../decisions/). Don't let decisions live only in your head; six weeks later you will have forgotten the reasoning and second-guess yourself.
- **Optional, recommended:** a 2-line public update (Mastodon, blog) per milestone landed. The external accountability tightens slippage; it also turns the launch into a story rather than a surprise.
