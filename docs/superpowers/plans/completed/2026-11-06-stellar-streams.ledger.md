# SDD ledger — plan: docs/superpowers/plans/2026-11-06-stellar-streams.md

Spec: docs/superpowers/specs/2026-11-06-stellar-streams-design.md. Start HEAD 3ca593177.
Start questions: parallelism = this plan only; perf gate = ON (Task 13). Execution: subagent-driven (lean protocol).
Dispatch grouping: D1 = Tasks 1-4 (data pipeline), D2 = Tasks 5-8 (Layer core), D3 = Tasks 9-11 (interaction),
D4 = Task 12 (gated on the asset-demand-as-data PR) + Task 13 (controller). Mid-branch reviews: Tasks 2, 4, 7, 9.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T2 → T4, T6 | encode/decode + STELLAR_STREAMS_* constants | consistent names |
| T3 → T4 | galToEq, sagittariusParticles, StreamParticles, streamsBuild.constants.ts | consistent |
| T4 → T6 | StellarStreamMetaEntry (tools) ↔ StellarStreamMeta (runtime) | same fields; mirror by hand, OK |
| T5 ↔ T7 | default looks file | CONFLICT: T5 "becomes the initial-state source", T7 "moves into T5's initial state (or stays)" — ruled below |
| T5 ↔ T10 | `selects: ['stellarStream']` vs kind defined in T10 | RISK: if `selects` is typed against declared kinds, T5 won't compile — ruled below |
| T5 → T8 | setStellarStreamsLook / resetStellarStreamsLooks | consistent |
| T6 → T7, T10, T11 | runtime.renderer upload/clear/hasData, runtime.meta() | consistent |
| T6, T9 | both edit create.ts | sequential, fine |
| T9 → T10, T11 | pickCode('stream'), packSelection(code, idx + 1), encodePick | consistent |
| T6 → T12 | asset rows interim → near form | consistent; T12 gated |
| each task self-consistency | tests vs code vs files | T1-T13 agree with themselves |

Ruling: `streaks/data/stellarStreamsLooks.ts` stays the single defaults constant; T5's initialState imports it, T7 only deletes the `__streamLooks` read — the plan says "no second copy", one file satisfies both tasks — cost if wrong: a later rename.
Ruling: if `selects: ['stellarStream']` fails to type-check before the kind exists, Task 5 omits `selects` and its test, and Task 10 adds both — spec §5.2 still lands by branch end — cost if wrong: none beyond moving one line.

## Dispatches
D1: Tasks 1-4, opus, BASE 3ca593177, dispatched 2026-11-06 20:40
D1 done: Tasks 1-4, opus, 3ca593177→c081c244f, 100 tool uses, 234k tokens. Real build: 128,419 particles, 83 streams, 5.14 MB bin, 42 KB meta, byte-identical rebuild.
Ruling: .d.ts for @types files (convention test requires it) — accepted — none.
Ruling: Vasiliev fetcher uses fetch with a User-Agent (Zenodo 403s Node's default) instead of downloadWithResume — accepted — a 43 MB re-download on interruption.
Ruling: galstreams orientation adds the Sun's velocity (reflex correction, as the spike) — physically right — none.
Ruling: widthDeg null for 51/82 streams without a master-log width (particles still use the 0.3° default) — honest card "—" — none.
Ruling: no L<0.5 kpc skip (no current track that short) — accepted — a future tiny track gets 300 particles.
Ruling: Sagittarius lengthKpc = 2 × farthest debris reach (371 kpc) is outlier-driven and would frame the focus at ~185 kpc radius; send to the T4 review as a finding to judge — cost: card number + focus framing.
Review T2+T4 (opus, 99k): T2 Spec ✅ Quality Approved; T4 Spec ✅, 1 Important (Sgr lengthKpc outlier/seed-driven), 5 Minors.
Ruling: fold the 5 cheap Minors into fix round 1 (same implementer, same files) instead of deferring to the final wave — saves a later fix dispatch — cost: slightly larger fix diff.
Ruling: Sgr lengthKpc = 2 × p99 distance from the bound mean over the full snapshot (≈275 kpc); the card labels it "Extent" for source vasiliev2021 (carry into Task 10) — cost: a card label.
T4: fix round 1/5 dispatched (resume D1 implementer).
T4: fix round 1/5 (6 addressed, 0 open; commit a11b45dde). Lean protocol: review:yes gets one round, no re-review.
Task 1: complete (d1da54e95)
Task 2: complete (4b5bc3071, review clean)
Task 3: complete (7e6d68d39)
Task 4: complete (c081c244f..a11b45dde, 1 fix round)
D2: Tasks 5-8, opus, BASE a11b45dde, dispatched 2026-11-06 21:06
D2 done: Tasks 5-8, opus, a11b45dde→eca35c47a.
Ruling: no setStellarStreamsEnabled/LabelEnabled setters — core's setVisibility writes both switches (lightTime/satellites precedent) — none.
Ruling: selects: ['stellarStream'] landed in Task 5 (type is string) — supersedes the pre-flight fallback — none.
Ruling: STELLAR_STREAMS_LOOKS as { streak, haze } record, one copy — none.
Ruling: fade multiplied inside the renderer via an `opacity` arg — avoids per-frame look objects — none.
Ruling: no screenshots of the collapsed debug section; jsdom interaction test covers wiring — the controller eye-checks it in Task 13.
Ruling: `loading` never true on a cold load because `gates` holds the fade at 0 until commit — accept; streams are off by default, the cold-load gate simply won't wait for them — cost: a recorder at a streams pose could shoot before the bin lands; recheck in Task 12.
Note: eye check after D2 — Vasiliev Sgr renders; remnant (56% of the 60k subsample is bound) blows out to white, arms fainter than the spike. Look issue for the owner's Task 13 check (tune via debug section, or cap the bound share in the subsample — would amend the Q7 'uniform pick' ruling).
Review T7 (opus): Spec ✅, Quality changes: 1 Important (Review Focus 2 unpinned — hasDistanceBand deletable), 2 Minors.
Ruling: planner votes loading: false (spec §5.4 amended) — gates fades in on commit; the old formula only fired in the release window and forced a wake — cost if wrong: the cold-load gate won't wait for streams (they are off by default).
Task 7: minor (deferred): per-frame [streak, haze] tuple + forEach closure + narrowMat4 allocation in the draw path (pre-existing pattern).
T7: fix round 1/5 dispatched (resume D2 implementer).
T7: fix round 1/5 (2 addressed, 0 open; commit fdf9e4fe1).
Task 5: complete (9e4256848)
Task 6: complete (2dc08c6e1)
Task 7: complete (023a55526..fdf9e4fe1, 1 fix round)
Task 8: complete (eca35c47a)
D3: Tasks 9-11, opus, BASE 2194e8f6b, dispatched 2026-11-06 21:24
D3 done: Tasks 9-11, opus, 2194e8f6b→81f17e79e.
Ruling: resolvePick reads pick.localIdx directly (unpackPick already subtracts the sentinel; satellites precedent) — plan text was off by one — none.
Ruling: pick shares placeStreak() via vsPick/fsPick; spare pads become pickBase (u32, slot 29) + minHalfAcrossPx (slot 30), zero on visual draws; third uniform block for pick — accepted pending T9 review.
Ruling: caption rank via declutterPriority (Label2D has no prominencePx) — none.
Ruling: 'stellarStream' added to the zoneOfAvoidance exhibit's picking off list (test-forced) — none.
Note for Task 13: 83 captions crowd the halo; Sgr caption unreadable over the blown-out remnant; galstreams source line wraps in the card.
Review T9 (opus): Spec ✅; u32 pickBase written via Uint32Array view, layout byte-exact, visual draws unchanged, pipeline matches NEAR0 pattern. 1 Important (pickEnabled redundant), 2 Minors.
Ruling: delete pickEnabled — gatePassByFade already gates at fade 0, the rest equals enabled; satisfies spec "the pass's own gate" — none.
Ruling: fold Minor "skip pick when streak intensity is 0" into the fix round — cheap — none.
Task 9: minor (deferred): fsPick stamps the whole quad (no discard); resolved near-field streaks are grabbable ~2·rPx off the core and drift-envelope ends still take clicks — revisit only if near-field picking feels grabby.
T9: fix round 1/5 dispatched (resume D3 implementer). Note: #1076 (asset demand as data) MERGED on main — Task 12 unblocked.
T9: fix round 1/5 (2 addressed, 0 open; commit f6e2935d2).
Task 9: complete (9cd92e7ff..f6e2935d2, 1 fix round)
Task 10: complete (7e2610aa9)
Task 11: complete (81f17e79e)
Merged origin/main (with #1076 asset demand as data) — merge broke only the interim function demand, as expected.
Task 12: complete (86dbbbd0f, controller inline: 1-file edit) — meta 'always'; bin { near: { band: 'streams', edge: 'out', lead: 1.2, release: 2 } } + gates; no new test (boot assertAssetDemands + evaluateAssetDemand cover it).
Task 13 perf (milky-way-outside / -close, 60 frames, dpr2, Apple Silicon TBDR — slot sums inflated, compare the shared retire interval): streams OFF merged 25.3 / 29.6 ms with ~3 ms slots; streams ON 173.8 / 168.8 ms with ~33 ms slots (hdr·NEAR0, bloom, swap identical) → ~30 ms real GPU added; sweep exp 0.60 on hdr·NEAR0 (fill-bound share). Haze shrunk to sizeScale 0.01: hdr·NEAR0 8.1 ms, streams ≈ 2.4 ms real → the haze look is the cost. PERF GATE: STOP — owner ruling needed (haze shape).
Eye check: renders, card works (GD-1), deep link works; issues: Sgr remnant blow-out, 83 tiny crowded captions, card source line wraps.

## RESUME HERE (after compaction)
State: Tasks 1-12 complete, HEAD 86dbbbd0f (pushed to draft PR #1074). Task 13 perf gate STOPPED on haze cost; owner asked 3 questions:
- Q-haze (1): owner ruled **1c — draw the haze look into a half-resolution target and upsample it** (Milky Way upsample pattern). Target: streams ≤ ~4 ms at milky-way-outside, look as close to today's as possible.
- Q-remnant (2): owner ruled **a — cap bound share at 10% of the 60k at build** (amends Q7). → Task 15.
- Q-labels (3): owner ruled **a — caption only when apparent length ≥ threshold, always when hovered/selected**. → Task 16 (+ card source line → `<reference> track`).
- Also queued: shorten the card source line to the track reference (wraps today).
NEXT: get answers to 2 and 3 (ask once more if not given), then write a follow-up task block in the plan ("Task 14: half-res haze", plus tasks for 2/3 + card line), dispatch ONE implementer (opus; shader + render-target work is review: yes), mid-branch review, re-run perf (milky-way-outside, milky-way-close, 60 frames; baselines in ledger above), eye-check pairs to owner, then final whole-branch review → /feature-done → merge only on the owner's explicit word.
Perf recipe: harness has no layer switch — temporarily set enabled: true in src/layers/stellarStreams/state/stellarStreams/initialState.ts, run, `git checkout --` it. Dev server :5175 (bg shell b5d6olgll).

Ruling: card source line for galstreams = `<reference> track` — meta description already credits galstreams (Mateu 2023) — cheap to revert.
Tasks 14-16 written into the plan (2026-11-07). Dispatch: ONE opus implementer for 14-16, review: yes, BASE 86dbbbd0f.
Dispatched implementer for Tasks 14-16 (opus, bg, 2026-11-07); report → task-14-16-report.md. On return: review-package BASE 5e297df8f..HEAD, task reviewer, one fix round, then Task 13 re-run (perf + eye pairs).
Task 14: complete (f5b0052cc, + f58b0d35e ratchet allow-list fix) — pending review
Task 15: complete (2b79fe060; data rebuilt into main's public/data via symlink, gitignored as all bins are; 128,419 / byte-identical / Sgr lengthKpc 274.57 unchanged) — pending review
Task 16: complete (9a369b042) — pending review
Ruling (supersedes the earlier card-line ruling): the card never shows `description`, so the source line keeps the galstreams name: `galstreams · <reference>` — attribution must reach the card (BSD-3 credit) — costs one short string if it still wraps. Goes into the fix round.
Ruling: implementer's `which: 'streak' | 'haze'` draw arg accepted pending review — one uniform block per look per submit.
Ruling: ATTRIBUTIONS.md format drift — CI format passed on prior pushes; leave, recheck on next CI.
Task 13 re-run perf (2026-11-07, HEAD 9a369b042, paired same session, 60 frames): streams OFF merged 25.4 / 28.6 ms, shared retire ~3.3 / ~3.7 ms; streams ON (half-res haze) merged 53.1 / 49.9 ms, shared retire ~7.0 / ~6.4 ms → ~3.7 / ~2.7 ms real GPU added (was ~30 ms). Floor-subtracted: stellar-streams 1.6, haze-upsample 0.1. Target ≤ ~4 ms MET. Files: scratchpad perf-halfres-on.txt / -off.txt.
Review 14-16: spec ✅✅✅, quality approved, 7 Minor (task-14-16-review.md). Fix round 1 dispatched to the same implementer: all 7 + card line `galstreams · <ref>`. No re-review (lean).
Fix round 1: complete (ede215acd). Tasks 14-16 closed.
Merged origin/main (5 commits: #1077 #1078 #1079 #1062 #1081) → 8d8052e25, clean; typecheck 0, tests 1875 files green.
Eye check sent (ask phFc, 2026-11-07): M54 + oblique pairs (before = scratchpad eye-*-on.jpg at 86dbbbd0f, after = after-*.jpg at 8d8052e25) + caption threshold (80/150/250, rec 150). Pending: answers, CI on 8d8052e25 (bg), then final whole-branch review → /feature-done.
Owner ruling (ask phFc): M54 + oblique pass; caption threshold 150 px AND captions same size as other captions (35-150 px like structureMarkerStyles) → committed.
CI on 8d8052e25: green. Caption-colour subagent dispatched (sonnet, bg): meta colourT mean per stream, caption = normalised mix(BHB,GIANT).
Owner asked (2026-11-07): realistic stream colours. galstreams master_log + Vasiliev carry no [Fe/H]. Asked X8FX: metallicity source (rec curated Harris GC + S5 Li+2022 table), per-particle star-type sampling (rec yes), Sgr strip-time→[Fe/H] gradient (rec yes). Amends Q3 once answered. Caption-colour agent still running (meta colourT mean).
Owner ruled X8FX (2026-11-07): curated Harris GC + S5 table, median else; per-particle star-type sampling by [Fe/H]; Sgr strip time→[Fe/H] gradient. → Task 17 (plan). Ruling: no bin version bump — never shipped. Ruling: card shows measured [Fe/H] only.
Caption colour: complete (3f9facdd9) — streamTintRgb + stellarStreamColours.constants + WESL parity test; meta colourT (Sgr 0.690, galstreams ~0.29). Note: meta fetcher validates only root-is-array (pre-existing).
Task 17 dispatched (opus, bg, BASE 3f9facdd9... actually ef141edfb is plan commit; BASE = 3f9facdd9). On return: review-package BASE..HEAD, reviewer verifies [Fe/H] values against fetched sources in scratchpad/t17-sources, one fix round, then eye pairs (colour) + push + final whole-branch review.
Task 17: complete (33cf00463) — pending review. 34 measured rows, 49 at median −1.83.
Ruling: colourT stores Gaia BP−RP over [−0.3, 2.2] (not B−V) — reuses starTint / starTintFromBpRp so stream stars match catalogue stars, no second colour formula — reversible.
Ruling: DoD smoke line "Sgr orange near remnant to blue in old debris" → "orange core to yellow-orange arms; galstreams white-yellow, metallicity-shaded" — follows owner ruling X8FX.
Ruling: Fimbulthul (ω Cen) and Svol (M3) get their parent cluster's Harris [Fe/H] if galstreams' own data names the parent — fix round.
Colour eye check sent (ask WRaY): oblique + M54 pairs (colour-*.jpg) + caption outline (rec stronger). Ask Ffnc (caption size) still unanswered. Task 17 reviewer running.
Review 17: spec ✅ quality ✅-after-fix; 34/34 [Fe/H] rows verified vs sources; 2 Important (Cetus-Palca S5 −2.02; tint.wesl parity test), 8 Minor. Fix round 1 dispatched to same implementer (all but Minor 3). Ruling: card cites 'Harris 1996, 2010 ed.' per catalogue notice. Ruling: drop same-seed sampler test (covered by byte-identical rebuild).
Fix round 17: complete (115c7db64); 37/83 measured. Task 17 closed. Next: exaggerated caption colours (owner ask).
Owner ask: exaggerate caption colours → c8c7a68b3 (BP−RP ×6 about 1.0, saturation ×2; tint util moved to labels/utils).
Owner ask (2026-11-07): other content recedes when a stream is focused, like structures (was in spec deferral boundary as 'per-stream highlight'). Explore agent tracing recession mechanism; then propose design (ask if contract change).
eca486f79 Sgr focus frames p90 reach (frameRadiusKpc meta field; card Extent unchanged). c9f8170e1 card drops Particles/Source/Licence rows (owner). Cetus-Palca "wrong place": anchor = own arc midpoint (on track), but arc crosses brighter Cetus stream → recede fixes perception.
Asked 92rh: recede scope (rec full), core change to structureFocusSubsystem (rec yes), star counts (rec ≈ stars from cited stellar mass), caption outline (rec stronger). Explore findings on recession: emphasisOf + focusBlend/focusPickId only driven by structure focus (runFrame.ts:205-216); per-particle stream index already attr.w; Uniforms _p0 slot free. Plan: A (shader dim other streams) + B-lite (any focus row drives blend+pickId, no spatial) + C (recession on stream label entry).
Owner ruled 92rh: recede full (other streams + scene), core change YES (structureFocusSubsystem accepts any row; spatial sphere structure-only), card shows stellar mass M☉ where known, caption outline LEAVE. → Tasks 18, 19 in plan. Dispatch 18 (opus) then 19.
Task 18 dispatched (opus, bg, BASE 615620db9). Task 19 queued after it (sequential — never parallel implementers).
Task 18: complete (e0e98d4b3 core, 9d035e541 streams) — pending review. Shots recede-before/after.jpg: Cetus-Palca stands out.
Ruling: recede trigger narrowed to rows declaring `focusSphere` (structures: sphere; streams: null) instead of literally "any row" — "any" would dim the Milky Way/constellations on every Earth/planet/star/M31 focus, which the owner never asked for — widening is one line per row.
Debt noted for owner offer: rename structureFocusSubsystem (~35 files); sagittariusParticles.test.ts slow under load.
Task 18 reviewer + Task 19 implementer dispatched in parallel (reviewer read-only). Task 19 BASE 9d035e541.
Review 18: spec ✅, quality approved-after-fix; 2 Important, 4 Minor (task-18-review.md). Fix round queued until Task 19 implementer finishes (no parallel writers).
Ruling I1: fix — sphere gets its own fade (keep last sphere until it settles); a user-visible one-frame pop on structure↔stream switch is a regression.
Ruling I2: add placedStructureRow.test.ts (two radius cases).
Ruling M1: drop focusSubjectOf's lagging-row guard + comment — the row saga writes synchronously; dead defensive code.
Ruling M2: fix comments. M3/M4: no change.
Owner (2026-11-07): structureFocusSubsystem rename → separate agent + separate PR. Ruling: stacked branch off feat/stellar-streams (the generalised subsystem exists only here; main's is still structure-only and correctly named), own worktree, PR base feat/stellar-streams (retarget to main after #1074). Starts AFTER the Task 18 fix round (same file). Rename via npm run refactor rename / move-files only.
Owner: caption size check (Ffnc) PASS. Still open: WRaY colour checks (halo, Sgr core) — caption-outline part answered 'leave' in 92rh.
Owner (2026-11-07): "can still click background galaxies in stream focus" — structures make outside objects unpickable via the sphere; stream focus publishes no sphere.
Ruling (reverses the no-sphere part of Task 18 ruling 1): streams declare focusSphere = { centre: anchor, radius: frameRadiusKpc } — every galaxy is Mpc away so all dim + go unpickable like a structure focus; Sun-area stars dim too (correct: "the rest recedes"); stream particles are not sphere-dimmed (their own per-index recede). Plus: non-focused streams skip the GPU pick while a stream focus is active (focused index only). Goes into the Task 18 fix round; I1 sphere-fade fix still applies (structure↔stream switch now moves the sphere — fade it, don't snap).
Owner (2026-11-07): pick buffer has stream pick-shape bugs; "pick shapes can be simpler, not the stripes, can be static". Pick-overlay shots (scratchpad pick-oblique.jpg, pick-m54.jpg; recipe: temp-set debugSlice overlays 'pick-buffer' true, shoot, git checkout --): giant flat wedges/triangles and screen-crossing slivers — degenerate stretched quads (near-camera / behind-camera particles), plus drifting stripes.
Ruling: stream pick = static round screen-space disc per particle at its rest position (no flow offset, no stretch), radius clamp(rPx, minPickPx, maxPickPx), particles with clip w ≤ 0 skipped; only while the streak look is live; non-focused streams skipped during a stream focus. → folded into the Task 18 fix round (same shader).
Owner: NO sphere for stream focus; region must follow the stream shape ('a bunch of quads is fine'). Sphere ruling for streams WITHDRAWN. Asked uNgE: capsule chain (~12 segments/track in meta, generalise focus uniform + shared focusAlphaMultiplier; structure = 1 capsule) vs no region (everything but focused stream dims + unpickable). Task 18 fix round waits on this answer + Task 19 finishing.
Owner: pick NOT per-particle quads — use the stream's general shape. Ruling (replaces static-disc pick ruling): build simplifies each galstreams track to ~16-32 centreline points (Sgr: two derived centrelines, leading/trailing, binned along its orbital plane); meta carries them; pick pass draws a static ribbon of quads per stream along the centreline, width = stream width with a px minimum. Same centrelines feed the capsule-chain focus region if uNgE answers that way.
Task 19: complete (e708288e1) — pending review. 14/83 masses (Shipp+2018 ×8, Koposov+2010, Jethwa+2018, Jensen+2021, Caldwell+2020, Thomas&Battaglia 2022, Koposov+2023); ranges/limits skipped (C-19, Sgr, Pal 5), Tuc III skipped (table/text disagree).
Ruling: replace unused `derived` with `partial` — Shipp (DES footprint), Jensen (detected part), Koposov 2023 (visible part) measure only part of a stream; card shows "≥ <mass>" for partial rows — science strict — goes in Task 19 fix round.
Task 19 reviewer dispatched (read-only) ∥ Task 18 fix round 1 (resumed implementer: I1 sphere fade, I2, M1, M2; streams keep focusSphere null). Queued: Task 20 = centreline pick ribbons (+ stream-shaped focus region if uNgE → option 1); Task 19 fix round (partial ≥ + review findings); then rename PR (stacked).
Owner ruled uNgE: OPTION 2 — no spatial region for streams; everything but the focused stream dims + unclickable. → Task 20 (plan): centreline ribbons pick + 'recede all' focus region as row data + focused caption exempt.
Review 19: spec ✅, quality approve-after-fix; 14/14 values verified; 3 Important, 3 Minor (task-19-review.md).
Rulings for Task 19 fix round (queued after Task 18 fix round): drop Molonglo (I1; 13/83); NGC5466 partial, header reworded, C-19 stays out explicitly (I2); per-row trailing comment with arXiv id + location, no pointer into .superpowers (I3); M1-M3 as proposed. `derived` → `partial`; partial rows = AAU-ATLAS, Indus, Jhelum, Turranburra, GD-1, Jet, NGC5466, Orphan-Chenab (Indus/Turranburra "likely" → partial: "≥" stays true either way).
Fix round 18: complete (c7a66229b). Task 18 closed. WRaY dismissed (colour checks superseded; re-ask with fresh shots at Task 13). Next: Task 19 fix round (resume), then Task 20.
Fix round 19: complete (3786c6c48); 13 masses, 8 partial. Task 19 closed. Task 20 dispatched (opus, BASE 3786c6c48).
Pushed 3786c6c48 to #1074; CI watch bg.
CI on 3786c6c48: see output (green if exit 0).
PR #1074 CONFLICTING with main → pull_request CI did not run on 3786c6c48. Merge main after Task 20 commits (no parallel writers).

## RESUME HERE (2026-11-07 05:25, supersedes the block above)
Branch feat/stellar-streams, last commit 3786c6c48 (pushed to draft #1074; PR CONFLICTING with main → GH CI didn't run; Workers build passed). Tasks 1-12, 14-19 complete + reviewed + fix rounds done. Plan has Tasks 13 (controller perf/eye), 14-20.
IN FLIGHT: Task 20 implementer (opus, bg, started 04:55, BASE 3786c6c48) — centreline pick ribbons (owner: ~8-12 pts/stream, total ≪1000 quads, report count), delete particle pick, stream focus = "recede all" (option 2) as row data, focused caption exempt. Working tree is ITS mid-edit — don't touch. Report → task-20-report.md. If no commit by ~06:00, check git log/status.
ON RETURN: review-package 3786c6c48..HEAD → opus reviewer (verify pick-buffer shots pick20-*.jpg, focus20-palca.jpg; focus reader trace) → one fix round (resume same implementer) → merge origin/main (3 new: #1084 #1080 #1083; never rebase) → typecheck + npm test → push → CI watch bg.
THEN: Task 13 re-run: perf (milky-way-outside/-close, 60 frames, recipe: temp enabled:true in state initialState, `git checkout --`), eye-check pairs to owner (dash, CLICKABLE [Open live](url) links, layers=stellarStreams): halo, Sgr core, captions, focus recede, card. Brightness: realistic colours ~25-30% brighter — maybe retune default streak intensity (ask).
THEN: rename structureFocusSubsystem → separate agent, own worktree, branch off feat/stellar-streams, PR base feat/stellar-streams (owner directive), via npm run refactor rename/move-files.
THEN: final whole-branch review (most capable model) → /feature-done → merge ONLY on owner's explicit "merge this PR".
Open owner offers: none pending in dash (WRaY dismissed, re-ask colours with fresh shots at Task 13). Debt to offer: sagittariusParticles.test.ts slow under load; meta fetcher validates only root-is-array.

Task 20: implementer done (08ce44ce9 a6bb5d5bb) — 394 ribbon quads / 83 streams (median 5 pts, Sgr 13); report task-20-report.md. Concerns: (1) EVERY focus-sphere change fades through (structure↔structure now 800 ms fade, not snap) — beyond brief, reviewer to judge; (2) recede-all = sphere 1e6 Mpc out; (3) focusSphere:null removed from RecedingFocusRow/FocusSubject; (5) MW disc + GC dot stay pickable under focus (also under structure focus today) → adjacent finding to offer; (6) new meta needs R2 sync before deployed check. Review package review-3786c6c48..a6bb5d5bb.diff → opus reviewer dispatched.
Task 20 review: Spec ✅, Quality changes requested (0C/2I/8M) — task-20-review.md.
Ruling (I1): per-stream ribbon half-width = max(w/2, measured worst track→centreline gap); tolerance retuned so total stays ≲600 segments and ≤~16 pts/stream; build test pins gap ≤ half-width — keeps the clickable strip on the visible streak without the 42-pt streams of a pure w/2 tolerance — if wrong, some ribbons are fatter than the streak (click zone a bit generous).
I2 (focus fade-through on every sphere change) → owner ask in dash; fix round leaves D2 untouched. Adjacent: MW disc + GC dot pickable under focus → asked "fix in this branch?" in same set.
Fix round 1: resume implementer a362f2fccfcc82608 with I1 + all Minors.
Task 20 fix round 1: 30bd19e31 — 556 segs, median 7, max 16, all gaps ≤ ribbon half-width; M5 adds shared isSubjectPickableUnderFocus (structure captions/rings); M6 streams unclickable under other kinds' focus. Scoped re-review dispatched (sonnet).
Task 20: complete (08ce44ce9 a6bb5d5bb 30bd19e31) — re-review all addressed; N1 minor (isSubjectPickableUnderFocus untested) parked to ride the j7Jj follow-up. I2 + MW-disc pick open in dash ask j7Jj.
Merge main: c0fa1966a (3 PRs; makeSettingsFixture import conflict resolved, both kept) — typecheck 0, npm test 1892 files green; pushed; CI watch bg.
Task 13 re-run perf (post-T20, c0fa1966a, 60 fr): on 51.2/48.0 vs pre-T14 half-res on 53.1/49.9 — no regression; floor-subtracted streams 1.7+0.2 / 1.5+0.1 ms (TBDR slot sums inflated as before). Files scratchpad/perf-t13-{off,on}.txt. Eye check + intensity retune ask queued behind j7Jj (one ask set).
Task 13 eye shots ready: scratchpad/eye13/index.md (halo, sgr, captions crop, focus before/after, card crop) — controller looked: Sgr core still clips flat at the M54 pose (ask: lower default streak/haze intensity — realistic colours ~25-30% brighter); in stream focus the MW disc stays bright (part of j7Jj Q2 scope: disc both pickable AND unreceded); captions crowd in the dense centre (declutter? ask).
Ruling: card Width row hides when unknown (51/83 streams have widthDeg null → "—"), same as Metallicity/Stellar mass — consistency, cost: one conditional — rides the j7Jj follow-up dispatch with N1.
NEXT: on j7Jj answers → one follow-up dispatch (I2 per answer, MW disc per answer, N1 helper test, Width row) → then send the eye-check ask set (eye13 pairs + intensity question).
CI green on c0fa1966a (typecheck · test · format).
Owner j7Jj: (1) keep fade-through (I2 closed as-is); (2) fix MW disc + GC dot pick under focus on this branch. Dispatching Task 20b follow-up (fresh implementer — prior one >350k): .superpowers/sdd/2026-11-06-stellar-streams/task-20b-brief.md
Owner (2026-11-07): add Wikipedia blurbs + links to streams like famous stars/galaxies → plan Task 21 added (curated stream-article table, build-time cached REST summary, meta wikipediaTitle + description from extract, card WikipediaRow + DescriptionBlock).
Ruling: stream-own articles only (no progenitor-cluster links) — a cluster article's lead describes the cluster, not the stream — cost if wrong: fewer streams get a link; can add a progenitor row later.
Queue: Task 20b (in flight) → review → Task 21 dispatch → its review → eye check part 2 (focus + card) → rename PR → final review.
Task 20b: implementer done (7b196122e focus disc+Sgr A*, e8850fe5c Width row) — report task-20b-report.md. D1: disc takes strong recession × sphere dim (~0.012) — only double-dim; shots show sphere-only (0.08) still reads bright → keep, show owner in eye check part 2.
Ruling: ZoA band also unpickable while a focus fades/holds (no position to test vs sphere) — falls under owner's option 2 "everything else unclickable" + j7Jj "fix here" — cost if wrong: ZoA unclickable during focus. Resume implementer for it, then one scoped review of 20b.
Task 20b: +7ef991c0d ZoA no pick + strong recession under focus; full npm test green (1893). Scoped review dispatched (sonnet) on review-72dfe8983..7ef991c0d.diff.
Task 20b: complete (7b196122e e8850fe5c 7ef991c0d) — review ✅/Approved, 2 Minor parked (blackHolePickable duplicate anchor lookup — trivial; ZoA gate test lacks blend 1). Task 21 dispatch: BASE 7ef991c0d.
Pushed 7ef991c0d; CI result: [exited with code 0]
Task 21: implementer done (057392a90) — 6 streams / 5 articles (Sgr, GD-1, Monoceros Ring, Aquarius, Fimbulthul ×2); cache committed data/raw/streams/wikipedia_streams_cache.json (gitignore exception); old meta w/o wikipediaTitle → null.
Ruling: card description block shows only when the stream has a Wikipedia article — the galstreams boilerplate ("traced by the X track") is not a description a reader wants, and 77/83 streams would show it — cost if wrong: no prose on most cards (same as before Task 21).
Review dispatched (sonnet) on review-7ef991c0d..057392a90.diff.
Task 21 review: ✅ / changes requested (0C/1I/4M) — I = description shown w/o article (my ruling); committed cache OK with a README (precedent data/raw/constellations). Fix round 1: resumed implementer (desc gate, README, cache as objects).
Task 21: complete (5373d27d4 8384cccf5 — rewritten locally to strip Co-Authored-By/Claude-Session trailers the sonnet implementer added; unpushed at the time). Fix-round diff checked by controller (card gate + cache format), full npm test green 1894.
NOTE for merge: 3 Oct spike commits on the branch (403d0b456 289ccccb6 5b844b681, cloud session) carry Co-Authored-By trailers — at squash-merge, strip Co-authored-by lines from the squash message (GitHub copies them). Future implementer briefs: say "NO Co-Authored-By or Claude-Session trailer" explicitly.
Rename PR: worktree .claude/worktrees/refactor-receding-focus, branch refactor/receding-focus-subsystem off 8384cccf5. Ruling: new name recedingFocusSubsystem — matches its input type RecedingFocusRow; it now serves streams too — cost: a name.
CI on 8384cccf5: success | typecheck · test · format:success
Rename PR #1089 (draft, base feat/stellar-streams): 0406d345c rename (60 files) + 6107f6b60 restore ATTRIBUTIONS.md (npm run format reflowed it, splitting inline code → credits.test failure; amend+force-push denied by classifier, so follow-up commit). Debt to offer: npm run format breaks ATTRIBUTIONS.md inline code (prettier prose wrap). Leftover prose 'structure focus subsystem': backlog selection-kind-facts-followups.md:29 (ADRs historical, left).
Rename PR #1089: no CI (workflow runs on PRs to main only) — local full suite green after 6107f6b60. Final whole-branch review dispatched (opus) on review-5ed79db71..8384cccf5.diff → final-review.md. Open: dash ask 8v1H (eye check 1 + intensity); eye check part 2 queued (focus20b-after, wiki21-card, disc dim).
Final review: ready with fixes (0C/3I/9M) — final-review.md.
Ruling (I1): a focus recedes the scene only while the focused subject's own visibility entry is visible — general core rule (recede × focused kind's show fade), no stream special case; zooming out of the band / toggling streams off releases the recede — the owner's option 2 assumed the focused stream is on screen — cost if wrong: focus visuals fade when the subject leaves its band.
Ruling (I2): document deploy order (tools/streams/README + PR body): from this worktree build-data-manifest → owner's sync-r2-secure → merge. I don't run the R2 sync (owner's action).
Ruling (I3): spec gets an Amendments section now (Tasks 14–21 + focus changes); no ADR (code headers + spec suffice — leanness).
Ruling (Minors): fix PROTOTYPE header, destroy cancels meta slot, KPC_TO_MPC single constant, delete the unused galstreams boilerplate description (meta description null unless Wikipedia/curated); fixer judges race/deep-link/anchor/hash/slow-test — fix if small, else ledger as parked with reason.
Final fix dispatch (fresh opus) → scoped re-review → merge main (2 new) → push → CI.
Final fix round: 10 commits 8384cccf5..4a7d59c20 (I1 core focus × focused kind's shown value; I2 README deploy order + pr-deploy-note.md; I3 spec Amendments; minors). Full npm test green 1897. Parked: M3 pair race, M4 deep-link pulse (backlog candidate), M6 duck-typed focusSphere (spec documents), MPC_TO_KPC inverse constants (bin byte rounding).
Owner question pending (queue after 8v1H): Sgr focus camera at 156 kpc sits in the streams' out band (35→230 kpc) → streams draw at 0.32 and scene dims only 32%. Options: frame Sgr tighter / widen band / accept. Rec: frame tighter (owner already said Sgr zooms out too far).
Scoped re-review dispatched (sonnet).
Final re-review: all addressed (final-rereview.md). noStoredRegimeFlag flake seen again under load (known). Next: merge main, push, CI.
Merged main (bcb851131, #1082 #1086), npm test 1897 green, pushed; CI bg.
CI on bcb851131: success | typecheck · test · format:success
Owner (2026-11-07): Sgr focus — 'frame tighter, especially for large streams'. Task 22 dispatch: .superpowers/sdd/2026-11-06-stellar-streams/task-22-brief.md, BASE bcb851131.
Owner (2026-11-07): streams default quite dim (some); when focused they can be brighter, to stand out from the background → Task 23 (queued after Task 22; no parallel implementers).
Ruling (Task 23 shape): the focused stream's streak + haze intensity × a focus boost ramped by the (shown-scaled) focus blend; the boost lifts dim streams more — normalise each stream toward a common target brightness (per-stream factor from the build's luminosity sum / particle density, capped), one named constant for the target and one for the cap; no DebugPanel knob — cost if wrong: retune two constants after the eye check.
Task 22: 0287826d7 — cappedFrameRadiusKpc (cap from out band 0.95 @ 61.4 kpc): Sgr 55.3→11.9 kpc (shown 0.13→0.95), Orphan 49.1→14.9 (0.29→0.95), GD-1 unchanged; 22/83 still <0.95 (≈10 near-Sun in the in band, Eridanus 95 kpc). Ruling: add a floor so the settled camera clears the in band (radius ≥ (inFull + anchor)/2.887); floor wins over cap — visibility over tightness. Resumed implementer.
Task 22: +7a2ea4c28 floor (in band 0.95 @ 9.19 kpc); 9/83 miss 0.95 on far side only (Sgr 0.94 … Eridanus 0.07); NGC6397 framed ~14 kpc → tiny speck (Task 23 boost helps; show owner). Review dispatched; Task 23 dispatched in parallel (disjoint files: shader/uniforms vs tools meta). Task 23 BASE 7a2ea4c28.
Task 22: complete (0287826d7 7a2ea4c28) — review ✅/Approved; I1 stale spec numbers → folded into the Task 23 implementer's spec edit (same section, avoids a conflicting edit); M1 (test reuses 2.887 const) + M2 parked/disclosed.
Task 23: 26b39d986 — focusBoost = clamp(6 / surface brightness, 1, 5) in meta; Sgr 1, GD-1 4.07, Orphan 2.87, NGC6397 2.19; 21/83 at cap; shader select(recede, focusBoost, focused). Ruling: old meta without focusBoost must be rejected (was NaN) — resumed implementer. Then scoped review.
Owner 7rUU: ALL 9 eye checks pass (halo, Sgr core, captions, GD-1 boost, Orphan focus, Sgr frame, disc dim, card+wiki); default intensity KEEP. Task 13 eye check: complete. Remaining: Task 23 NaN fix (in flight) → scoped review → push/CI → /feature-done (plan+spec → completed, ledger archive, backlog) → PR body (deploy note) → owner R2 sync → merge ask.
Task 23: +0a8407ca5 REQUIRED_FIELDS [centrelineMpc, focusBoost] reject; full npm test green 1899. Scoped review dispatched.
Task 23: complete (26b39d986 0a8407ca5) — review ✅/Approved, 3 Minor parked (fetcher checks meta[0] only; no wiring test Sgr arm-length; boost tied to default flow).
Merged main 3a848e451 (#1085 #1087), typecheck 0; full npm test running (b2006mtlz). Next: push → CI; /feature-done = DoD audit + deletion-audit (opus) → safe-now deletions commit → moves (plan/spec → completed, ledger archive) → push. Commit trailers: NONE (owner rule overrides skill text).
Full suite after merge 3a848e451: 10 fails under heavy load (camera/frame/mission/MobileSheet, none streams), all 9 files pass rerun alone → pushed; CI is the judge.
CI on 3a848e451: success | typecheck · test · format:success. Deletion audit (opus) in flight.
Deletion audit: 49628d5a6 (−63 LOC: one meta type, wiki name→title record, no shader wrapper, 2 restating asserts); full npm test 1903 green. Needs ruling (dash ask): drop meta particleCount + reference (~−15). Spec §4.3 names deleted StellarStreamMetaEntry → fix in feature-done spec pass.
DoD audit: READY pending ruling 2Mm9 (dod-audit.md); 62b983d13 docs (plan 68/68 ticked, Tasks 20b/22/23 added, spec §4.3). Waiting on 2Mm9 → then moves + ledger archive → push → CI → PR body → owner R2 sync → merge ask.
Session resumed 2026-11-08 (credit outage): pushed 49628d5a6 + 62b983d13; re-asked 2Mm9 as dash ask h84q (rec: drop particleCount, keep reference). Next on answer: apply → moves + ledger archive → push → CI → PR body → owner R2 sync → merge ask.
Owner h84q: drop particleCount, keep reference.
273032558 drops meta particleCount (keep reference, h84q); meta rebuilt (no particleCount), stream tests green. Feature-done moves next.
Feature-done moves: plan + spec → */completed/ (move-files), spec pointers fixed, ledger archived as plans/completed/2026-11-06-stellar-streams.ledger.md.
