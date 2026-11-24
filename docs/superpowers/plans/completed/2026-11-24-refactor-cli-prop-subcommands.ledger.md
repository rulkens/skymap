# Ledger: refactor CLI on TypeScript 7, PR B

Plan: docs/superpowers/plans/2026-11-24-refactor-cli-prop-subcommands.md
Branch: refactor-native-props (worktree layer-refactor-status), stacked on refactor-native-spec (#1154, CI green at e81dc4a9e), plan commit d610d99de
Pre-flight: one PR; no perf gate. Not asked: both follow from the spec.

Ruling: params-to-object classifies the driver's references, no getSignatureUsage — one less unstable API call — if wrong: add the adapter call later, planners unchanged.

## Dispatches

- D1: Tasks 1–3, sonnet — dispatched
- D1 done: Task 1–3 complete (HEAD 7ca5d1c7e). sonnet. prop-refs CameraPose.yaw: 497 refs/161 files, 3.8 s, 56 quoted mentions. rename-prop works on CameraTweenDescriptor.frame (3.4 s, typecheck passes). Findings: structurally shared shapes (OrbitCamera.yaw) and intersection re-declarations are separate symbols, so a rename there leaves typecheck errors; round trip leaves `frame: frame`; 56 quoted mentions is noise.
- Ruling: structural twins stay out of the tool (D7: typecheck:fast after; rename the twin in the same manifest) — documented in the skill — if wrong: add an engine diagnostics pass.
- Ruling: narrow quoted mentions to string-literal TYPES, plus string expressions only in files with `keyof <Type>`; collapse `x: x` to shorthand.
- D2: Tasks 4–6 + the two adjustments, sonnet (fresh) — dispatched
- User ruling 2026-11-24: the post-change type check goes in THIS PR (reverses spec D7 for the contract-changing rows).
- Design (Task 7, queued behind D2): engine `findTypeErrors` via program.getSemanticDiagnostics() over all four projects after the last fold; rows rename-prop, remove-prop, params-to-object; runs under --dry too; errors ⇒ nothing written, sites listed, exit 1; `--no-check` writes anyway.
- D2 done: adjustments (e27c77a91), Task 4 (a581355b5), Task 5 (9ebcbb2ea), Task 6 (830798673) — shas after restack. sonnet. Quoted mentions on CameraPose.yaw 56 → 3. remove-prop refusal 3.7 s; params-to-object on focusInSubtree 4.1 s, typecheck + tests pass. Deviations: attachedStart extracted; nested same-function calls refuse; comment between arguments refuses; unannotated parameter refuses.
- Landing: #1154 squash-merged f4dcd3f51 (user word "merge 1154 after"); branch restacked onto origin/main with rebase --onto; refactor-native-spec deleted local + remote.
- D3: Task 7 (type check), sonnet, continuing D2's implementer — dispatched
- Task 7 v1 (a90ab1e90): whole-program check 11–14 s (src 4.2, tools 2.0, website 1.7, desktop 0.2) → checked runs 15–18 s. 38 errors on CameraPose.yaw. Website project gave 745 false errors until each project answers only for its own folder.
- Ruling: check candidate files only (changed + whole-word mentions of the names) — 6.5 s instead of 18 s — cost: misses sites that never spell the name (2 of 38 on yaw, both via an inferred spread); typecheck:fast stays the full check.
- Task 7 v2 (2180e1a6a): 36/38 on yaw at 6.5 s; frame→framing clean at 6.4 s (2060 candidates); params-to-object 4.5 s; unchecked rename 2.9 s.
- Review (top tier) — dispatched
- Review done (top tier, ~95 fixtures + 13 dry runs): 18 findings. Worst: rename-prop merges two properties when a wider type already has the new name; remove-prop drops side effects in an assignment target; the type check misses syntax errors; template-literal key span off by one.
- Fix round: fresh sonnet agent (D2's implementer was at 244k), work list in scratchpad review-b-fixes.md — dispatched
- Fix round done (sonnet, fresh): HEAD 24c0ca04a, 6 commits, 144 tool uses. All 18 addressed. Differently from the ruling: item 1 post-condition runs per entry in acceptPlan and also under --no-check (renameMergeRefusal); item 7 uses a new engine call findReferencedSymbols (related declarations), refuses from both sides, an intersection re-declaration is left to the type check; item 4 findQuotedMentions keeps isStringLiteral (template literals are not mentions); item 18 has checkRun tested, no driver-level write test. Residual: a quoted mention prints twice on a real run (footer and finding).
- Controller checks: npm run typecheck 0 errors; vitest tests/tools tests/conventions packages/move-files 598 files pass; typescript-native only under engine/ and its contract test. Quiet-machine wall: rename --dry 3.1 s, rename-prop CameraPose.yaw --dry 6.6 s (36 errors, exit 1).
- Turn counts: D1 103 tool uses, D2 106 + 41 + 26 (task 7 twice), review 39, fix round 144.
