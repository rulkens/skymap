# SDD ledger — plan: docs/superpowers/plans/2026-11-04-move-files-package.md

Protocol: lean (docs/superpowers/conventions/sdd-execution.md). Parallelism: serial, one worktree, one PR. Perf gate: skipped (owner, no renderer code).
Comparison inputs for Task 8, in the session scratchpad /private/tmp/claude-501/-Users-rulkens-Development-js-skymap/bf5ca1fa-7109-4acb-be2c-360943b253b3/scratchpad/: corpus.json, mathDir.json, old.json (ts-morph dump), compare.mjs. old.json was taken at the branch's merge base.
Dispatch plan: D1 Tasks 1-2 (prep), D2 Tasks 3-5 (core), D3 Tasks 6-7 (plan + switch-over), Task 8 inline.
D1 Tasks 1-2: sonnet, base 34df base→6cf58c810, DONE. 
Task 1: complete (40bf6b31e)
Task 2: complete (6cf58c810)
Ruling: keep tools/utils/refactor/companionRules.ts, not in plan — one reader of the config for tools/ — cost if wrong: one small file.
Ruling: anchorToMirroredRoot longest-first stays for now — fixes tools/x/src/y paths, but a checkout under a folder named tools would now anchor wrongly, where before it anchored at src/ — final review to weigh an anchor relative to the project root.
Deferred: headers of planMove, renderMoveReport, parseMovePairEntry still name refactor move; Task 7 deletes or rewrites them.
D2 Tasks 3-5: sonnet, 6cf58c810→e0fbb36a0, DONE.
Task 3: complete (see git log)
Task 4: complete (de408e8fe)
Task 5: complete (e0fbb36a0)
Deviation: D2 wrote implementations before tests, so no test was seen failing first. Final review asked to check the tests can fail on real bugs.
Ruling: a moved file not in snapshot.texts (binary asset) is renamed by applyPlan — rewriteReferences only edits text files — cost if wrong: an asset move fails loudly at apply, exit 3.
D3 Tasks 6-7: sonnet, e0fbb36a0→19929c08c, DONE.
Task 6: complete (0c6123443)
Task 7: complete (19929c08c)
Ruling: Task 8 runs in this worktree, not a throwaway one — the session is isolated to this worktree's git — cost if wrong: comparison files overlapping this branch's own edits show up as differences to explain.
Task 8 found the guard parsed every file with a relative string (3.06s single move); controller fixed inline, guard parses only suspects, report paths relative, CSS comments ignored.
Task 8 results, real CLI after the fix. Single move, dry: 2.1s against 28.9s (14x). 54→56 moves with writes: 2.2s against 483s (~219x; ts-morph ran dry). 196 moves with writes: 2.1s. Output vs ts-morph on corpus: 186 of 191 identical, 4 /index lines, 1 CSS line, 10 files only new (2 ?worker, 1 vi.mock, 7 from CSS moves and their composes paths).
Corpus applied: typecheck 2 errors, both .astro imports, both guard findings. Tests: 10 failed in 7 files, 1 flaky-under-load (noStoredRegimeFlag passes alone), siteMode from the .astro imports, the rest allow-lists/facts/ratchets on randomly moved files. Folder rename applied: typecheck 0, tests 5 failed in 4 files, all guard-flagged strings; npm run build passes. Self-move round trip clean.
Task 8: complete
Owner ruling 2026-11-04: the package gets its own test folder. After the review: move tests/packages/move-files → packages/move-files/tests with the CLI itself; update the companion rule, vitest include, tsconfig include, spec and plan.
Blocked: PR conflicts with main, so the main CI job doesn't run. Merge main into the branch before the fix round.
Final review (opus): final-review.md in this folder. Verdict do not land: C2 I13 M13. Fix round: one, opus, then controller re-runs review/mutate.mjs; no re-review (sdd-execution).
Ruling: fix all C and I except as ruled here — the package claims any JS/TS project, and these fail silently — cost if wrong: more code in the package than skymap alone needs.
Ruling: I12 drop .scss/.less from rewriting, guard-only, README says so — spec names CSS only; Sass support is unrequested growth — cost if wrong: a Sass project gets relative guard findings, no rewrites.
Ruling: I10 non-UTF-8 text is treated as an asset, not rewritten, README says so — never corrupts bytes — cost if wrong: its references stay stale.
Ruling: I3 workspace node_modules extends left out; other I3 rows fixed, reading every tsconfig*.json so tsconfig.app.json needs no references walk — cost if wrong: a monorepo config extended from a workspace package loses aliases.
Fix round: opus, 37f5ab392→90a28d275, DONE, fix-report.md in this folder. Mutation: first pass 125 of 133 killed, 8 survivors each then pinned or re-aimed and re-run; 134 of 134 but not in one final pass. anchorToMirroredRoot deleted, not rewritten: callers use cwd-relative paths.
Comparison repeated after the fix round, in a throwaway checkout of base 8c587cb09: 54→56 moves with writes 2.17s; against ts-morph 186 of 191 identical, same 5 lines, same 10 only-new files; against the pre-fix run 201 of 201 identical. Single move, dry, merged tree: 2.05s.
Ruling: refuse a destination whose folder differs only by case from a listed folder, on every platform — silent on macOS otherwise — cost if wrong: a folder's case change takes two commits. Controller inline, test first; no mutation run.
Deletion audit (opus) on bbe705d48: deletion-audit.md. Safe-now ~386 (26 src, 210 tests, ~150 comments), needs-ruling 63, and a regression: refactor rename overwrites an existing file. CI green at bbe705d48.
Ruling: fix the overwrite regression without asking — main threw, this branch destroys a file — cost if wrong: about 5 lines. Dispatched sonnet with the safe-now cuts, config inline, .vue/.svelte guard, cli timeout check, one final mutation pass; report in deletion-report.md.
Ruling: skip the plan.moves absolute row — churns 11 test calls for 3 lines — cost if wrong: one type keeps two path frames.
Deletion commits: sonnet, bbe705d48→4f3de7357, DONE, deletion-report.md. One mutation pass on the final tree 144 of 144 (9 timed out under load, re-run singly, all killed). Real refactor rename checked and undone. jest.dontMock not added: unverifiable from the tree. cli suite timeout 30s; cause of the one flake not established, one run at load ~20 still timed out.
Ruling: assertDestinationsFree counts only an exact path as occupied in the Project — the exemption let Foo→foo overwrite foo.ts on Linux — controller inline, test first, after the mutation pass.
Owner ruled i23D: delete extraMockCallees and CHARACTER_ESCAPE; keep peerDependencies; runOp stays in its backlog item; header trim as its own PR (backlogged); .astro/.mdx backlogged.
Final check on the final code, base checkout: 54→56 moves with writes 2.44s; against ts-morph 186 of 191 identical, same 5 lines, same 10 only-new files; against the previous run 201 of 201 identical. Single move, dry, merged tree: 1.38s. The applied-tree typecheck, test and build runs date from Task 8; output is byte-identical since, so they were not repeated. The two guard fixes and the two deletions came after the mutation pass.
Ruling: M3 reference forms: README only. M4 refuse destinations with a quote character; M11 README only. Other minors fixed. Replaces the anchorToMirroredRoot ruling: fix it relative to the Project's cwd, deleting the search and sort.
