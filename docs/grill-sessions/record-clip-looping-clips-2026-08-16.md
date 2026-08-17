# Grill Session: record-clip handling of looping clips — 2026-08-16

Source: follow-up to PR #557 (earthUniverseLoop), which introduced clip-level
`loop: true` and documented that `record-clip` cannot record such a clip — it
polls the in-page clip-end promise (which never resolves for a looping clip)
and hard-throws when the frame cap (`clipDurationSec × 1.25 + 10 s`) is
exceeded.

Goal: make `record-clip` produce a useful artifact from a looping clip instead
of aborting.

---

## Q1: What should the recorded artifact of a looping clip be?

**The question:** A looping clip has no natural end, so "record the clip" is
underdefined. What video should come out of `record-clip --clip
earthUniverseLoop`?

**Considerations:**

- **Option A (exactly one cycle, cut for seamless looping):** frames
  `[0, duration)`, deliberately *excluding* the final frame. Because a looping
  clip is authored so pose(duration) ≡ pose(0) (the 2π-per-cycle seam
  contract), including both endpoints would duplicate a frame at the splice
  when a player loops the mp4. This cut makes the video itself loop
  seamlessly.
- **Option B (one cycle plus the closing frame):** simpler mental model
  ("record until the clip would have ended"), but the resulting video stutters
  by one duplicated frame at every loop of playback.
- **Option C (N cycles via a `--cycles` flag):** more machinery; only useful
  for long ambient videos without player-side looping. Nothing needs it today.

**Decision:** Option A. The whole point of the seam contract is that the video
can loop forever in a player; `[0, duration)` is the only cut that makes the
mp4 itself seamless. Option C can be layered on later if a real need appears.

## Q2: Where should the "stop after one cycle" logic live?

**The question:** Something has to end the recording after one cycle — the
recorder, or the playback engine?

**Considerations:**

- **Option A (recorder-side, frame-count based):** the recorder already
  computes `clipDurationSec` from the compiled clip and drives virtual time
  frame by frame. For a looping clip it records exactly `round(duration × fps)`
  frames and stops — never waiting on the clip-end promise at all. Zero engine
  changes; loop semantics stay purely an engine behaviour.
- **Option B (engine-side `maxCycles: 1` / suppress-loop option on
  `playClip`):** the clip ends naturally and the recorder's existing
  poll-until-done path works untouched. But the natural end lands *at*
  `elapsed = duration`, which includes the closing frame Q1 excludes; the frame
  count becomes timing-dependent rather than arithmetic; and it adds a
  playback-API knob whose only consumer is the recorder.

**Decision:** Option A. The recorder is the component that already knows about
frames, fps, and caps; "one cycle" is arithmetic on numbers it already has.
Deterministic frame count is exactly what a seamless cut needs, and the engine
API stays clean.

## Q3: Should one-cycle recording be automatic, or an explicit CLI flag?

**The question:** How does the recorder know to switch into one-cycle mode?

**Considerations:**

- **Option A (automatic):** detect `loop: true` on the compiled clip data and
  switch modes, logging e.g. `looping clip — recording one seamless cycle
  (8880 frames)`. Zero new CLI surface; the clip's own declaration is the
  source of truth.
- **Option B (explicit `--one-cycle` flag, error without it):** ceremony for
  no real choice — there is nothing else a recorder could sensibly do with a
  looping clip, so the flag is mandatory boilerplate, and forgetting it
  reproduces today's bug (hard-throw at the frame cap) with extra steps.

**Decision:** Option A. The `ClipData.loop` flag already says everything the
recorder needs. A `--cycles N` flag can arrive with the need that justifies it.

## Q4: What if `duration × fps` is not a whole number of frames?

**The question:** `earthUniverseLoop` is exact (148 s × 60 fps = 8880), but
nothing forces future looping clips to be. A video of N frames at a given fps
has length N/fps; if that differs from the true cycle duration, the loop
splice lands sub-frame off the authored seam.

**Considerations:**

- **Option A (round to nearest frame, log a notice):** the residual error is
  under half a frame interval of pose drift at the splice — invisible at these
  camera speeds. The notice tells the author their cycle length is slightly
  off-grid for the chosen fps.
- **Option B (hard-error on non-integral counts):** forces fps-aligned cycle
  durations; turns an invisible imperfection into a build failure and makes
  the recorder brittle for no visual gain.

**Decision:** Option A. Round and log; preserve the author's ability to care
without punishing them when they don't need to.
