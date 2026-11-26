# Ledger: 2026-11-25-sampled-trails-core-service

Plan: docs/superpowers/plans/2026-11-25-sampled-trails-core-service.md
Spec: docs/superpowers/specs/2026-11-25-sampled-trails-core-service-design.md
Worktree: .claude/worktrees/asteroid-2026-qq8-body · branch refactor/sampled-trails-core-service · base main d36088137
This PR is PREP for asteroid 2026 QQ8 (next PR, body Layer small body on a sampled position; leaves Earth 2026-12-07).

## Start answers
- Parallelism: one plan, three serial dispatches.
- Perf gate: skipped (owner, 2026-11-25).

## Rulings (owner, 2026-11-25)
- QQ8 lives in the body Layer; "I dont accept the warts" (tracks/trails owned and named by missions).
- "we dont want cross-layer dependencies" -> trails are a core service, Layers hand in rows (guides.sampledTrails). Contract member approved ("Add the member").
- "Mission trails" / `missionTrails` / `layers=missionTrails` stay (replaces the same-day "Trajectories" rename ruling).
- One track file per body, loaded by the owning Layer; core fetches no data.
- Trail colour moves from the position row to the trail row.
- Past a track's last sample the body is absent.
- Prep is its own PR. Merge only on "merge this PR", squash, CI green first.

## Controller chores
- Before Task 3: this worktree's public/data is a symlink to main's. Replace it with a real dir of per-file symlinks so new files and the manifest stay local (main must keep spacecraftTracks.*.bin).
- Raw Voyager vectors are not on disk anywhere (data/raw/horizons/500@10 missing): Task 3 re-fetches (announce the download).
- Code edits go to subagents; controller does docs, shots, review, merges.

## Dispatches
- D1: Tasks 1+2, opus, BASE 432087b0a -> (running). Baseline shots at base: data/shots/base-{exhibit-jupiter,exhibit-launch,normal-jupiter}.jpg (links: #exhibit=voyager-missions&t=1979-03-05T12:00:00Z ; ...&t=1977-09-05T13:30:00Z ; #focus=body-jupiter&t=1979-03-05T12:00:00Z&layers=missionTrails). Dev server shell b55xgap20 on :5176 (do not kill). Next: D2 = Task 3 (opus; do the public/data chore first), D3 = Tasks 4+5+6 (opus), then whole-branch review, eye checks as dash asks (before LEFT / after RIGHT), /feature-done, PR.
- D1 landed d018f100e (T1), f39077367 (T2). Mid-branch review (opus): 1 red test + 5 small; fix round sent to D1's agent (shader folder -> shaders/bodies/sampledTrail, one GatedTrailGroup<G>, loud MAX_TRAILS cap, body wording). Ruling: per-draw id flatMap stays — reviewer measured it cheaper than orbit trails' own arrays — cost if wrong: a few small allocations per view. Plan+spec doc corrections uncommitted until the fix lands. public/data is now a local dir of links (chore done).
- Fix round landed 07b85a082; full suite green (2064 files). D2: Task 3, opus, BASE c21c35dc2 -> (running).
- D2 landed 1fedc5958 (T3). New per-body files == base builder's output bit for bit on a fresh fetch; events file changed in header only. Horizons DRIFT vs shipped spacecraftTracks.342c3d0c.bin: voyager1 up to 8.2 km, voyager2 up to 0.13 km, 1929 vs 1930 samples (events unchanged). Manifest: agent added the two entries by hand (build-data-manifest skips symlinks and would break this worktree's manifest). Fix sent: drop the startsWith assert (planted trap), dense file required where a refinement exists. CLOSE-OUT CHORE: raw Voyager fetch lives only in this worktree's data/raw/horizons (gitignored) — copy to main's data/raw/horizons before removing the worktree; after merge the owner (or I, on main) runs npm run build-sampled-tracks then sync-r2-secure. Reference outputs: scratchpad/track-ref/.
- T3 fixes landed 191c14dfa. Running in parallel: T3 mid-branch review (read-only, by commit c21c35dc2..191c14dfa) and D3 = Tasks 4+5+6 (opus, BASE 191c14dfa). After both: handle T3 findings (send to D2's or D3's agent), T5 is review: yes too -> fold into the whole-branch review, then eye checks, /feature-done, push, PR, CI watch.
- D3 landed 8122717e0 (T4), 0646aafb6 (T5), 9358df120 (T6). T3 review: no bugs; follow-ups landed 90bada7d0 (dense on the fetch row, named refinement type, test ids). After-shots == base shots (data/shots/after-*.jpg). Running: whole-branch review + deletion audit (both opus, read-only, HEAD 90bada7d0). Then: one fix round (D3's agent aed4db3f1462b5543 for T4/5 items), eye checks ask (3 pairs + craft switch), /feature-done, push, PR, CI watch. PR body must carry DEPLOY ORDER: build+sync new track files from the branch first, merge straight after (merge deploys at once; new code needs sampledTrack.<id>.bin on R2).
- Whole-branch review + deletion audit done (net ~-23 LOC safe-now). Final fix round sent to aed4db3f1462b5543: commit A deletions, commit B slab-row presence filter + isoToJulianDays + wording; full suite. Spec corrected (uncommitted until the agent finishes): equivalence is vs the base builder on the same fetch; §4 notes the re-bake (8.2 km / 0.13 km). OPEN ask kQiT: 4 eye checks (3 pairs + live craft switch), re-bake yes/no, keep cap warning, fix hermiteTrackVelAt NaN here. On answers: tiny follow-up round if needed, commit spec, /feature-done (plan ticks, moves, ledger archive), merge main into branch if behind (base was bfff3d7d8, main has #1164 #1165), push, PR with DEPLOY ORDER, CI watch.
- Fix 01aa60c39 (hermiteTrackVelAt zero outside the track). Owner answers kQiT: 4 eye checks pass; ship the fresh bake; keep the cap warning; fix vel NaN here. Merged origin/main (b075d765e). /feature-done: typecheck 0 errors, suite 2066 files / 35736 tests green, 40/40 boxes, no new TODOs, deletion audit applied in dbb368fb9. READY.
