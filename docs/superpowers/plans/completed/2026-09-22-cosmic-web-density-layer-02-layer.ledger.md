# SDD ledger — cosmicWebDensity Layer PR 2

Branch `worktree-cosmic-web-density-layer` (wt `volume-layer`), draft PR #814, off main
`2c08b49f7`. Plan: `docs/superpowers/plans/2026-09-22-cosmic-web-density-layer-02-layer.md`.
Spec: `docs/superpowers/specs/2026-09-22-cosmic-web-density-layer-design.md`.
Dev server :5173 in this wt (public/data symlinked to main).

Protocol: lean SDD. Serial dispatches in this wt, no local suite re-runs after push, CI is the
gate, one final whole-branch review (Opus) at the end, then user smoke, then merge on the
user's word.

Plan-time defaults (told user): removeCosmicWebDensityField deletion pulled into T1;
allVisibleMask test dropped.

| Dispatch | Tasks | Model | Status | Commits |
| --- | --- | --- | --- | --- |
| A | T1 registry visible/intensity + fetch-data | Sonnet | done (settings dump diff empty; 14355 tests; addCosmicWebDensityField left dead for T4 to delete) | 0f99de4f7 |
| B | T2–T3 generic renderer/pass/liveness + moves | Sonnet | done (1395 files / 14395 tests; moved all 8 pure liveness cases per plan's "what stays" list; VolumeSettings.d.ts deleted, zero importers) | 883278e0e, e5309e1b7 |
| C | T4 Layer forms, core rows deleted (review: yes) | Opus | done (14426 tests; arrival ordering mutation-verified; demand/fade tests re-pointed; adjacent for final review: assetWiring.ts unused SourceType import + stale "DEV synthetic volumes" header; demandTable/wireSlots comments still describe `?.enabled` predicate) | f4009bd8c |
| D | T5–T6 UI split + docs | Sonnet | done (14433 tests; DebugSlider for tuning rows; also fixed producer-toggle-freeze backlog detail file; assetWiring cleanup done) | 6cfdedf1c, 731711027 |
| — | pushed 731711027, CI green; final Opus review done: spec clean, 0 bugs, 25 items (fixture casts, backlog drift, deletions) → `review-findings.md` | Opus | done | |
| FW | fix wave: all review-findings.md items (user explicitly OK'd item 19, slot console.log removal) | Sonnet | done (14421 tests; nothing skipped; logs gone) | 24728792c..e9c47bd24 (8) |
| OPEN | user asked "projectVolumeFieldRows seems like an indirection?"; I proposed: sections iterate COSMIC_WEB_DENSITY_SOURCE_ROWS, rows take (entry, settings), delete projectVolumeFieldRows.ts + VolumeFieldRowData.d.ts. User said YES; dispatched (Sonnet). On hand-back: check commit, then dispatch QUEUED row below, THEN push, bg CI watch, ask user to smoke :5173 | Sonnet | done (14412 tests) | 68f926918 |
| DONE 8acd67b65, pushed; CI GREEN; USER SMOKE PASSED 2026-09-23; NEXT: /feature-done (file plan+spec+ledger under completed/) then merge on user's word |
| FEATURE-DONE (in progress) | audit: deleted-symbol grep clean, 0 new TODOs, 32 plan boxes unticked (tick at move; DoD inventory names projectVolumeFieldRows/VolumeFieldRowData, since deleted: add completion note). Local suite: 34 fails ALL env (Node 25 localStorage global breaks jsdom splash tests; CI green on same SHA). Deletion audit → `deletion-audit.md`: safe-now 1–8 LANDED bd7d4696c (unpushed); needs-ruling 9–14 RULED by user: keep 9/10/14, apply 11/12/13 → LANDED e01aa6a77. Verdict READY; completion moves committed after this line. On hand-back: check commit, then completion moves (tick 32 boxes + note, git mv plan+spec to completed/, copy ledger as .ledger.md, backlog sweep), commit, push, CI watch, then ask merge word. On hand-back: check commit, then moves + push + CI | | running | | user said YES (+ DensityFieldTuningRow entry type → slot's spelling): galaxyCatalog + starCatalog `state/*/initialState.ts` → `items` as a typed literal Record (delete BOOT_ENABLED, GALAXY_CATALOG_IDS / SOURCE_ENTRIES import, fromEntries, `as Record` cast; DESI comment onto the three false rows). One commit. Dispatch after the row above hands back (same wt, avoid concurrent verify) | Sonnet | queued | |

Brief for every dispatch: `.superpowers/sdd/2026-09-22-cosmic-web-density-layer-02-layer/brief-common.md`.

## Handling on each hand-back
Check the commit (author = user, no trailer), update this table, then dispatch the next row
with the prompt shape "Implement Task(s) N of the plan … building on HEAD <sha> … follow
brief-common.md". C runs on Opus. After D: push, bg `gh pr checks 814 --watch`, one Opus
whole-branch review (spec fidelity + slop + deletion audit framed "surplus presumed"), one
fix wave if needed, then ask the user to smoke (spec §DoD eye-checks, dev server :5173), then
merge only on the user's word (`gh pr ready 814` + API squash), task diff breakdown, cleanup
(wt, both branches `worktree-volume-layer` + `worktree-cosmic-web-density-layer`, any agent-*
wts). Pending on the user: R2 cf4 delete command; ff their main checkout.
