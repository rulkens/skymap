# SDD ledger — plan: docs/superpowers/plans/2026-11-06-layers-link-param.md

No spec (ruled small change, design approved in chat 2026-11-06); the plan's design block is the authority.
Pre-flight: no conflicts. Note: docsReference.test fails between Task 4 (row added) and Task 6 (docs row) — expected, CI runs at the end.
Worktree: .claude/worktrees/layers-link-param, branch worktree-layers-link-param, base 7976bca95

Ruling: no perf gate — no per-frame work — cost if wrong: none measurable
Ruling: one plan, serial dispatches in this worktree — 2–4 dispatches can't use parallelism — cost if wrong: latency only

Dispatches:
- D1: Tasks 1–2 (prep) — sonnet
- D2: Tasks 3–5 (codec, row, share) — opus — mid-branch review after (review: yes on 3, 4)
- D3: Tasks 6–7 (site checks/docs, website shots) — sonnet
- Controller: Task 8 verify, final review, PR
- D1 dispatched: Tasks 1–2, sonnet, BASE c2493c0b9
Task 1: complete (commits c2493c0..77f4875, sonnet)
Task 2: complete (commits 77f4875..0fef84e, sonnet)
- D2 dispatched: Tasks 3–5, opus, BASE 0fef84e71
Task 3: complete pending mid-branch review (commits 0fef84e..2e7c24c, opus)
Task 4: complete pending mid-branch review (commits 2e7c24c..c9fab87, opus)
Task 5: complete (commits c9fab87..7c72b3a, opus)
D2 deviations: new utils/visibility/splitVisibilityAddress.ts shared by setVisibilityActionsFor + parser; parser rejects non-exact tokens; no encode test file (round-trip covers)
- Mid-branch review dispatched over 0fef84e..7c72b3a (opus); D3 dispatched concurrently: Tasks 6–7, sonnet, BASE 7c72b3a54
Ruling: run the mid-branch review alongside D3 — they touch disjoint files and the review is read-only; any fix round waits for D3 to land — cost if wrong: a fix that touches D3's files needs a rebase-free follow-up commit
Mid-review 3–5: spec ✅. Important: hashHistoryIntegrity 'before the reveal' test asserts only settled state. Minors → fix round too: parse test cases (exact-form rejection, label:name:item); a navigation carrying layers test; splitVisibilityAddress inline return type → @types. Deferred minors: takeover-exit race (existing, t shares it) → adjacent-finding ask; exhibit/tour link switches overridden by the takeover → check shots in Task 7.
Ruling: link layers keep applying before a takeover's body; an exhibit/tour's own settings win where they overlap, documented on the URL parameters page — un-braiding it would give takeovers a second apply point — cost if wrong: exhibit links with layers= don't reproduce; only site shot affected is exhibit=solarSystem + hideLabels (matte, siteShots.ts:1104) → reshoot it in Task 8
Task 6: complete (commits 7c72b3a..c0e0e28, sonnet)
Task 7: complete (commits c0e0e28..a34d3bd, sonnet)
D3 deviations: layer-names list built in url-parameters.mdx (facts.test forbids data files importing app); shotHash + shotLayerSwitches on facts.test allow-list; siteShots.test address check endsWith→includes; new shotLinks test: every shot switch parses clean
- Fix round 1 (tasks 3–5) → D2 implementer, FIX_BASE a34d3bd3a
Task 3–5: fix round 1/1 (4 addressed; commit bf4622f)
Task 8: shots science-desi, features-time-voyager, stories-web, stories-orbits reshot vs committed: meanAbs 0.25–3.26, px>40 ≤0.07% — match (first run hit HMR reloads from the fix round; reshot clean)
Final review: spec ✅ bar the docs overlap sentence. Important: docs overlap sentence; long layers= tails in printed addresses; stale prose (dev skill, tools/site README, shootSiteShots header, siteShotActions:47).
Ruling: printed addresses hide layers= behind the same … as pose (shownLink) and CiteCaption drops it with pose; hrefs and the copy keep the full address — pose already sets this precedent, a 13-token tail is unreadable — cost if wrong: one filter line to revert
Ruling: hideLabels links open the app with captions off, as designed (owner picked hides + captions on the link) — named as a risk in the hand-over — cost if wrong: drop label tokens from shotLayerSwitches
Parked: takeover-exit race (pre-existing, t shares it) → adjacent-finding ask; judgePicture raw row.link (report field, opens nothing)
- Final fix wave → D3 implementer, FIX_BASE bf4622f67
Final fix wave: 3faf211 (all Important + minors; no re-review per lean protocol)
Landing: pushed, PR #1060 open; CI watched in background
Smoke 9JBJ: 3 links pass; science-desi, voyager, stories-web pass; stories-orbits FAIL (star names back: exhibit's starCatalogs reset lands after the link's -label:starCatalog). My pixel metric (px>40 ≤0.07%) missed small text — eyeball every pair next time. Owner: fix takeover-exit race in this branch.
Ruling REVERSED pending owner (ask UeUY): exhibit-wins ruling broke stories-orbits; proposed link-wins via openExhibit payload.
Ruling (owner, UeUY): link wins over exhibit — layers ride openExhibit, applied after the exhibit's settings.
CI run 1 FAIL: noInlineTypes on shotLayerSwitches.ts → fixed inline 2c23089 (controller, 1 line)
- D4 dispatched: exhibit link-wins + takeover-exit race (test-first), opus, BASE 2c23089e0
D4: c749733 (exhibit link-wins, test failed first) + 0262d52 (race reproduced on t; applyNavigation waits for takeoverEnded). Deviation: navigateSaga's wait kept — a remote goTo/startClip can start a play during boot.
Ruling: keep navigateSaga's own takeover wait beside the new one — a remote can start a play before arrival ends — cost if wrong: one redundant wait
stories-orbits reshot after D4: no star names, matches committed (eyeballed)
Deletion audit: net +639 (code +157, tests +214). Safe-now applied a6426f9 (−27, tests + one ternary). Needs-ruling → owner: (1) one takeover-exit wait instead of two (behaviour change), (2) shared read-only-key list for shownLink + CiteCaption.
DoD audit READY pending CI on the last push; plan + ledger moved to completed/.
