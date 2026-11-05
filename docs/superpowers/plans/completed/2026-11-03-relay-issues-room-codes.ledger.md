# SDD ledger — plan: docs/superpowers/plans/2026-11-03-relay-issues-room-codes.md

Spec: docs/superpowers/specs/2026-09-19-desktop-offline-app-design.md. Branch worktree-electron-kiosk-dome-app is the prep PR (owner, ask rdD3). Execution: lean SDD (owner).
Ruling: parallelism = this plan alone; the feature plan is written meanwhile, not executed — owner chose "now, while prep runs" — cost if wrong: none.
Ruling: perf gate OFF — renderer untouched (standing desktop-app ruling) — cost if wrong: an unmeasured saga cost, negligible.

Pre-flight scan:
| Pair / task | Produces → consumes | Found |
| T1 → T2 | relay at tools/utils/remote/attachRemoteRelay.ts | consistent |
| T2 → T3 | RelayRoom, RelayFrame, ROOM_ROTATED / HOST_REPLACED close codes, attachRemoteRelay (live fixture) | consistent |
| T2 self | existing relay cases carried over, rephrased for host + remotes | consistent |
| T3 self | memory transport opened() → hosted(); existing saga tests using opened() follow | consistent, implementer adjusts |

Task 1: complete (commits b9492df..e797c1e, controller inline: move-files, typecheck:fast, tests/tools/utils/vite 10/10)
Task 2: dispatched opus, implementer done a7488c2 (base e797c1e), 27 tool uses; deviations: firstOrigin() helper, REMOTE_PATH_PREFIX unexported; open edge: rotate onto a live code overwrites. Mid-branch review (review: yes) dispatched opus.
Task 2: review not approved — 2 Critical (refused socket crash on bad frame; new URL throws on absolute-form target), minors: rotate onto held code zombie, empty ?last= → room "", fifth-socket test gap.
Ruling: the three minors ride fix round 1 with the criticals — lean SDD allows one fix round, each is a few lines and two break the spec rule "one live host per code" — cost if wrong: a slightly larger fix diff.
Task 2: minor (deferred): no test that a replaced host's in-flight text is dropped.
Task 2: fix round 1/1 (5 addressed; commits a7488c2..54bf9b7), no re-review per lean protocol
Task 2: complete (commits e797c1e..54bf9b7, review findings fixed)
Task 3: dispatched opus, done a852b32 (base 54bf9b7); deviations: saga also cancels silence watchdogs on each room frame (re-pair after dev restart), open() also drops relay-keyed text; one flaky full-suite failure unnamed, next two runs green, transport waitFor raised to 3 s.
Ruling: Task 3 mid-branch review and the final whole-branch review run as ONE top-tier review (T3 contract + spec §7 + whole branch) — T3 is the last task, two seats would read the same diff — cost if wrong: a T3-specific miss the merged mandate dilutes.
Final review: no Critical; Important: forgery rule implemented twice (relay + transport), Review Focus 3 unpinned client-side; minors: plugin test file now tests listRemoteOrigins only, pairingUrl.test restates code, dev re-pair flash on host blip (spec-sanctioned → PR body).
Ruling: move remoteRelayPlugin.test.ts to tests/tools/utils/remote/listRemoteOrigins.test.ts against the plan text — mirror convention outranks the plan's "stay put" — cost if wrong: one more moved file.
Ruling: deferred minor (replaced host in-flight text) accepted, not backlogged — the old host is closed with 4002 at once and only sends its own dome status/menu — cost if wrong: one stale status frame to remotes.
Final fix wave dispatched to Task 3 implementer (resume).
Final fix wave: 4 addressed (commit 4a684a4; amended once unpushed to add files after a failed git add); no re-review per lean protocol.
Plan complete: Tasks 1-3 + final review fixed; HEAD after spec fix commit.
Landing: owner phone check PASS (https LAN dev server); restart re-pair check skipped by owner; push + PR approved (ask QPKF).
