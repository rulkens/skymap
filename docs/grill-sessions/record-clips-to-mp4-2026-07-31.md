# Grill Session: Recording standalone clips to mp4 — 2026-07-31

Source: a `/wt` session that opened with the question "can we render clips to mp4
right now?" — the answer being no, and the design of what it would take.

The offline recorder (`tools/record/recordTour.ts`, `npm run record-tour`) plays a
tour under CDP virtual time and encodes to mp4. Its only seam into the app is
`window.__skymapRecorder`, which exposes `ready` and `startTour(id, beats)` — so
tours are recordable and standalone clips are not. Of the 22 entries in
`clipRegistry`, the 16 `tourXxx` clips are reachable as grand-tour beats; the six
standalone ones (`flyout`, `earthFlyout`, `flowOrbit`, `flyPathDemo`,
`famousFlythrough`, `cosmicFlows`) belong to no tour and cannot be filmed at all.

---

## Q1: What is a clip take for?

**The question:** Is a clip take an iteration aid (scrub the choreography you're
tuning) or a deliverable (social posts, docs GIFs, a paper figure)? This drives
determinism guarantees, scene setup, and default resolution, so it goes first.

**Considerations:**

- **Option A (iteration tool):** Fast 1080p artifacts for scrubbing frame-by-frame
  while tuning `flyPathDemo` / `famousFlythrough`. Needs repeatability but not
  archival quality. Cheapest — no scene work at all, because you're judging motion,
  not composition.
- **Option B (publishable shorts):** The take is the artifact. Wants 4K/60,
  deterministic re-takes, and a composed opening scene rather than "whatever
  `?cinema` booted into". The harness already does 4K/60 for tours, so the
  resolution half is free; the scene half is not.
- **Option C (both, A first):** Build the mechanism for both, accept that scene
  composition is the part that distinguishes them.

**Decision:** Option C, with B wanted as soon as possible. That makes scene control
a first-class concern rather than a follow-up — tours never had this problem
because every beat carries `captureScene` / `captureSettings`, and a standalone
clip has no beat.

---

## Q2: Where does a standalone clip's opening scene come from?

**The question:** Given Q1, a clip take needs a deliberate look. What supplies it?

**Considerations:**

- **Option A (in-clip cues):** Author `scene()` / `show()` / `hide()` into the clip
  itself. `BeatData`'s docstring already declares this the canonical home:
  _"Scene changes (visibility, settings) are expressed as in-clip
  `show()`/`hide()`/`scene()` cues."_ Zero harness change; the recorder stays
  ignorant of settings. Con: each publishable clip needs cues added, and a clip
  that dresses its own scene behaves differently in the debug panel than it does
  today.
- **Option B (harness-side preset):** `--scene <name>` selects a `SettingsSnapshot`
  the hook applies before `startClip`. Decouples what the clip does from how the
  frame is dressed, so one clip can be filmed against several looks. Con: a new
  preset registry plus a new hook method — a second place scene state comes from.
- **Option C (synthesize a one-beat tour):** Reuse `visitBeatSaga`'s fold,
  `FOLD_SETTLE_MS`, captions and scene restore wholesale. Con: the hook would take
  a `Tour` _object_ across `page.evaluate` rather than an id, so the whole
  `ClipData` graph must survive structured-clone, and `TourId` stops being a closed
  union. It also inverts the id-resolution direction `installRecorderHook` was
  built around.

**Decision:** Option A. It adds no second source of truth — it uses the one that
already exists, and keeps the harness change to the seam alone. Option C was
rejected fairly hard: free machinery, but it serializes authored clip data through
CDP, which works right up until a cue holds a function. Option B remains the answer
if "dressed for film, plain in the panel" ever becomes a requirement.

---

## Q3: Are clip takes reproducible?

**The question:** `watchClipSaga` freezes the sim clock at clip start by deriving
from live wall time (`deriveSimDays(priorTime, nowMs)`), and `earthFlyout` is
explicitly instant-dependent — it opens on Earth's position at that instant. The
same command run twice, a week apart, produces a different film. Tours share the
property; nobody noticed because the grand tour's clips are all static.

**Considerations:**

- **Option A (always pin):** The harness resolves an instant at take start and
  passes it as `#t=<ISO>` (the `t` row already exists in `HASH_PARAM_SOURCES`),
  printing it in the banner. Reproducible by construction; re-taking a specific
  film is copy-paste. Cost: URL composition changes (today `page.goto` builds
  `${url}/?cinema`, which would mangle a hash passed via `--url`), plus a banner
  line.
- **Option B (pin on request):** `--sim-time <ISO>` optional, absent means live.
  Smaller, but the default take is the non-reproducible one, and you discover that
  only when a re-take doesn't match.
- **Option C (don't pin):** Accept it; `earthFlyout` is the only affected clip
  today.

**Decision:** Option A, with `--sim-time` as the override. The harness's whole
premise is that a take is a deterministic function of the virtual clock — the Task
1 spike asserts two runs are pixel-near-identical. Leaving the _sim_ clock live
undercuts that guarantee at the one user-visible place. Option B makes the safe
path opt-in, which is backwards for output meant to be published. Note the
distinction the implementation must keep straight: this pins the **sim** clock, not
the virtual **frame** clock; they are independent and both must be right.

---

## Q4: One recorder or two?

**The question:** Everything in the harness is keyed to "tour" — `RecordOptions.tourId`,
`captureTour`, `tourFrameCap`, `defaultOutName({tourId})`, `__recorderTourStatus`.
A second subject turns "what to play" into a two-case union.

**Considerations:**

- **Option A (one entry, `--clip <id>`, internal `Take` union):**
  `{kind:'tour', id, beats} | {kind:'clip', id}` decides exactly three things — the
  kick evaluate, the frame cap, and whether to burn `FOLD_SETTLE_MS`. Launch, boot
  retry, virtual-time loop, capture clip/scale, ffmpeg pipe and ffprobe are all
  subject-agnostic and shared verbatim.
- **Option B (a second script over extracted helpers):** Forces the capture core
  into its own module. Cleaner separation, but the extraction is most of the work
  and the two scripts would be ~90% identical argv/banner/ffmpeg boilerplate.
- **Option C (one positional, disambiguated by registry lookup):** `--beats` becomes
  conditionally valid and an id present in both registries is silently ambiguous.

**Decision:** Option A. The union is small and near the top of `captureTour`; the
alternative duplicates a capture loop whose comments encode hard-won CDP findings,
which would then drift. Option C rejected: flag validity must not depend on which
registry a string happened to hit.

Two sub-decisions folded in: **rename `recordTour.ts` → `record.ts`** (the old name
stops being true, and half-renames aren't tolerated here — via `npm run move-files`),
and **keep `npm run record-tour` working** as an alias alongside a new
`npm run record-clip`, since docs and muscle memory point at it.

---

## Q5: Is frame 0 dressed?

**The question:** A windowed tour take burns `FOLD_SETTLE_MS` before capturing,
because scene reconstruction happens outside any beat's timeline. In-clip
`scene()` / `hide()` cues are different — they sit **on the clip's own timeline**.
So what does the film's first frame show?

**Considerations:**

- **Option A (authoring rule):** Frame 0 is dressed only if the clip's scene cues
  are instant at t=0; author a fade instead when a dissolve-in is wanted. No harness
  feature — document it in `tools/record/README.md`.
- **Option B (`--settle <sec>` flag):** Burn virtual time before capture. Cheap to
  add and wrong: the analogous settle is incoherent for clips, because burning
  virtual time to let dressing land also burns the opening of the clip. A film that
  looks right is one whose opening you've discarded.
- **Option C (split dressing off the timeline):** Give `Clip` an opening-scene field
  applied before the timeline runs, making dressing instant by construction. Most
  correct, biggest change — a new field on an authored type plus a play-path change
  affecting the dev panel and the tour equally.

**Decision:** Option A, with C noted as the thing to reach for on repetition — the
second time an instant-cue preamble gets copied between clips is the signal. The
known consequence, accepted deliberately: the first publishable take will look
wrong on frame 0 until its cues are added.

---

## Q6: Does v1 include captions?

**The question:** Tours get captions free — `TourOverlayContainer` renders each
beat's `BeatCaption` as real DOM and the recorder screenshots the page, so the
caption _is_ the film's caption. A clip has no beat, so a clip take is pure image.

**Considerations:**

- **Option A (pure image):** No caption, no title card. Titles added in post.
  Smallest scope, ships fastest.
- **Option B (`--caption` flag):** Harness passes title/body to the hook, rendered
  through the existing `TourCaption`. Reuses designed typography; adds a hook method
  and a caption path that isn't beat-driven.
- **Option C (caption on the `Clip`):** `Clip` already carries `label`; add a caption
  field rendered whenever a clip plays, dev panel included.

**Decision:** Option A. Any clip worth publishing is short enough that a title card
is a trivial post step, and B and C both create a second source of caption truth
alongside `BeatCaption` for a payoff that can't be judged before watching a few
takes. The counter-argument was aired and set aside: doing labels in post means the
label isn't reproducible from the repo, which is the exact property Q3 bought — if
a paper figure or docs page needs a labelled clip, C is the one to build.

---

## Q7: How much process?

**The question:** CLAUDE.md gates substantial features on refactor-ground → spec →
plan → subagent execution. This change is medium: a hook method and type, a CLI
union, a file rename, two small `tools/utils/` helpers, a URL-composition change,
docs — roughly 8–10 files.

**Considerations:**

- **Option A (short plan, no spec):** Plan with bite-sized TDD tasks, executed by
  subagents, carrying a "Ground preparation" section naming the rename and the
  capture-core generalization as prep commits. This grill is the design record.
- **Option B (full ceremony):** refactor-ground run, then spec, then plan. Correct
  by the letter of the convention; adds a round-trip for a shape now fixed across
  six decisions.
- **Option C (no plan):** Straight to subagent tasks off this transcript.

**Decision:** Option A. The convention exists to stop design happening inside the
code, and it hasn't — it happened here. The standalone refactor-ground run is
skipped but its output is kept: the plan's Ground-preparation section states the two
prep moves and why they are growth rather than bolt-on. Option C rejected —
subagents without a written plan produce work that doesn't compose.

**Prep-vs-feature PR shape:** prep commits (the rename, and pulling the capture core
out from under the tour-specific bits) ride the **same PR** as the feature, as
separate commits. The rename is meaningless without the feature that motivates it,
and a reviewer wants both halves together.
