# Grill Session: `npm run shot` — 2026-10-05

Source: backlog line "`npm run shot` link screenshot" (deferred out of the deep-link arrival PR, #831),
plus the neighbouring line "`afterTwoFrames` guesses a drawn frame".

A command that opens any deep link in a headless browser, waits until the app has arrived, and saves a
PNG. Its main job is an agent's debugging loop: shoot the running dev server, look, and hand the shot to
the user in the dash for a quick check.

---

## Q1: Primary usage pattern

**The question:** Who runs the tool and how often? Server start and app boot dominate the cost of a
shot, so the usage pattern decides what is worth optimising.

**Considerations:**

- **Option A (agent debug loop):** many shots per session with code changing between them. Per-shot
  latency is the cost that matters; cold start should be paid once.
- **Option B (one-off by hand):** latency barely matters; convenience of a self-starting server does.
- **Option C (batch):** many links per invocation for before/after sets.
- **Option D (all equally):** no priority, so nothing gets optimised.

**Decision:** Option A. The user added that the shots should come from the dev server that is already
running with the code changes, and be served to them in the dash for quick checks.

## Q2: Which server a shot talks to

**The question:** The earlier ask was "ideally it starts its own server"; the new one is "use the
running dev server". `perf` defaults to `localhost:5173`, which in a worktree silently measures another
branch.

**Considerations:**

- **Option A (`--url` reuses, otherwise spawn, no default URL):** fast when a server runs, still works
  cold, and there is no default that can point at the wrong branch.
- **Option B (always reuse, `--url` required):** smallest tool, but fails cold.
- **Option C (default to 5173, `--serve` to spawn):** repeats the `perf` trap.
- **Option D (always spawn):** what the backlog line says; pays server start on every shot.

**Decision:** Option A.

## Q3: Process model

**The question:** Does each shot start cold, or does a browser or page stay alive between shots? Code
changes between shots, so a warm page depends on HMR or a reload to show them.

**Considerations:**

- **Option A (stateless, several links per run share one browser):** no stale-code risk and no
  lifecycle to maintain. Measure before adding anything warm.
- **Option B (stateless, one link per run):** simplest, but before/after pairs pay launch twice.
- **Option C (daemon with a warm page):** fastest in theory; adds a lifecycle and stale-state risk.
- **Option D (reuse the user's open Chrome tab over remote debugging):** disturbs the user's tab.

**Decision:** Option A, reusing the running dev server, because "we really want fast iteration".

## Q4: Is the measured speed enough

**The question:** Having measured, do we ship stateless or spend effort on speed now?

Measured against main's dev server (`:5173`, 1600×900, DPR 1): `tsx` start ~1 s, Chromium launch
0.7 s, app boot to `ready` 3.3 s, screenshot 0.3 s — about 5.6 s per shot. Reloading a warm page still
took 3.0 s. Each extra link in the same run adds ~3.6 s.

**Considerations:**

- **Option A (ship stateless at ~5.6 s):** boot dominates and a warm browser saves only ~1.7 s.
- **Option B (parallel contexts within one run):** helps batches only; GPU contention unmeasured.
- **Option C (profile the 3.3 s boot, starting with the ~1 s `ready` debounce):** the real lever, but
  an app-wide question, not a shot-tool one.
- **Option D (daemon anyway):** 30% faster for a lifecycle to maintain.

**Decision:** Option A; revisit only if the loop feels slow in use.

## Q5: Generic hook shape

**The question:** The user ruled that the page hook must become generic. `capture-featured` borrows
`window.__skymapPerf` (installed only under `?perf`, which also turns on GPU timing) for `ready`,
`dispatch` and `setPose`; the rest of that hook is perf-only. The recorder has a second hook with its
own `ready`.

**Considerations:**

- **Option A (one `window.__skymap` base hook; perf and recorder hooks keep only their own
  members):** each tool depends only on what it uses, and the base needs no GPU timing.
- **Option B (same, with perf and recorder nested under the one global):** one global, but couples the
  three install paths.
- **Option C (rename `__skymapPerf` to a neutral name):** cosmetic; the perf members stay braided in.
- **Option D (a third small hook for shot):** three overlapping hooks.

**Decision:** Option A: `ready`, `dispatch`, `getState`, and `nextFrame` once it exists. Follow-on,
settled without a question: `capture-featured` sets its pose through `dispatch` and drops `?perf`;
`setPose` stays perf-only.

## Q6: When the base hook is installed

**The question:** Does a shot URL equal the share link, or the link plus a flag? And must `?perf` and
`?cinema` each imply the base hook?

**Considerations:**

- **Option A (always, every build, `ready` created lazily):** no gate code, no implication rules, and
  the shot URL is the share link. The app has no auth or server state, so `dispatch` on `window` gives
  nothing the console lacks.
- **Option B (URL flag, implied by `?perf` and `?cinema`):** parity with existing gates; adds the
  implication rules.
- **Option C (always in dev, flag in production):** two behaviours to keep in mind.
- **Option D (dev only):** no shots of a production build.

**Decision:** Option A.

## Q7: Drawn-frame guarantee

**The question:** `arrivalSaga`, `installPerfHook` and `captureScene` wait two animation frames and
assume the on-demand render loop woke. Does `renderScheduler.nextFrame()` (backlog) land with this
work?

**Considerations:**

- **Option A (prep in this work: add `nextFrame`, replace all three guesses, expose on the base
  hook):** a debugging shot of a stale frame misleads, and the base hook is its natural home.
- **Option B (separate prep PR first).**
- **Option C (shot awaits `ready` only; `nextFrame` stays backlogged):** a fourth user of the guess.
- **Option D (`nextFrame` for the shot only):** leaves three guesses beside the real thing.

**Decision:** Option A. Q15 later moved all prep into its own PR.

## Q8: What the tool runs when it starts its own server

**The question:** `record.ts --serve` has a build-then-`vite preview` path; a dev server starts in a
second or two but does a one-time dependency-optimise reload that `bootHookedPage` already retries
through.

**Considerations:**

- **Option A (dev server on a free port, killed after the shot):** recommended; smallest.
- **Option B (production build + preview, shared with the recorder):** a build per shot.
- **Option C (dev by default, `--build` for the production path):** both, at the cost of lifting the
  build/preview helpers out of `record.ts`.
- **Option D (drop spawning):** reverses Q2.

**Decision:** Option C, against the recommendation. The user wants production-build shots available.

## Q9: What a shot shows

**The question:** `capture-featured` forces `?cinema` and strips labels; a debugging shot has other
needs. Query flags in the link (`?cinema`, `?dome`, `?gpuTimings`) are kept either way.

**Considerations:**

- **Option A (exactly what the link shows):** recommended; hiding the UI is already one URL flag.
- **Option B (canvas only by default, `--ui` to include panels):** wrong default for UI checks.
- **Option C (link as given, plus `--hide-labels` and `--hide-ui`):** two small flags over existing
  machinery (`cinema`, the label-declutter actions).
- **Option D (two files per shot):** doubles output for every run.

**Decision:** Option C, against the recommendation.

## Q10: Default size and DPR

**The question:** What frame does a shot use with no flags? `--size` and `--dpr` override.

Measured on an Earth link, boot ~3.5 s in all cases: 1600×900 DPR 1 — 1.7 MB, shot 0.4 s;
1600×900 DPR 2 — 5.1 MB, shot 0.9 s; 1280×720 DPR 2 — 3.1 MB, shot 0.65 s.

**Considerations:**

- **Option A (1600×900, DPR 1):** recommended; small and fast, but more aliased than the user's
  ~DPR 2.2 screen.
- **Option B (1600×900, DPR 2):** matches the screen; 3× the bytes and half a second more.
- **Option C (1280×720, DPR 2):** screen-accurate pixels in a smaller frame.

**Decision:** Option B, after comparing the three example shots: the shot should match what the user
sees.

## Q11: Output location

**The question:** Where do shots land without `--out`, and what does the run print, so shots can be
handed to the dash and before/after pairs do not overwrite each other?

**Considerations:**

- **Option A (gitignored folder, `<subject>-<timestamp>.png`, one absolute path per shot on
  stdout):** follows the recorder's `recordings/` precedent; bare paths pipe.
- **Option B (OS temp):** nothing in the repo, but hard for the user to find.
- **Option C (`--out` / `--out-dir` required):** friction on every run.
- **Option D (fixed `latest.png`):** destroys before/after pairs.

**Decision:** Option A, in `data/shots/`.

## Q12: Failure behaviour

**The question:** `bootHookedPage` has no timeout on `ready`, so a link whose subject never resolves
would hang the loop. What happens then, and when the page logs errors?

**Considerations:**

- **Option A (`--timeout`, default 30 s; on expiry shoot anyway and exit non-zero; page errors to
  stderr without affecting the exit code):** a picture of the broken state is the most useful output.
- **Option B (timeout aborts with no image).**
- **Option C (any page error fails the run):** a stray 404 would block every shot.
- **Option D (no timeout).**

**Decision:** Option A.

## Q13: Eye-check convention

**The question:** CLAUDE.md says "to verify a UI change, ask the user to look". How does that change?

**Considerations:**

- **Option A (agent shoots, looks, then sends the shot plus its deep link as a dash check):** blank or
  broken frames are caught before they cost the user attention; the user keeps the verdict.
- **Option B (shoot and attach, never judge).**
- **Option C (tool on request only).**
- **Option D (shots replace the user's check):** removes the user's verdict.

**Decision:** Option A.

## Q14: Wrong-server guard

**The question:** With `--url`, an agent in a worktree can pass another branch's port and get a
convincing shot of the wrong code. `perf` has the same trap and only a doc warning.

**Considerations:**

- **Option A (vite injects its project root, the base hook exposes it, the tool warns on stderr on a
  mismatch):** about ten lines; still allows shooting main on purpose.
- **Option B (hard failure unless `--any-server`):** an extra flag for a deliberate act.
- **Option C (no guard, print the URL).**
- **Option D (backlog it for shot and perf together).**

**Decision:** Option A.

## Q15: PR shape

**The question:** Prep grew after Q7: `nextFrame` replacing three guesses, the base hook with perf,
record and capture moved onto it, and the build/preview helpers lifted out of `record.ts`. Does it
still ride the shot PR?

**Considerations:**

- **Option A (one PR, prep commits first).**
- **Option B (two PRs: prep, then the shot tool):** prep changes three working tools; landing it alone
  isolates any regression in perf, record or capture.
- **Option C (three PRs).**

**Decision:** Option B, superseding Q7's "in this PR".

---

## Settled without a question

- **Input form:** one or more share URLs or bare hashes; the origin is discarded and query flags kept.
- **Readiness seam:** `?perf` only installs the perf hook and turns on GPU timestamp queries; it does
  not change what is drawn.

## Resolved during the session

- **`#focus=body-saturn` landed inside Saturn — stale server, not a bug.** The `:5173` server was the
  main checkout on a branch six commits behind `origin/main`, without the deep-link arrival work
  (#831); there the home commit's Earth distance (27,626 km) was held against Saturn's centre. On a
  server running current `origin/main` the same link arrives at 252,152 km (4.33 radii) and Mars at
  14,798 km. This is the wrong-server trap Q14's guard exists for. The Q4 and Q10 measurements were
  taken on that older server.
