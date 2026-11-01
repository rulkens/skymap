# SDD ledger — plan: docs/superpowers/plans/2026-10-16-dome-remote.md

Spec: docs/superpowers/specs/2026-10-11-dome-remote-design.md (approved 2026-10-16). PR #916 (draft), branch dome-remote, wt external-dome-controller.
Parallelism: this plan alone in this worktree, dispatches serial (other efforts run in other sessions/worktrees).
Perf gate: none — ruled in the approved plan (no per-frame cost).
Pre-flight scan: interfaces T1→T2 (RemoteCommandPayloads/RemoteCommand), T2→T4 (parseRemoteCommand, runRemoteCommand), T3→T4 (remoteSearchMatches, selectDomeStatus), T4→T6 (remoteReceiverSaga, remote slice), T5→T6 (createLocalTransport), T4→T7 (hello interval constant), T1→T7 (createDeviceChannel, parseDomeMessage): consistent; no conflicts.

Dispatch A: Tasks 1-3, opus, BASE 47c51caea → (running), agent a1053686dcd3ec7db
Dispatch A: done — opus, 47c51caea→4376d7d6f (T1 d277dd41d, T2 d08c5d9e6, T3 4376d7d6f), 81 tool calls. Deviations: RemoteCommandSpec.parse returns P|undefined; helpers isRecord + isFiniteIn; old name kept only in history docs.
Ruling: accept `P | undefined` as the registry's drop sentinel — null is a valid payload for no-payload rows, and JSON never yields undefined — cost if wrong: a one-file signature change.
Ruling: paletteRowLabel kind texts chosen by implementer (Galaxy, Object, Star, Exhibit, Tour, Place, structure category short label) — plan left them open — cost if wrong: copy edit.
Review T1+T2: opus, running (agent a36608e6ef991b904), package review-47c51caea..d08c5d9e6.diff
Dispatch B: Task 4, opus, BASE 4376d7d6f → (running)
Review T1+T2: done — opus, 13 tool calls. T2 clean. T1 Critical: at bound 0..1 dropped moves/up of a drag followed off the trackpad (channel listens on window) → drag freezes, stranded pointer turns next touch into a pinch. Minors: id-length cap, pointer/ratio bounds untested; runRow indirection.
Ruling: at bound widened to −10..11 (named AT_MIN/AT_MAX), spec + plan corrected — the spec's 0..1 was wrong for a window-following channel — cost if wrong: a pointer dragged >9 surfaces away is dropped.
Fix round T1+T2: controller inline (<50 lines, lean rule), e621c29ad — Critical + 3 minors fixed, 65 remote/composition tests pass.
Task 1: complete (d277dd41d, fixes e621c29ad). Task 2: complete (d08c5d9e6, fixes e621c29ad). Task 3: complete (4376d7d6f; no review tag).
Carry to dispatch D (Task 7): createDeviceChannel `e.target !== element` drops hover over trackpad children — keep the trackpad childless or switch to element.contains(target).
Dispatch B: done — opus, 4376d7d6f→0901c7332 (Task 4), 42 tool calls. Deviations: test store via configureStore+rootReducer (createAppStore runs mainSaga which needs saga context); createRemoteSourceChannel is a plain channel(buffers.expanding()) so the receiver can put into it; timings as three data files; pairingUrl null when no origins; change-driven status only on an actual state change. Imports compositions directly (state→compositions allowed; navigateSaga precedent).
Ruling: relay message cap raised 2 KB → 16 KB (spec + plan, f45d9b443) — the dome's full status and a ten-match search answer would brush 2 KB; the cap guards the relay, not the protocol — cost if wrong: none material.
Review T4: opus, running, package review-e621c29ad..0901c7332.diff
Dispatch C: Tasks 5–6, sonnet, BASE f45d9b443 → (running)
Review T4: done — opus, 18 tool calls. Spec ✅, no correctness bug. Important: trailing status send unpinned. Minors: closed-link test one remote; createRemoteSourceChannel one-line wrapper; watchdogs map kept finished tasks.
Fix round T4: controller inline — all four fixed (new test, two-remote closed link, wrapper inlined + file deleted + plan updated, watchdogs.delete); 16 receiver tests + conventions pass.
Ruling: inline createRemoteSourceChannel although the plan named the file — single-use one-liner, code is liability — cost if wrong: re-extract one line.
Task 4: complete (0901c7332, fixes 6218ab45b)
Dispatch C: done — sonnet, 6218ab45b→892256373 (T5 ff0e159c4, T6 892256373). Deviations: relay split into attachRemoteRelay + listRemoteOrigins (plugin thin, origins as middleware); oversize dropped in handler, not ws maxPayload (that closes the socket); newLocalRoomCode random typed Uint8Array<ArrayBuffer>; inlineEntryCssPlugin untouched (index.html only); remote.html placeholder; QR colours from tokens (--color-fg background, --color-bg modules); overlay tests mock useAppSelector. No by-eye check yet.
Task 5: complete (ff0e159c4). Task 6: complete (892256373). No review tag.
Dispatch D: Task 7, sonnet, BASE 892256373 → (running)
CI red on 892256373: docsReference 'lists every flag' — ?remote missing from website docsUrlParams; fixed inline 7639e6aaf.
Dispatch D: done — sonnet, 7639e6aaf→d995114fc (Task 7), 29 tool calls. Deviations: tour/exhibit/clip lists from three hand-kept label tables in src/data/remote/ (tourRegistry/APP_EXHIBITS/clipRegistry/FEATURED_TABS drag src/services/engine in via src/store); clips filtered to 9 (demo tour beats, flyPathDemo hidden); RemoteId via crypto.randomUUID?.() ?? newLocalRoomCode() (no randomUUID on plain http LAN); trackpad childless, label sibling with pointer-events none; RemoteSession type file. No screenshots / ui-ux self-check.
Task 7: complete (d995114fc). No review tag.
OPEN for user: label tables duplicate registry data (drift) — alternative: dome sends a `menu` message built from the registries.
CI red on d995114fc: attributionCoverage read '192.168.x.x' in a useRemoteLink comment as a host; fixed inline 5ece320ca.
USER RULING 2026-10-16: the dome sends a `menu` (tours/exhibits/clips id+label) with the status on every hello; the three remote label tables are deleted (registry import trace: tours 34 files, clips 258, exhibits 293 incl. React + store hooks; none reach gpu).
Ruling: Clip gains optional `dev` like Tour.dev, set on grandTourBeats clips + flyPathDemo; menu excludes dev tours and clips — no clip filter field existed and beats hold ClipData not ids — cost if wrong: a field on two clip files.
Dispatch E: menu change, sonnet, BASE (spec commit) → (running)
Dispatch E: done — sonnet, 5889c0462→a86bcf7e9 (menu), no deviations; 6813 targeted tests pass incl. import graph.
Final review: opus, running.
Final review: done — opus. Changes needed. Critical: trackpad's first resize sent before socket open and dropped → phone trackpad never attaches (and reload takeover fails). Important: relay never pings, half-open sockets fill the 4-cap; search requestId collides across remotes. Minors: origins advertise unbound LAN addr without --host and http under HTTPS, banner line placement; two labelsAndGuides arrays defeat selectToggleRows memo; JoinField doesn't write hash; import-graph dead type-only branch; :global in RemotePage css; duplicated 64/8 constants; no by-eye pass. Re-pairing needs dome reload (held for user). Safe deletions: focusNameFrom wrapper, glyphRowView args, two remoteMenu tests restating data, RemoteSearchInputs.
Ruling: fix everything except re-pairing (product question → user) in ONE fix dispatch, opus — Critical is in link/socket timing — cost if wrong: one more round.
Fix round: opus, BASE a86bcf7e9 → (running)
Fix round (final review): done — opus, a86bcf7e9→f38e2317f (8bdba4b18 link+relay, f95183474 dome side + shared constants, f38e2317f deletions). All 10 fixed; resize-on-open and requestId tests verified failing on old hook. Differently: hash write + "Change code" in RemotePage; remoteSearchMatches takes ranked rows (RemoteSearchInputs gone); page CSS in src/styles/remote.css; relay heartbeatMs param (10 s default). Intermediate commits 8bdba4b18/f95183474 don't typecheck alone (squash hides it).
CI green on f38e2317f (run 38944935615). Visual check + 2 product asks (welcome skip under ?remote; room in sessionStorage + Tab re-shows code) sent to user. LAN dev server :5173 (bg bz9koqu0f).
User ruling: ?dome and ?remote skip the welcome screen — cce29cb4c. Eye-check server moved to :5180 (bg bt9vmjw0s) — localhost:5173 was openspace wt's server on ::1 shadowing ours.

## RESUME HERE (2026-10-16 evening)
- HEAD cce29cb4c pushed to PR #916 (draft). CI green on f38e2317f; cce29cb4c (welcome skip) CI not yet confirmed — check `gh run list --branch dome-remote`.
- All 7 tasks + menu change + final-review fix round DONE. Final review done (one round, no re-review per lean protocol).
- Eye-check server: `npm run dev -- --host --port 5180 --strictPort` (bg shell bb167lti6). Do NOT use :5173 (openspace wt's server holds localhost:5173 on ::1). HTTPS not needed (dome on localhost = secure context; remote page needs no WebGPU). User stopped :5174 and old :5180 shells.
- WAITING ON USER: (1) by-eye verdict — dome http://localhost:5180/?dome&remote + remote via QR / http://192.168.10.248:5180/remote.html#<CODE>, checklist = plan DoD; (2) re-pairing ruling — my recommendation: keep room code in sessionStorage so a dome reload keeps the room, and Tab re-shows the code.
- After verdict: fix anything found → /feature-done (DoD audit, deletion audit, plan+spec to completed/, archive this ledger) → merge ONLY on the user's explicit word → cleanup (wt dome-remote branch stays in wt external-dome-controller; stop dev server; the old branch worktree-external-dome-controller is local-only leftovers of #888).

2026-10-16 — server now HTTPS: `SKYMAP_HTTPS=1 npm run dev -- --host --port 5180 --strictPort` (shell bnggfpixj), mkcert pair in wt `.certs/` for 192.168.10.248/localhost/127.0.0.1. Dome at https://192.168.10.248:5180/?dome&remote (WebGPU needs a secure context on a LAN IP). User attested: phone pairs and connects over wss. Still open: the rest of the DoD by-eye list, the re-pairing ruling (sessionStorage room code — NOT approved yet).

2026-10-20 — user approved 'Add a phone' (remote button → togglePairing re-shows the dome's pairing overlay; hides on a hello from a not-live remote or a second press). Landed d0c99fd60, pushed; CI watch bzfhf613u. The sessionStorage re-pairing idea was never approved; don't build it unasked.

2026-10-20 — user: ?dome must start with UI hidden; in dome mode the pairing card must sit where Earth sits (camera forward = tiltDeg from zenith → NDC (0,−τ/90)) and be pre-warped for the fisheye (it showed as a huge distorted square at the zenith). Dispatched Sonnet agent: commit 1 uiHidden seed, commit 2 warpCardToFisheye util + dome canvas variant of PairingOverlay. Not pushed by the agent; review + push after.

2026-10-20 — landed 4c1d79a8b (?dome panels hidden, Tab shows) + 9d1125db4 (warpCardToFisheye, directionToFisheye, DomePairingCard; half-width 12° in PAIRING_CARD_HALF_WIDTH_RAD). Shot via temp HTTP :5181 (shot tool rejects the mkcert cert) confirms card over Earth, panels hidden. Pushed; CI watch b1s5ajho8. Open: card size (12° vs 16–20°) for scanning off a real dome.

2026-10-20 — user: phone can't scan the warped card off a flat monitor. Landed 292c617d8+97e9ccf3e (4×4 supersampled warp, 36° wide, 1200×1440 flat card) and 4ac32f172 (flat corner QR top-left in dome mode, outside the disc; 11vmin min fits a square screen's corner). Verified both QRs are the same unmirrored pattern by eye. CI watch pending.
2026-10-20 — user attested: phone scans the corner QR and pairs.

## RESUME HERE (2026-10-20, before restart for claude-dash MCP)
- Branch `dome-remote`, PR #916 (draft), HEAD 4ac32f172, CI green. Tree clean.
- Dev server: `SKYMAP_HTTPS=1 npm run dev -- --host --port 5180 --strictPort` (mkcert pair in wt `.certs/`); dome at https://192.168.10.248:5180/?dome&remote. It dies with the session — restart it after relaunch. The shot tool rejects the mkcert cert: shoot via a temporary plain-HTTP `npm run dev -- --port 5181 --strictPort`, then stop it.
- Attested by user: HTTPS pairing over wss; corner QR scans and pairs.
- NEXT: send the remaining DoD by-eye items as ONE claude-dash `ask_user` call, one `kind: "check"` per item with a link: phone orbit+pinch; tap/double-tap; laptop right-drag pan + wheel; search→go to + Home; tour start/prev/pause/next; exhibit + clip then exit; time pause/rate/direction/date/live; each label toggle; Add a phone (second phone joins); close remote mid-drag stops sky ≤3 s + reload resumes. The user rejected the AskUserQuestion version wanting to clarify something — ask what first.
- Then fix failures → /feature-done (deletion audit, plan+spec → completed/, archive ledger) → merge ONLY on the user's explicit word.

2026-10-20 — dash checklist (ask 4gfm): PASS orbit+pinch, tap/double-tap, search+Home, tours, exhibit+clip, time, label toggles. LEFT OPEN: laptop pan+wheel, Add a phone, drop-out+resume — re-ask at the /feature-done gate.
2026-10-20 — user marked the remaining three PASS: laptop pan+wheel, Add a phone, drop-out+resume. Full DoD by-eye list attested.
2026-10-20 — deletion audit (opus, legacy): report deletion-audit-branch.md; safe-now applied fef585d8e (−73 net LOC), pushed, CI watch bg9jgecui. R1 (drop remote.html from prod build until DO relay) + R3 (keep Trackpad CSS test) asked in dash (ask vRH3). Suite: 1 local-only fail factRepeats (stale dist/ site build; CI green). Then /feature-done moves.
2026-10-20 — rulings: R1 KEEP remote.html in the production build (user overrode my drop recommendation); R3 KEEP the Trackpad CSS test. /feature-done READY: plan ticked, spec + plan → completed/, ledger archived.
