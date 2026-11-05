# SDD ledger — plan: docs/superpowers/plans/2026-10-10-r2-sync-groups-prep.md
Branch prep-r2-sync-groups, worktree /Users/rulkens/Development/js/skymap/.claude/worktrees/prep-r2-sync-groups, base 85b90bf80 (origin/main). Parallel with the two sibling preps. Perf gate: none (plans say no perf run). Feature spec lives on branch regalade-octree (PR #868); this prep PR ships only its plan.
Ruling: the spec file is not copied into prep PRs — it ships with the feature — so prep reviewers read it from PR #868 — cost if wrong: a reviewer without the spec; mitigated by citing spec §8.3 text in briefs.
Ruling: user allowed the Task 5 probe (ask 3C6Z, 2026-10-11): one object under data/_probe/ then deleted.
Dispatch 1: all tasks, opus, BASE 817c7537d, started 2026-10-11
Dispatch 1 done: HEAD eae8814d5, ~45 turns, DONE_WITH_CONCERNS (probe refused by the permission system for the subagent; neutrality diff empty; ratchet rows dropped; stale doc paths fixed). Probe deferred to the controller as the session's last action.
Review 1 (opus): approve; 1 Important (probe not run, no ruling recorded), 8 minors. Minors 2,3,4,5,6,7 fixed inline by controller; 8 (parked desktop-offline plan names shouldGzipOnWire) left, historical; 9 (family groups hardcode wrangler) left: R2Transport is a union whose bulk arm needs localRoot/keyRoot, so bulk rows get their own wiring with the feature (plan Out of scope).
Ruling: the probe is attempted by the controller as the session's last action; if the sandbox refuses, it is the user's to run by hand from the plan's recipe before the first gzipOnWire bulk sync — cost if wrong: the first chunk sync could publish objects R2 decompresses, caught by the curl check in the sync recipe.
Landing: pushed, draft PR opened, CI watched.
Probe run by the user 2026-10-11 (probe.sh): content-encoding gzip kept, 3119 B served, bytes OK, 2nd run no-op, deleted. DEPLOY.md + plan updated.
