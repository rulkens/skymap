# Task 7 review — Stage 3: spend the savings (volume scale 3 → 2)

## Spec compliance checklist

- [x] Scale flipped 3→2 and measured, per brief. Confirmed via report; `renderTargets.ts` line 201 shows `scale: 3` at HEAD (matches "revert" claim — no residual code diff).
- [x] Right poses: `volume-inside`, `local-group`, `full-survey` — exactly the brief's three, each with its own paired table. `void-inside` and large-tier are present but explicitly labeled "extra context — not part of the binding decision rule" / "directional context," not used to decide.
- [x] Right metric: `totals.merged.median` (TOTAL MERGED), matching the brief's decision-rule wording and the perf skill's convention used in prior task reviews on this plan.
- [x] Right baseline: paired same-session scale-3 measurement, which *is* the post-Task-6 configuration (Task 6 only touched `fragment.wesl`, not `renderTargets.ts` — confirmed via `task-6-brief.md`'s Files list and no `scale` edits in `task-6-report.md`'s main body). Not diffed against the Task-1 baseline. Correct per brief line 15-16.
- [x] Right threshold: < 1 ms regression at every pose, applied literally: volume-inside +1.343 ms (fail), local-group −0.131 ms (pass), full-survey −1.475 ms (pass). One failure → revert, matching "iff ... at every pose."
- [x] Revert justified by the report's own tables — verified independently (see Arithmetic below).
- [x] `npm run typecheck` green — reported, not re-run per instructions.
- [x] Commit body carries the numbers and keep/revert decision (`git show -s --format=%B e8f26076e` — full per-pose deltas, verdict, verification summary, all present).
- [x] Checklist item order followed: flip → measure → apply rule → typecheck → commit, all evidenced in report/commit.

## Arithmetic verification (recomputed independently from the report's raw per-round numbers)

- volume-inside stable rounds (3–8): scale-3 median recomputes to 10.011 ms, scale-2 median to 11.354 ms, delta +1.343 ms — matches.
- volume-inside `volume·COSMO`: scale-3 median 1.835 ms, scale-2 constant 2.949 ms — matches.
- local-group: medians 22.512 → 22.381, delta −0.131 ms — matches.
- full-survey: medians 23.298 → 21.823, delta −1.475 ms — matches.
- void-inside (non-binding): medians 10.060 → 9.798, delta −0.262 ms — matches.
- All-8-rounds sensitivity check (including the two warm-up-contaminated rounds from the Noise note, using the raw 63.2/65.0/72.5/17.2 ms values quoted there): recomputes to +1.163 ms ≈ the report's stated "+1.16 ms" — verdict unchanged either way.
- Large-tier n=1 deltas: +8.421 ms TOTAL / +4.227 ms `volume·COSMO`, matching the report's "+8.4 ms" / "+4.2 ms."
- Fragment-count math in the commit message ("2.25x the fragment count" for scale 3→2): (1/2²)/(1/3²) = 9/4 = 2.25 — correct.

No arithmetic error found anywhere in the report's tables or the commit body.

## Diff scope

`git diff a3834fb9a..e8f26076e --stat`: one file, `src/services/gpu/renderTargets.ts`, 7 insertions, 0 deletions. `scale: 3` at the `volume` row (line 201) is unchanged from pre-task HEAD — the only content change is a new comment block. Nothing else touched.

## Comment quality

The added block (7 lines, all comment) sits inside the pre-existing "Why the volume row renders at 1/3 scale" subsection of `renderTargets.ts`'s module docblock:

> Don't drop this to `scale: 2` without remeasuring: tried it (2026-08-19, paired A/B against shipped defaults — tier medium, MCPM field on), and `volume-inside` regressed TOTAL merged by ~1.3 ms over 6 stable rounds — over the acceleration stack's 1 ms budget. That pose sits inside the field with no empty space for the skip/cone-LOD march to exploit, so the extra fragments aren't "spent savings," they're pure added cost.

- States the landmine directly ("don't drop this ... without remeasuring") — exactly the convention's carve-out for "a choice that looks wrong and would get 'fixed' back."
- Gives the number (~1.3 ms), the pose, the budget it busted, and the mechanistic *why* (no empty space for the march to skip at this pose) — a reader gets the load-bearing fact without re-deriving it.
- Does not narrate the measurement session (no warm-up transient, no round-by-round detail, no mention of `void-inside`/large-tier context) — correctly left to the workspace-local report/commit body, not inlined.
- Budget: this is a 7-line addition to an already-large, pre-existing multi-subsection module docblock (predates this task; every other row in the file carries a comparable "### Why ... " subsection). The addition itself is proportionate and terse; it doesn't newly violate anything not already true of the file's established, previously-merged documentation style.
- Factually consistent with the report: same figure (~1.3 ms vs. reported 1.343 ms), same pose, same reasoning (matches the report's Concerns section, which in turn cites `matrix-report.md`'s finding that this pose is where the acceleration structures are net-negative).

## Other findings

None. No unrelated changes, no scope creep, no test or type-check claims that contradict the diff.

## Verdict: **Approve**

The decision rule was applied exactly as written — right three poses, right metric, right baseline, right threshold — and the revert is the correct, well-evidenced outcome. The report's arithmetic is internally consistent throughout (independently reverified above). The diff is a single, accurate, budget-conformant landmine comment; the volume scale stays at 3, matching the report's and commit's claims. No changes requested.
