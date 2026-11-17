# SDD ledger — plan: docs/superpowers/plans/2026-11-03-tour-subtitle-captions.md

No spec: the plan carries the brainstorm rulings + refactor-ground verdict in its header; rulings below are against the plan.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
| --- | --- | --- |
| T1 → T2 | lineSchedule, SUBTITLE_MIN_READ_SEC → fit test | consistent |
| T2 → T3 | BeatCaption {title, lines} → TourCaption | T2's commit leaves TourCaption reading body/position → typecheck red between T2 and T3 commits |
| T3 → T4 | overlay line animations → recorder check | consistent |
| T1 self | tests vs contract | consistent |
| T2 self | fit test needs dwell durationSec; compileClip throws on unresolved id cues | stub resolver named in task; consistent |
| T3 self | first line delay 0 vs "delay = startSec" test | consistent (startSec[0] = 0) |
| T5 self | docs only | consistent |

Ruling: T2+T3 ride one dispatch and T2's commit may not typecheck on its own — CI gates the branch head and the PR squash-merges — cost if wrong: one non-compiling commit on the branch for bisect.
Ruling: dispatch grouping D1 = T1–T3 (one Sonnet implementer); T4 recorder check and T5 docs run inline by the controller (< 50 lines, a command) — cost if wrong: controller context grows a little.

Parallelism: this plan alone (user). Perf gate: skipped (user) — DOM/CSS overlay only.
D1 (T1–T3): dispatched, sonnet, BASE faed7b7cc
D1 (T1–T3): DONE, sonnet, faed7b7cc..1a3ea5793 (T1 213e73049, T2 0740c124c, T3 1a3ea5793); deviations: series label dropped + selectTourLabel deleted, fades are % of slice (plan said ~300 ms), webShowcase beat 2 re-broken, bold markers dropped
Eye check 1728+400: desktop OK; 400 overflow (lines grid max-content) + fades %-based → fix round 1/1 sent to D1 implementer, FIX_BASE 1a3ea5793
Fix round 1: 2 addressed (phone overflow, fixed 300 ms fades); commit 0a22c2339
Fix round 2 sent: stale mobile .caption left:24px + dead old-design CSS (FIX_BASE 0a22c2339)
Fix round 2: addressed; commit be9f3cfb3
Task 4: FAILED assumption — cinema take of beat 2 (rec-beat2.mp4, 10 fps): line 1 shows from ~11 s to the end of the take at 20 s; line 2 (scheduled ~46% into the dwell) never appears. CSS line delays do not elapse under recorder virtual time. STOP per plan; ruling B is the user call.
Task 5: complete (docs, inline) — 0f7e697ba
Ruling (user): line timing → B (rAF dwell-elapsed hook + pure subtitleOpacity) — CSS delays do not elapse under recorder virtual time — cost if wrong: one re-render per frame of a tiny component during dwells. Plan amended: Task 3b.
D2 (T3b): dispatched (resume D1 implementer), BASE 0f7e697ba
D2 (T3b): DONE, df05f85a2
Ruling: dwell clock ticks on a 50 ms setInterval over performance.now(), not rAF — probe showed rAF stops ~2 s into a dwell under recorder virtual time; timers follow the budget — cost if wrong: 20 re-renders/s of the caption during dwells.
Task 3b: complete (df05f85a2 + controller fix 4ade909da, inline <50 lines)
Task 4: complete — re-recorded beat 2 (rec-timer.mp4): line 1 fades in ~11 s, line 2 at ~15.5 s, holds to the end
Final review (opus): 1 Important (label contrast 3.5:1) + 7 Minor (tokens, pause tick loss, key={line}, stale comments, docs easing/word budget, webShowcase em-dash). Fix wave dispatched (resume implementer), FIX_BASE 4ade909da
Fix wave: complete 0b6d24756 (all 8 addressed; no re-review per lean protocol; controller skimmed hook/caption diff). Eye checks re-shot on 0b6d24756 at 1728 + 400.
Numbering removed per owner eye check: f2cf94afb (inline). Landing: pushed, PR #1010 opened; CI watching.
CI green on #1010 (typecheck · test · format 8m43s, Workers build pass).

Eye checks (ask YiWj): phone width PASS, longest beat PASS, pause holds PASS.
