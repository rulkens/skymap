# SDD ledger — plan: docs/superpowers/plans/2026-09-01-camera-pivot.md

Spec: docs/superpowers/specs/2026-09-01-camera-pivot.md (binding authority).
Branch: camera-pivot, worktree .claude/worktrees/camera-pivot, draft PR #647.
Plan commit: 630993b50 (includes controller's pre-flight fix: T20 files header
path corrected animation/evaluateClip.ts → camera/evaluateClip.ts).
Dev server: port 5173 (bg shell bfu6emena) — leave running; perf tasks MUST use
`--url http://localhost:5173`.
Harness note: no TodoWrite tool in this session — this ledger is the task list
(Rule 1 satisfied here; rebuild from this file + git log after compaction).

## Pre-flight scan (2026-09-01)

Shared-file / interface pairs:

| Tasks | Producer → consumer | Finding |
|---|---|---|
| T2 → all | PoseFrame/BodyFixedPose/FramedCameraPose/SURFACE_REGIME | verbatim from spec §3; consistent |
| T3 → T13 | poseFrameConversion: T3 to/from arms, T13 adds resolveWorldArm | consistent; same module licensed by §10 |
| T3 ↔ T4 | one-seam sweep excludes poseFrameConversion as seam | consistent |
| T5 → T17 | maxTiltRad consumed by ceiling enforcement | consistent (orientation-only, eye fixed) |
| T7 → T10/T16 | cursorRayBodyLocal ray shape {originM,dir} | matches anchoredDragRotation params |
| T9 → T11/T16 | surfaceFloorM consumed by zoom + controller | ordered correctly |
| T12 → T15 | regimeArmFor pure; gesture-in-flight rule at caller | both ends agree (T12 text assigns to T15) |
| T13 ↔ T15 | runFrame: T13 mechanical, T15 fold | serial, disjoint concerns |
| T13 → T14 | frameContext threads FramedCameraPose beside resolved pose | consistent |
| T13 ↔ T16 | drainInput/cameraDrivers touched by both | serial; T16 adds body-arm routing only |
| T13 ↔ T19 | watchFlyToLonLatSaga: T13 type-mechanical, T19 semantic | serial |
| T13 ↔ T20 | tween/clip rows absolute in T13, tagged in T20 | explicit in both tasks |

Per-task self-consistency: all tasks' tests match their stated code; T5's
descending smoothstep edge order flagged in-plan as deliberate; T1/T21 use the
same worktree-URL trap wording. Ground facts (files, constants, primitives,
seam sites) verified by controller before execution — all exist.

Watch item (not a conflict): T12's noStoredRegimeFlag scan
(/surface|regime|engaged/i boolean declarations) vs T16's SurfaceGesture fields
— if spec §3's SurfaceGesture carries a boolean matching the regex, the scan
needs a seam exclusion. Resolve at T16 review if it bites.

## Pre-execution rulings (plan-author open questions)

Ruling: packaging — moot; P5/P6 landed as #648 before execution. No cost.
Ruling: engageable roster stays body-blind (SCENE_BODIES ∩ bodyStates, Sun and
Sgr A* included) — literal spec §4 + §12-R2; harmless by construction (no
observable on engage). Cost if wrong: one-line filter in regimeArmFor + test
tweak. Surfaced to user; narrow later if they object.
Ruling: T13 stays one mechanical task — splitting produces non-compiling
intermediates; large diff accepted as review cost. Cost if wrong: one big
review round.
Ruling: feel constants (tiltFullHR 0.02, grazing 0.05, zoom clamp) stay open
until T22 user gate — per spec Q5. No cost; T22 owns them.

## Model plan

opus: T3, T10, T13, T15, T16 (+T17 rides same seat's area), final review.
sonnet: T1, T4–T9, T11, T12, T14, T17–T20 implementers; task reviewers scale
sonnet default, opus for T13/T15/T16 packages.
T21 = measurement (sonnet), T22 = USER.

## Task log

### Task 1 baseline

Command: `npm run perf -- --url http://localhost:5173` (default poses, worktree
dev server confirmed reachable via `curl` before the run — HTTP 200).

```
> skymap@0.5.0 perf
> tsx tools/perf/measurePerf.ts --url http://localhost:5173


measuring 'earth-surface' (30 frames @ dpr 2) ...
earth-surface  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   25.0 ms/frame | 43.2 p90
    → ~40 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   54.1 ms/frame | 115.8 p90
  MERGED (production pass shape)
    group                  median  p90  share              %
    ────────────────────────────────────────────────────────
    hdr·NEAR0                 3.5  6.1  ██▎              15%
    star-aggregates·NEAR0     3.2  5.8  ██▏              14%
    foreground:0·NEAR0        3.2  6.0  ██▏              14%
    bloom                     2.4  5.4  █▌               10%
    swap·COSMO                2.1  3.4  █▍                9%
    hdr→swap                  2.1  3.3  █▍                9%
    swap·NEAR0                2.1  3.2  █▍                9%
    foreground:0→hdr          2.0  4.7  █▎                9%
    foreground:0·BODY[0]      1.8  4.2  █▏                8%
    hdr·COSMO                 0.8  2.8  ▌                 4%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                     median  p90  share             %
    ──────────────────────────────────────────────────────────
    star-upsample                3.8  8.7  █▏               7%
    star-catalog                 3.6  8.0  █                7%
    near0-selection-ring         3.4  8.6  █                7%
    foreground-labels            3.4  8.5  █                7%
    labels                       3.3  8.5  █                6%
    bloom                        3.3  8.2  █                6%
    hdr→swap                     3.3  8.4  █                6%
    marker-lines                 3.3  8.5  █                6%
    star-points                  3.1  5.9  ▉                6%
    body-glints                  3.1  6.0  ▉                6%
    star-aggregates              3.0  5.9  ▉                6%
    orbit-trails                 3.0  7.5  ▉                6%
    foreground:0→hdr             2.7  6.2  ▊                5%
    atmosphere-shell·BODY[0]     2.5  6.1  ▊                5%
    cloud-shell·BODY[0]          2.4  5.9  ▋                5%
    earth·BODY[0]                2.3  5.9  ▋                4%
    star-spheres                 2.0  5.4  ▋                4%
    procedural-disks             0.2  2.9                   0%
    point-sprites                0.2  2.6                   0%
    textured-disks               0.2  2.9                   0%
  EST. PER-PASS FLOOR ≈ 0.0 ms  (hdr·COSMO)
    → point-sprites ≈ 0.2 ms real
    → procedural-disks ≈ 0.2 ms real
    → textured-disks ≈ 0.2 ms real
  EST. PER-PASS FLOOR ≈ 2.6 ms  (hdr·NEAR0)
    → star-points ≈ 0.5 ms real
    → orbit-trails ≈ 0.4 ms real
    → body-glints ≈ 0.4 ms real
    → star-catalog ≈ 1.0 ms real
    → star-upsample ≈ 1.2 ms real
  EST. PER-PASS FLOOR ≈ 1.8 ms  (foreground:0·BODY[0])
    → earth·BODY[0] ≈ 0.5 ms real
    → cloud-shell·BODY[0] ≈ 0.6 ms real
    → atmosphere-shell·BODY[0] ≈ 0.7 ms real
  EST. PER-PASS FLOOR ≈ 2.3 ms  (swap·COSMO)
    → marker-lines ≈ 1.0 ms real
    → labels ≈ 1.1 ms real
  EST. PER-PASS FLOOR ≈ 2.4 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 1.0 ms real
    → foreground-labels ≈ 1.0 ms real
  SUMMARY
    ⚠ Over the 60fps budget (25.0 of 16.7 ms — ~40 fps ceiling).
    Hottest pass: hdr·NEAR0 — 3.5 ms, 15% of MERGED GPU time.
    Per-pass floor ≈ 1.8 ms; instrumented per-layer total inflated ~29.1 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'solar-system' (30 frames @ dpr 2) ...
solar-system  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   27.3 ms/frame | 56.8 p90
    → ~37 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   34.5 ms/frame | 67.2 p90
  MERGED (production pass shape)
    group                  median  p90  share              %
    ────────────────────────────────────────────────────────
    hdr·NEAR0                 3.2  8.3  ██▎              15%
    foreground:0·NEAR0        2.8  7.8  ██               13%
    star-aggregates·NEAR0     2.7  8.3  █▉               13%
    swap·NEAR0                2.2  7.4  █▋               11%
    bloom                     2.2  7.1  █▌               10%
    hdr→swap                  2.2  7.1  █▌               10%
    swap·COSMO                2.2  7.1  █▌               10%
    foreground:0→hdr          1.6  6.7  █▏                8%
    foreground:0·BODY[0]      1.3  6.5  █                 6%
    hdr·COSMO                 0.6  4.1  ▍                 3%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                 median  p90  share              %
    ───────────────────────────────────────────────────────
    star-upsample            3.4  6.6  █▋               11%
    star-catalog             3.2  6.7  █▋               11%
    star-aggregates          2.8  8.0  █▍                9%
    star-points              2.8  8.1  █▍                9%
    orbit-trails             2.7  5.7  █▍                9%
    body-glints              2.7  6.2  █▎                9%
    near0-selection-ring     2.0  6.1  █                 6%
    foreground-labels        1.9  4.7  █                 6%
    bloom                    1.9  6.6  ▉                 6%
    labels                   1.9  6.1  ▉                 6%
    marker-lines             1.9  6.0  ▉                 6%
    hdr→swap                 1.8  6.0  ▉                 6%
    point-sprites            0.6  3.9  ▎                 2%
    procedural-disks         0.6  3.0  ▎                 2%
    textured-disks           0.4  4.5  ▎                 1%
  EST. PER-PASS FLOOR ≈ 0.3 ms  (hdr·COSMO)
    → point-sprites ≈ 0.3 ms real
    → procedural-disks ≈ 0.3 ms real
    → textured-disks ≈ 0.1 ms real
  EST. PER-PASS FLOOR ≈ 2.3 ms  (hdr·NEAR0)
    → star-points ≈ 0.5 ms real
    → orbit-trails ≈ 0.4 ms real
    → body-glints ≈ 0.4 ms real
    → star-catalog ≈ 0.9 ms real
    → star-upsample ≈ 1.1 ms real
  EST. PER-PASS FLOOR ≈ 0.8 ms  (swap·COSMO)
    → marker-lines ≈ 1.1 ms real
    → labels ≈ 1.1 ms real
  EST. PER-PASS FLOOR ≈ 0.8 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 1.1 ms real
    → foreground-labels ≈ 1.1 ms real
  SUMMARY
    ⚠ Over the 60fps budget (27.3 of 16.7 ms — ~37 fps ceiling).
    Hottest pass: hdr·NEAR0 — 3.2 ms, 15% of MERGED GPU time.
    Per-pass floor ≈ 1.1 ms; instrumented per-layer total inflated ~7.2 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'star-field' (30 frames @ dpr 2) ...
star-field  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   25.3 ms/frame | 56.1 p90
    → ~39 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   33.9 ms/frame | 62.1 p90
  MERGED (production pass shape)
    group                  median   p90  share              %
    ─────────────────────────────────────────────────────────
    star-aggregates·NEAR0     2.9   5.1  ██▏              14%
    hdr·NEAR0                 2.9   7.0  ██▏              14%
    foreground:0·NEAR0        2.7   6.9  ██               13%
    swap·NEAR0                2.3   7.9  █▋               11%
    bloom                     2.1  11.4  █▌               10%
    swap·COSMO                2.1   7.7  █▌               10%
    hdr→swap                  2.0   8.0  █▍               10%
    foreground:0→hdr          1.6   6.8  █▎                8%
    foreground:0·BODY[0]      1.5   6.0  █▏                7%
    hdr·COSMO                 0.5   2.2  ▍                 2%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                 median   p90  share              %
    ────────────────────────────────────────────────────────
    star-catalog             3.8  10.7  ██▍              15%
    star-upsample            3.8   6.3  ██▎              15%
    star-points              3.3   7.3  ██               13%
    star-aggregates          3.3   7.4  ██               13%
    bloom                    1.7   7.7  █                 7%
    foreground-labels        1.6   7.9  █                 7%
    hdr→swap                 1.6   6.9  █                 6%
    marker-lines             1.6   7.6  █                 6%
    near0-selection-ring     1.6   7.8  █                 6%
    labels                   1.6   7.8  █                 6%
    textured-disks           0.3   2.3  ▎                 1%
    point-sprites            0.3   2.9  ▏                 1%
    procedural-disks         0.3   1.4  ▏                 1%
  EST. PER-PASS FLOOR ≈ 0.1 ms  (hdr·COSMO)
    → point-sprites ≈ 0.1 ms real
    → procedural-disks ≈ 0.1 ms real
    → textured-disks ≈ 0.2 ms real
  EST. PER-PASS FLOOR ≈ 2.7 ms  (hdr·NEAR0)
    → star-points ≈ 0.6 ms real
    → star-catalog ≈ 1.2 ms real
    → star-upsample ≈ 1.1 ms real
  EST. PER-PASS FLOOR ≈ 0.5 ms  (swap·COSMO)
    → marker-lines ≈ 1.1 ms real
    → labels ≈ 1.0 ms real
  EST. PER-PASS FLOOR ≈ 0.5 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 1.1 ms real
    → foreground-labels ≈ 1.1 ms real
  SUMMARY
    ⚠ Over the 60fps budget (25.3 of 16.7 ms — ~39 fps ceiling).
    Hottest pass: star-aggregates·NEAR0 — 2.9 ms, 14% of MERGED GPU time.
    Per-pass floor ≈ 1.0 ms; instrumented per-layer total inflated ~8.6 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'milky-way' (30 frames @ dpr 2) ...
milky-way  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   36.4 ms/frame | 54.4 p90
    → ~27 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   53.3 ms/frame | 92.5 p90
  MERGED (production pass shape)
    group                  median  p90  share              %
    ────────────────────────────────────────────────────────
    hdr·NEAR0                 3.6  8.8  ██▎              15%
    foreground:0·NEAR0        3.5  8.5  ██▎              15%
    star-aggregates·NEAR0     2.7  7.0  █▊               12%
    bloom                     2.5  7.2  █▋               11%
    swap·COSMO                2.4  7.6  █▌               10%
    swap·NEAR0                2.4  7.6  █▌               10%
    hdr→swap                  2.3  7.4  █▌               10%
    foreground:0→hdr          1.7  6.5  █▏                7%
    foreground:0·BODY[0]      1.5  6.4  █                 7%
    hdr·COSMO                 0.7  3.9  ▌                 3%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                 median   p90  share              %
    ────────────────────────────────────────────────────────
    point-sprites           10.6  19.3  ███▋             24%
    bloom                    2.7   8.9  ▉                 6%
    milky-way                2.3   5.0  ▊                 5%
    milky-way-upsample       2.3   4.3  ▊                 5%
    star-catalog             2.3   7.2  ▊                 5%
    star-upsample            2.2   7.5  ▊                 5%
    marker-lines             2.2   8.5  ▊                 5%
    star-points              2.2   5.4  ▊                 5%
    hdr→swap                 2.2   8.5  ▊                 5%
    near0-selection-ring     2.2   8.5  ▊                 5%
    foreground-labels        2.2   8.5  ▊                 5%
    labels                   2.2   8.5  ▊                 5%
    milky-way-aggregate      2.1   4.7  ▊                 5%
    scalar-volume            1.9   4.4  ▋                 4%
    star-aggregates          1.2   3.2  ▍                 3%
    procedural-disks         1.1   2.0  ▍                 3%
    structure-markers        0.9   2.9  ▎                 2%
    volume-upsample          0.7   2.5  ▎                 2%
    textured-disks           0.4   1.4  ▏                 1%
  EST. PER-PASS FLOOR ≈ 2.6 ms  (hdr·COSMO)
    → point-sprites ≈ 8.0 ms real
    → procedural-disks ≈ -1.5 ms real
    → textured-disks ≈ -2.2 ms real
    → volume-upsample ≈ -1.9 ms real
    → structure-markers ≈ -1.7 ms real
  EST. PER-PASS FLOOR ≈ 1.5 ms  (hdr·NEAR0)
    → milky-way-upsample ≈ 0.7 ms real
    → milky-way ≈ 0.8 ms real
    → star-points ≈ 0.6 ms real
    → star-catalog ≈ 0.7 ms real
    → star-upsample ≈ 0.7 ms real
  EST. PER-PASS FLOOR ≈ 1.0 ms  (swap·COSMO)
    → marker-lines ≈ 1.2 ms real
    → labels ≈ 1.2 ms real
  EST. PER-PASS FLOOR ≈ 1.0 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 1.2 ms real
    → foreground-labels ≈ 1.2 ms real
  SUMMARY
    ✗ Over the 30fps budget (36.4 ms — ~27 fps ceiling).
    Hottest pass: hdr·NEAR0 — 3.6 ms, 15% of MERGED GPU time.
    Per-pass floor ≈ 1.5 ms; instrumented per-layer total inflated ~16.9 ms over merged.

measuring 'milky-way-outside' (30 frames @ dpr 2) ...
milky-way-outside  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   45.9 ms/frame | 70.3 p90
    → ~22 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   75.1 ms/frame | 110.4 p90
  MERGED (production pass shape)
    group                  median   p90  share              %
    ─────────────────────────────────────────────────────────
    hdr·COSMO                11.6  17.7  ████▎            29%
    hdr·NEAR0                 4.6   9.2  █▋               11%
    mw-aggregate·NEAR0        4.5   8.5  █▋               11%
    bloom                     4.4  10.3  █▋               11%
    hdr→swap                  4.2  10.0  █▌               10%
    swap·COSMO                4.1  10.0  █▌               10%
    swap·NEAR0                4.1  10.0  █▌               10%
    volume·COSMO              1.7   6.2  ▋                 4%
    star-aggregates·NEAR0     1.5   5.4  ▌                 4%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                median   p90  share              %
    ───────────────────────────────────────────────────────
    point-sprites          10.5  17.4  ██▏              14%
    milky-way-upsample      5.6   7.8  █▏                8%
    bloom                   5.4   8.6  █▏                7%
    labels                  5.1   8.9  █                 7%
    foreground-labels       5.1   8.9  █                 7%
    hdr→swap                5.0   8.8  █                 7%
    marker-lines            5.0   8.9  █                 7%
    milky-way-aggregate     5.0   7.5  █                 7%
    star-upsample           4.9   7.6  █                 7%
    star-points             4.9   7.4  █                 7%
    star-catalog            4.8   7.6  █                 7%
    milky-way               4.8   7.9  █                 7%
    scalar-volume           2.0   5.5  ▍                 3%
    procedural-disks        1.2   3.2  ▎                 2%
    star-aggregates         1.0   2.8  ▎                 1%
    structure-markers       1.0   3.2  ▎                 1%
    volume-upsample         0.8   3.2  ▏                 1%
    textured-disks          0.7   2.9  ▏                 1%
  EST. PER-PASS FLOOR ≈ 0.5 ms  (hdr·COSMO)
    → point-sprites ≈ 10.0 ms real
    → procedural-disks ≈ 0.7 ms real
    → textured-disks ≈ 0.2 ms real
    → volume-upsample ≈ 0.3 ms real
    → structure-markers ≈ 0.4 ms real
  EST. PER-PASS FLOOR ≈ 4.1 ms  (hdr·NEAR0)
    → milky-way-upsample ≈ 1.5 ms real
    → milky-way ≈ 0.7 ms real
    → star-points ≈ 0.8 ms real
    → star-catalog ≈ 0.7 ms real
    → star-upsample ≈ 0.9 ms real
  EST. PER-PASS FLOOR ≈ 3.0 ms  (swap·COSMO)
    → marker-lines ≈ 2.0 ms real
    → labels ≈ 2.1 ms real
  SUMMARY
    ✗ Over the 30fps budget (45.9 ms — ~22 fps ceiling).
    Hottest pass: hdr·COSMO — 11.6 ms, 29% of MERGED GPU time.
    Per-pass floor ≈ 2.5 ms; instrumented per-layer total inflated ~29.3 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'milky-way-close' (30 frames @ dpr 2) ...
milky-way-close  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   50.5 ms/frame | 79.9 p90
    → ~20 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   87.3 ms/frame | 121.7 p90
  MERGED (production pass shape)
    group                  median   p90  share              %
    ─────────────────────────────────────────────────────────
    hdr·COSMO                11.0  24.3  ███▊             25%
    hdr·NEAR0                 5.5  10.2  █▉               13%
    bloom                     5.5  10.9  █▉               13%
    mw-aggregate·NEAR0        5.2  10.2  █▊               12%
    hdr→swap                  4.5  10.4  █▌               10%
    swap·COSMO                4.5  10.4  █▌               10%
    swap·NEAR0                4.5  10.4  █▌               10%
    star-aggregates·NEAR0     1.8   6.5  ▋                 4%
    volume·COSMO              1.5   5.9  ▌                 3%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                median   p90  share              %
    ───────────────────────────────────────────────────────
    point-sprites           8.8  16.2  █▋               10%
    marker-lines            6.9  10.3  █▎                8%
    foreground-labels       6.9  10.3  █▎                8%
    hdr→swap                6.9  10.3  █▎                8%
    labels                  6.8  10.3  █▎                8%
    bloom                   6.8  10.6  █▎                8%
    milky-way-upsample      6.3   7.9  █▏                7%
    milky-way-aggregate     6.3   8.4  █▏                7%
    star-upsample           5.8   9.3  █                 7%
    star-catalog            5.7   9.2  █                 7%
    milky-way               5.6   8.6  █                 7%
    star-points             5.4   9.1  █                 6%
    scalar-volume           1.7   4.9  ▎                 2%
    star-aggregates         1.1   2.7  ▎                 1%
    procedural-disks        1.0   2.3  ▏                 1%
    structure-markers       0.9   3.1  ▏                 1%
    volume-upsample         0.8   2.0  ▏                 1%
    textured-disks          0.6   5.6  ▏                 1%
  EST. PER-PASS FLOOR ≈ 0.2 ms  (hdr·COSMO)
    → point-sprites ≈ 8.6 ms real
    → procedural-disks ≈ 0.8 ms real
    → textured-disks ≈ 0.3 ms real
    → volume-upsample ≈ 0.6 ms real
    → structure-markers ≈ 0.7 ms real
  EST. PER-PASS FLOOR ≈ 4.7 ms  (hdr·NEAR0)
    → milky-way-upsample ≈ 1.7 ms real
    → milky-way ≈ 0.9 ms real
    → star-points ≈ 0.7 ms real
    → star-catalog ≈ 1.1 ms real
    → star-upsample ≈ 1.2 ms real
  EST. PER-PASS FLOOR ≈ 4.7 ms  (swap·COSMO)
    → marker-lines ≈ 2.3 ms real
    → labels ≈ 2.2 ms real
  SUMMARY
    ✗ Over the 30fps budget (50.5 ms — ~20 fps ceiling).
    Hottest pass: hdr·COSMO — 11.0 ms, 25% of MERGED GPU time.
    Per-pass floor ≈ 3.2 ms; instrumented per-layer total inflated ~36.8 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'galactic-centre' (30 frames @ dpr 2) ...
galactic-centre  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   18.9 ms/frame | 31.2 p90
    → ~53 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   14.0 ms/frame | 16.9 p90
  MERGED (production pass shape)
    group                  median   p90  share              %
    ─────────────────────────────────────────────────────────
    hdr·COSMO                 8.9  17.2  ████████▌        57%
    volume·COSMO              1.9   5.3  █▊               12%
    bloom                     1.3   6.7  █▎                9%
    swap·COSMO                1.0   1.8  █                 6%
    swap·NEAR0                1.0   1.8  ▉                 6%
    hdr→swap                  0.9   1.8  ▉                 6%
    hdr·NEAR0                 0.7   2.8  ▋                 4%
    star-aggregates·NEAR0     0.0   1.5                    0%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer              median  p90  share              %
    ────────────────────────────────────────────────────
    point-sprites         5.0  5.7  █████▎           35%
    scalar-volume         1.4  1.5  █▌               10%
    procedural-disks      1.1  1.3  █▎                8%
    bloom                 0.7  0.9  ▊                 5%
    hdr→swap              0.7  0.9  ▊                 5%
    marker-lines          0.7  0.9  ▊                 5%
    labels                0.7  0.9  ▊                 5%
    foreground-labels     0.7  0.9  ▊                 5%
    star-upsample         0.6  0.7  ▋                 4%
    orbit-trails          0.5  0.6  ▌                 4%
    star-catalog          0.5  0.7  ▌                 4%
    structure-markers     0.5  0.6  ▌                 3%
    star-points           0.5  0.5  ▌                 3%
    volume-upsample       0.4  0.5  ▍                 3%
    textured-disks        0.3  0.3  ▎                 2%
    star-aggregates       0.0  0.0                    0%
  EST. PER-PASS FLOOR ≈ 0.0 ms  (hdr·COSMO)
    → point-sprites ≈ 5.0 ms real
    → procedural-disks ≈ 1.1 ms real
    → textured-disks ≈ 0.3 ms real
    → volume-upsample ≈ 0.4 ms real
    → structure-markers ≈ 0.5 ms real
  EST. PER-PASS FLOOR ≈ 0.4 ms  (hdr·NEAR0)
    → star-points ≈ 0.1 ms real
    → orbit-trails ≈ 0.2 ms real
    → star-catalog ≈ 0.2 ms real
    → star-upsample ≈ 0.2 ms real
  EST. PER-PASS FLOOR ≈ 0.2 ms  (swap·COSMO)
    → marker-lines ≈ 0.5 ms real
    → labels ≈ 0.5 ms real
  SUMMARY
    ⚠ Over the 60fps budget (18.9 of 16.7 ms — ~53 fps ceiling).
    Hottest pass: hdr·COSMO — 8.9 ms, 57% of MERGED GPU time.
    Per-pass floor ≈ 0.2 ms; instrumented per-layer total inflated ~0.0 ms over merged.

measuring 'local-group' (30 frames @ dpr 2) ...
local-group  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   18.1 ms/frame | 66.8 p90
    → ~55 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   29.0 ms/frame | 72.4 p90
  MERGED (production pass shape)
    group                  median  p90  share              %
    ────────────────────────────────────────────────────────
    hdr·NEAR0                 2.8  5.8  ██▍              15%
    star-aggregates·NEAR0     2.7  4.9  ██▎              15%
    foreground:0·NEAR0        2.7  4.2  ██▎              15%
    bloom                     1.8  8.7  █▌               10%
    swap·NEAR0                1.8  9.1  █▌               10%
    hdr→swap                  1.7  8.8  █▍                9%
    swap·COSMO                1.7  9.0  █▍                9%
    foreground:0→hdr          1.4  5.7  █▏                8%
    foreground:0·BODY[0]      1.2  5.6  █                 7%
    hdr·COSMO                 0.3  2.5  ▎                 1%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                 median   p90  share              %
    ────────────────────────────────────────────────────────
    point-sprites           11.8  36.7  ███████▋         51%
    scalar-volume            2.0   7.9  █▍                9%
    foreground-labels        1.3   2.5  ▉                 6%
    procedural-disks         1.1   3.6  ▊                 5%
    bloom                    1.1   6.6  ▊                 5%
    labels                   1.0   2.6  ▋                 5%
    near0-selection-ring     1.0   2.6  ▋                 5%
    hdr→swap                 1.0   2.5  ▋                 4%
    marker-lines             1.0   7.5  ▋                 4%
    structure-markers        0.7   3.3  ▍                 3%
    volume-upsample          0.5   2.6  ▍                 2%
    textured-disks           0.4   5.1  ▎                 2%
  EST. PER-PASS FLOOR ≈ 2.8 ms  (hdr·COSMO)
    → point-sprites ≈ 8.9 ms real
    → procedural-disks ≈ -1.7 ms real
    → textured-disks ≈ -2.4 ms real
    → volume-upsample ≈ -2.3 ms real
    → structure-markers ≈ -2.2 ms real
  EST. PER-PASS FLOOR ≈ 0.2 ms  (swap·COSMO)
    → marker-lines ≈ 0.8 ms real
    → labels ≈ 0.9 ms real
  EST. PER-PASS FLOOR ≈ 0.3 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 0.8 ms real
    → foreground-labels ≈ 1.0 ms real
  SUMMARY
    ⚠ Over the 60fps budget (18.1 of 16.7 ms — ~55 fps ceiling).
    Hottest pass: hdr·NEAR0 — 2.8 ms, 15% of MERGED GPU time.
    Per-pass floor ≈ 1.1 ms; instrumented per-layer total inflated ~10.9 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)

measuring 'full-survey' (30 frames @ dpr 2) ...
full-survey  (1400×900 @dpr2, tier medium, 30 frames, median ms | p90)
  TOTAL (merged, production)   26.1 ms/frame | 62.5 p90
    → ~38 fps GPU-bound ceiling (timed passes only; excludes CPU/present/vsync)
  TOTAL (per-layer, instrumented — not representative)   88.5 ms/frame | 143.2 p90
  MERGED (production pass shape)
    group                  median   p90  share              %
    ─────────────────────────────────────────────────────────
    hdr·NEAR0                 3.2  15.8  ██▎              15%
    star-aggregates·NEAR0     3.0  16.9  ██▏              14%
    foreground:0·NEAR0        2.9  11.8  ██               13%
    swap·NEAR0                2.2   4.7  █▌               10%
    hdr→swap                  2.2   4.3  █▌               10%
    swap·COSMO                2.2   4.5  █▌               10%
    bloom                     2.1   4.2  █▍                9%
    foreground:0→hdr          1.6   3.5  █▏                7%
    foreground:0·BODY[0]      1.4   3.4  █                 7%
    hdr·COSMO                 0.9  11.3  ▋                 4%
  PER-LAYER (attribution; each row includes ~FLOOR pass overhead)
    layer                 median   p90  share              %
    ────────────────────────────────────────────────────────
    point-sprites           15.5  31.4  █▋               11%
    foreground-labels       13.7  14.4  █▌               10%
    labels                  13.2  14.1  █▍                9%
    marker-lines            13.2  14.1  █▍                9%
    near0-selection-ring    11.5  19.5  █▎                8%
    bloom                   11.5  19.4  █▎                8%
    hdr→swap                11.5  19.5  █▎                8%
    volume-upsample         10.9  14.8  █▏                8%
    textured-disks          10.5  10.5  █▏                7%
    procedural-disks        10.3  10.3  █▏                7%
    structure-markers        9.8  13.9  █                 7%
    horizon-shell            9.4  14.0  █                 7%
    scalar-volume            0.9   3.7  ▏                 1%
  EST. PER-PASS FLOOR ≈ 10.9 ms  (hdr·COSMO)
    → point-sprites ≈ 4.6 ms real
    → procedural-disks ≈ -0.6 ms real
    → textured-disks ≈ -0.4 ms real
    → volume-upsample ≈ 0.0 ms real
    → horizon-shell ≈ -1.5 ms real
    → structure-markers ≈ -1.1 ms real
  EST. PER-PASS FLOOR ≈ 12.1 ms  (swap·COSMO)
    → marker-lines ≈ 1.1 ms real
    → labels ≈ 1.1 ms real
  EST. PER-PASS FLOOR ≈ 11.5 ms  (swap·NEAR0)
    → near0-selection-ring ≈ 0.0 ms real
    → foreground-labels ≈ 2.2 ms real
  SUMMARY
    ⚠ Over the 60fps budget (26.1 of 16.7 ms — ~38 fps ceiling).
    Hottest pass: hdr·NEAR0 — 3.2 ms, 15% of MERGED GPU time.
    Per-pass floor ≈ 11.5 ms; instrumented per-layer total inflated ~62.4 ms over merged.
  ⚠ 2 page error(s): console.error: Failed to load resource: the server responded with a status of 404 (NOT FOUND. Requested (ra, dec) is outside the SDSS footprint.)
  ALL SCENARIOS (merged median ms | fps ceiling)
    scenario           total  fps  verdict   
    ─────────────────────────────────────────
    earth-surface       25.0   40  ⚠ 30–60fps
    solar-system        27.3   37  ⚠ 30–60fps
    star-field          25.3   39  ⚠ 30–60fps
    milky-way           36.4   27  ✗ <30fps  
    milky-way-outside   45.9   22  ✗ <30fps  
    milky-way-close     50.5   20  ✗ <30fps  
    galactic-centre     18.9   53  ⚠ 30–60fps
    local-group         18.1   55  ⚠ 30–60fps
    full-survey         26.1   38  ⚠ 30–60fps
```

Task 1: complete (no commits — measurement only; baseline verbatim above).
Ruling: no task review for T1 — nothing to diff; the verbatim-transcription
check was done by the implementer (diffed ledger vs raw stdout). Cost if
wrong: a corrupt baseline surfaces at T21's diff.
Note for T21: Apple Silicon slot-sum inflation visible (identical adjacent
medians); 7/9 poses log benign SDSS-footprint 404s (pre-existing).

Task 2: implementer DONE, commit 1a4675a16 (types + SURFACE_REGIME); reviewer
dispatched (sonnet, package review-630993b50..1a4675a16.diff).
Task 3: implementer dispatched (opus, BASE 1a4675a16) — pipelined per Rule 2
(T3 files disjoint from T2's frozen review).

Task 2: complete (commits 630993b50..1a4675a16, review clean). Minor
(deferred, not actionable): leaf-type comment density exceeds half-of-code
ratio because spec §3 doc comments are mandated verbatim; surfaceRegime.ts
one-line header consistent with src/data convention.

Task 3: implementer DONE, commit b3844fa38 (conversions, 11 tests, round-trip
4.7e-10 m vs 14 µm bar; mutation-verified). Reviewer dispatched (opus,
package review-1a4675a16..b3844fa38.diff). Implementer concerns to reviewer:
poseBasis cast, miss-fallback orientation loss, tolerance sizing.
Task 4: implementer dispatched (sonnet, BASE b3844fa38) — pipelined; touches
only oneMpcSeam.test.ts, disjoint from T3's frozen review.

Task 4: implementer DONE, commit b25bb0b56 (camera-path sweep, probe-verified
gate, suite 7953). Reviewer dispatched (sonnet,
package review-b3844fa38..b25bb0b56.diff).
Task 5: implementer dispatched (sonnet, BASE b25bb0b56) — pipelined; new
files only, disjoint from open T3/T4 reviews.

Task 4: complete (commits b3844fa38..b25bb0b56, review clean — reviewer
independently verified no unlisted SCALE_UNITS violator in swept dirs).

Task 3: review returned 2 Important (fix loop opens; freeze rule: no NEW
implementers until closed; T5 in flight runs to completion, fix queues
behind it):
  I1 DIR_FLOOR comment/constant mismatch (1e-9 vs derived 5e-11; tighten to
     1e-10 or amend comment).
  I2 composition unbound to updatePosition — add one fixture assertion using
     updatePosition as fixture source.
Ruling: reviewer's derivation accepted — brief/spec "~14 µm" is really the
2-ulp-at-1AU figure (~50 µm); spec lines ~337/~605 to be corrected in the fix
round so the bar isn't re-litigated. Cost if wrong: a loosened bar hides real
drift — the measured 4.7e-10 m says it can't bite today.
Task 3 minors (deferred): poseBasis as Mat3 cast (widen
orbitAnglesLookingAlong to Readonly, kills cast); BODY_CENTRE not Readonly;
LABELS parallel array index-coupled; body→world→body direction untested
(~1e-6 m bar would make "lossless" load-bearing); spec §5.2 stale
"roll hard-coded 0" text.

Task 5: implementer DONE, commit 0af3434ca (maxTiltRad, 4 tests, suite 7961).
Reviewer dispatched (sonnet, package review-b25bb0b56..0af3434ca.diff).
Task 3: fix round 1 dispatched (resumed original opus implementer): I1
DIR_FLOOR, I2 updatePosition-bound assertion, + sanctioned spec 14µm→2ulp
correction. T6+ dispatch frozen until T3 loop closes.

Task 5: complete (commits b25bb0b56..0af3434ca, review clean; reviewer
re-derived all asserted values from smoothstep clamp semantics).

Task 3: fix round 1/5 (2 addressed per implementer + spec correction; commit
eff9a06bf, impl module byte-identical). Implementer landmine note: exact
world-space assertions are BLIND at heliocentric magnitude (~25 µm grid) —
near-origin fixtures required to make them bite. Scoped re-review dispatched
(sonnet, package review-0af3434ca..eff9a06bf.diff).

Task 3: complete (commits 1a4675a16..b3844fa38 + fix eff9a06bf, re-review
clean — all findings addressed, spec correction verified minimal). Freeze
lifted.

Task 6: implementer dispatched (sonnet, BASE eff9a06bf). Board refreshed
(5/22).

Task 6: implementer DONE, commit a2d6b3685 (reanchoredPose, 5 tests, suite
7971; TRIGGER_FRACTION=1e-3 reasoned-not-spec-given, revisit with real
deep-zoom caller). Reviewer dispatched (sonnet,
package review-eff9a06bf..a2d6b3685.diff).
origin/main 0b1787ae4 (#649 black-hole ground prep P1-P3) merged in as
f8f6d3f3f at the T6/T7 boundary; typecheck:fast clean, full-suite gate
running. T7 dispatch waits on that gate.

Merge gate GREEN: suite 7998 / 1175 files after f8f6d3f3f (main #649 in).
Task 7: implementer dispatched (sonnet, BASE f8f6d3f3f).

Task 6: review returned 1 Critical + 1 Important (fix loop opens; freeze:
T7 in flight runs to completion, T6 fix queues behind it):
  C1 tests blind to quantization BASIS — ulpAt(rangeM) or a fixed 1e-6 grid
     passes all 5 tests; fix = hand-derived exact expected value for
     eyeRelAnchorM/d from ulpAt(anchorMagM) in ≥1 fixture.
  I1 comment budget overrun (20 comment vs 30 code lines) + report's
     compliance claim wrong; trim to ≤ half.
  Minor (deferred): no power-of-two anchor fixture guarding ulpAt's own
     log2 landmine.
Note: reviewer verified C1 by substitution but left tree clean (verified
git status empty; T7 uncontaminated).

Task 7: implementer DONE, commit 71c460af6 (cursorRayBodyLocal, 4 tests,
suite 8006; y-flip matched mcpm-workbench screenToRay precedent). Reviewer
dispatched (sonnet, package review-f8f6d3f3f..71c460af6.diff) — asked to
check the pick-path convention agreement specifically.
Task 6: fix round 1/5 dispatched (resumed implementer): C1 quantization-basis
pinning test, I1 comment trim.
Ruling: freeze rule relaxed for worktree-ISOLATED implementers — T8/T9/T12
dispatched in parallel isolated worktrees (sonnet ×3, branched at 71c460af6)
while T6's fix runs in the main tree. Rationale: the freeze guards tree
contention + building on defective ground; isolation removes contention, and
none of T8/T9/T12 touch reanchoredPose. Cost if wrong: cherry-pick
conflicts / a wave rebuilt. Merge-back = controller cherry-picks reported
SHAs serially, then one gate; reviews run on the cherry-picked ranges.

## In-flight + handling (compact checkpoint 2026-09-01)

Live agents and what to do with each result:
- T6 fix round 1 (resumed T6 implementer, main tree): on DONE → scoped
  re-review of the fix commit only (sonnet, review-package <fixparent>..<fix>)
  verifying C1 basis-pinning test + I1 comment trim; clean → Task 6 complete.
- T7 reviewer (sonnet): clean → Task 7 complete; Important+ → fix loop,
  resume T7 implementer.
- T8 / T9 / T12 implementers (isolated worktrees, sonnet): each reports a
  FULL 40-char SHA; cherry-pick reported SHAs onto camera-pivot serially
  (order: 9, 8, 12 — any order works, files disjoint), run
  typecheck:fast + full npm test as one gate, then per-task review packages
  over each cherry-picked commit and 3 reviewers (sonnet). Reports land in
  scratchpad/task-{8,9,12}-report.md.

Queued sequence after the above: T10 ‖ T11 as second isolated wave (both
depend on T7 [cursor ray] + T9 [floor]; T10 = opus per model plan) →
serial T13 (opus, big migration) → T14 → T15 → T16-T18 → T19-T20 → T21 →
T22 USER gate.
Standing user directives this session: ping the user "something to test"
at the T16/T17 boundary (first hands-on feel check, dev server :5173);
merge origin/main at task boundaries when it moves (last merged 0b1787ae4
as f8f6d3f3f, gate 7998 green); parallel isolated implementers approved
(user asked for more parallelism).
Board artifact (refresh on completions, same source file):
https://claude.ai/code/artifact/d7b9e10c-386f-49e9-a222-673b5f7bfae0
source /private/tmp/claude-501/-Users-rulkens-Development-js-skymap/479e7522-f79c-4713-a329-cff75ebf382e/scratchpad/camera-pivot-board.html
Push policy: branch not yet pushed since plan commit — push accumulated
commits to origin camera-pivot (PR #647) at the next quiet boundary.

Task 7: complete (commits f8f6d3f3f..71c460af6, review clean; y-flip
convention verified against forwardProjectPoint/composeOrbitConic/
horizonShell — engine-side corroboration recorded for T16's benefit).
Minors (deferred): hypot lacks the precedent's ||1 guard (can't fire —
forward unit ⇒ norm ≥ 1); unit-length test tautological (brief-mandated).

LANDMINE (isolation waves): Agent isolation:worktree branches from origin/
MAIN, not this branch — T9 built on main (worked; self-contained), T8/T12
were messaged mid-flight to `git merge 71c460af6` before proceeding. Future
isolated dispatches must include that merge step in the dispatch prompt.
Task 6: fix round 1/5 (2 addressed + bonus fixtures; commit 8bd6eff1c,
discriminating fixtures substitution-verified by implementer). Scoped
re-review dispatched (sonnet, review-71c460af6..8bd6eff1c.diff).
Task 9: implementer DONE in isolated wt (main-based, self-contained);
cherry-picked b22248db9 → 5524e1282 on camera-pivot. Reviewer dispatched
(sonnet, review-8bd6eff1c..5524e1282.diff).

Task 9: complete (cherry-picked 5524e1282, review clean).

Task 6: complete (commits eff9a06bf..a2d6b3685 + fix 8bd6eff1c, re-review
clean — re-reviewer independently recomputed both fixtures under three grid
bases; power-of-two bonus fixture included).

## Compact checkpoint 2 (2026-09-01)

Done through: T1-T7, T9 complete; HEAD 5524e1282 (pushed to #647). Board
current (8/22).
Live agents: T8 (surface readout) + T12 (regime predicate) in ISOLATED
worktrees, both corrected mid-flight to `git merge 71c460af6` (they branched
from main — see landmine above). Handling on completion: each reports a full
SHA → cherry-pick onto camera-pivot (T8 then T12, any order), one
typecheck:fast+`npm test` gate, review packages over each cherry-picked
commit, sonnet reviewers. Their editor diagnostics leak into the main
session's IDE — ignore, they're worktree-local.
Then: T10 ‖ T11 isolated wave (deps T7+T9 satisfied; T10=opus, T11=sonnet;
DISPATCH PROMPTS MUST INCLUDE the `git merge <camera-pivot HEAD>` setup
step) → serial from T13 (opus). Everything else per checkpoint 1 above.

Task 12: implementer DONE in isolated wt (merged camera-pivot first);
cherry-picked e67c55fd2 → e53f97e30; typecheck:fast + focused 135 green.
Reviewer dispatch next (sonnet, review-5524e1282..e53f97e30.diff).
WATCH ITEM (for T13/T20): BodyId is a 5-value settings-category union, not
per-row ids — camera-pivot code (poseFrameConversion etc.) uses the existing
`id as BodyId` cast convention; serialization/frame-tag work must not assume
one BodyId per SCENE_BODIES row. Flagged in task-12-report.md.

Task 8: implementer DONE in isolated wt (self-corrected the main-branch
issue before the coordinator message); cherry-picked 6a198f5aa → 2ab0e98c8;
typecheck:fast + focused 6/6 green. Reviewer dispatched (sonnet,
review-e53f97e30..2ab0e98c8.diff) — asked to judge the standpoint
forward-ray/nadir-fallback interpretation against spec §14 + T16/T17 needs.
T10 ‖ T11: isolated wave dispatched (T10 opus, T11 sonnet; BASE for both =
2ab0e98c8 via in-prompt `git merge 2ab0e98c8` step). Handling: cherry-pick
reported SHAs (either order, disjoint), gate, review each.

Task 12: complete (cherry-picked e53f97e30, review clean). Minors (deferred):
header ~12-14 lines vs 10 budget (load-bearing content); disengageHR only
exercised at ±0.1 margins; roster-dropout hold branch untested.

Task 8: review 1 Important — no-hit standpoint fallback is DISCONTINUOUS at
tangency (~24.6° snap at h/R=0.1) and the code/report claim "reduces
continuously" is false. Fix round 1 dispatched (resume T8 agent in its
worktree): strike/reword the claim; document the discontinuity + display-only
scope. Ruling: surfaceReadoutOf is the READOUT currency; T16 gestures use
the latched anchor's ENU (spec §6) and T17 enforcement must derive its ENU
from the eye's footprint local vertical, NOT this function's forward-ray
standpoint — verify against spec §6 wording at T17 dispatch and carry this
ruling in T16/T17 briefs. Cost if wrong: T17 re-work; display snap is
cosmetic. Minor (deferred): shared localEastNorth extraction once a second
ENU consumer appears (watch at T16 review).

Task 8: fix round 1/5 (comment-only; cherry-picked 5d1ac4074 → 908c7d6b2,
typecheck clean). Scoped re-review dispatched (haiku,
review-2ab0e98c8..908c7d6b2.diff).

Task 8: complete (commits e53f97e30..2ab0e98c8 + fix 908c7d6b2, re-review
clean).

Task 10: implementer DONE_WITH_CONCERNS; cherry-picked 19740e19e →
b75456ee0, gate green (8/8 + typecheck). Opus reviewer dispatched
(review-908c7d6b2..b75456ee0.diff) to independently adjudicate the three
concerns: (1) quaternion direction inverse of spec §6a prose (implementer
argues p̂₁→p̂₀ is the FW-I-correct sign; if confirmed → sanction spec
reword); (2) reorthonormalise handedness landmine (right×up=−forward ⇒
(forward,up,right) argument order); (3) grazing test on both rays.

Task 11: implementer DONE_WITH_CONCERNS; cherry-picked 09c3862a8 →
bb603ebc4, gate green (6/6 + typecheck). Opus reviewer dispatched
(review-b75456ee0..bb603ebc4.diff) to adjudicate: (1) FW-H round-trip test
uses null anchor on BOTH legs (implementer's mixed-legs-can't-cancel proof
— does the flagship test still catch the stored-pivot bug class?); (2)
13-line header w/ tangent-plane proof; (3) 0.5/2.0 factor clamps feel-open.
Phase 1 implementation now FULLY LANDED (T2-T12 all on branch);
Phase 2 serial T13 waits on T10/T11 reviews closing.

Task 10: review APPROVED (opus independently derived all three concerns in
the code's favour; FW-I pole fixture confirmed non-back-fittable).
Ruling: spec §6a quaternion-direction prose SANCTIONED for amendment (pose
rotates by the INVERSE of the p̂₀→p̂₁ map — reviewer + implementer agree by
independent derivation). Cost if wrong: a reversed-drag feel, caught by 4
FW-I tests.
Fix round 1 dispatched (resume T10 agent): spec §6a amendment,
reorthonormalise right-handed header warning, export MIN_INCIDENCE_COS
(single home for T16), comment overclaim trim, PickRay unit-dir note.
CARRY TO T16 BRIEF: import MIN_INCIDENCE_COS from anchoredDragRotation
(never restate); miss ⇒ trackball stickily vs grazing ⇒ strafe-in-anchor-
plane must be distinguished by the CONTROLLER re-checking incidence — the
null return does not name its reason (brief-mandated shape).
Minor (deferred): anchor rotation FP random-walk ~25 nm/10 s — below §5.3
visibility floor, no action.

Task 11: review NEEDS FIXES — 2 Important: I1 all cursor-path assertions
call-vs-call (latched-anchor/ignores-cursor implementations pass 6/6; fix =
closed-form expectations, with-cursor call kept first); I2 module-level
mutable CENTRE cell (inline it). Ruling: centre/centre FW-H round-trip
reading CONFIRMED correct by reviewer's independent derivation (mixed legs
residual ~|A| — geometry). Fix round 1 dispatched (resumed T11 agent) incl.
header trim to ≤10 w/ algebra one-liner + centre-measured-factor contract.
CARRY TO T22: MIN_FACTOR=1/MAX_FACTOR reciprocity is load-bearing for
clamped fling round-trips — a non-reciprocal feel pick (0.6/2.0) breaks it
with no test firing.

Task 10: fix round 1/5 (5 follow-ups; cherry-picked da5304032 → 08d989193,
gate green). Scoped re-review dispatched (sonnet,
review-bb603ebc4..08d989193.diff). Extra T22 note from implementer: grazing
threshold measured on the frozen radius, not the surface (diverges only for
below-surface picks).

Task 11: fix round 1/5 (I1 closed-form pins, I2 const inlined, header 10
lines; cherry-picked 32a5e3b4a → 21881f477, gate green). Scoped re-review
dispatched (sonnet, review-08d989193..21881f477.diff).

Task 10: complete (commits 19740e19e→b75456ee0 + fix da5304032→08d989193,
re-review clean; §6a amendment verified geometrically accurate).

Task 11: complete (commits 09c3862a8→bb603ebc4 + fix 32a5e3b4a→21881f477,
re-review clean). Minor (deferred): header 11 lines vs claimed 10 —
justifiable, park for comment-audit.
PHASE 1 COMPLETE (T1-T12). Full-suite gate before T13 next; then serial
Phase 2.

Phase-2 gate GREEN: full suite 8182 at 21881f477.
Task 13: implementer dispatched (opus, MAIN tree, BASE 21881f477) — union
migration; dispatch carried the BodyId watch item, driver/commit/one-
resolution rulings, and the stop-on-assertion-change rule.

## Compact checkpoint 3 (2026-09-01)

Done: T1-T12 (Phase 0-1) complete + reviewed; HEAD 21881f477 pushed to #647;
suite 8182 green at that HEAD; board current (12/22).
ONE live agent: T13 implementer (opus, MAIN tree, BASE 21881f477, union
migration). Handling on DONE: review-package 21881f477..HEAD → OPUS task
reviewer (large diff; check behaviour-identical claim, no renderer files,
driver isActive gating, one-resolution-per-frame); DONE_WITH_CONCERNS →
read concerns first; BLOCKED/NEEDS_CONTEXT → likely a reader needing real
behaviour change: rule against spec §9 and re-dispatch. Then T14 (sonnet,
provider B, frameContext seam) → T15 (opus, the fold) → T16-T18 → T19-T20 →
T21 perf (--url :5173) → T22 USER gate (ping user; also settle: roster
narrowing?, grazing sym/asym + frozen-radius note, MIN/MAX_FACTOR
reciprocity, tiltFullHR).
All standing directives + carries: see checkpoints 1-2 + T10/T11/T8 carry
notes above. Briefs exist through task-13; generate later ones with
task-brief script as needed.

## Task 13 — implementation landed, review in flight
- Implementer (opus, main tree): DONE_WITH_CONCERNS, commit a668f3b64. Suite 8192 green, typecheck green. Report: task-13-report.md.
- Review package: review-21881f477..a668f3b64.diff. OPUS reviewer dispatched; verdict file task-13-review.md.
- CARRY → Task 15: implementer concern #1 — resolveWorldArm THROWS on unresolved engaged body. Unreachable in T13 wiring; T15's fold must confirm regimeArmFor can't hold a body arm after the body leaves the roster (roster-dropout window). Rule there.
- Noted deviations (reviewer adjudicating): eyeMpcOf poseBasis widened to `Readonly<Mat3> | undefined`; `as BodyId` casts (incumbent convention); liveWorldPose reads LIVE cameraRuntime.upBasis (6 harnesses grew upBasis field).
- Baseline drift note: brief said 8182; pre-diff actual 8190 (main merge f8f6d3f3f added tests). Not a defect.
- origin/main moved to bfbbbcb70 (bullseye-famous) — merge scheduled at T13 close, before T14 dispatch.
- REVIEW VERDICT: Spec PASS · Quality APPROVED. 0 Critical / 3 Important / 6 Minor (task-13-review.md). Behaviour-identical claim independently confirmed (all 22 test hunks mechanical); one-resolution-per-frame holds incl. drainInput memo check; live upBasis ruled CORRECT (reproduces runFrame.ts:309/316; steady diverges in roll mid-slerp) — 6 harness upBasis fields are a true dependency; both contract deviations (optional poseBasis, `as BodyId`) accepted as incumbent convention.
- CARRY → Task 15 (epoch ruling): watchFlyToLonLatSaga calls resolveWorldArm against a FRESH clock sample — a second off-frame resolution site with a different epoch policy than liveWorldPose. Behaviour-identical today; rule the epoch policy at the fold.
- CARRY → Task 15/16: arm gates decouple driver activity from selectCameraActive (raw store flags) — in a body arm, autoRotate.active stays true: loop never sleeps, UI toggle reads "on" while nothing spins. Unreachable today; rule when gestures/fold make body arms constructible.
- Fix round 1 (comment-only): liveWorldPose docblock premise false at the in-loop followBody.pose call site — implementer resumed to rewrite docblock, new commit (no amend). Controller verifies diff directly (comment-only ⇒ no re-review agent).
- Fix round 1 CLOSED: 8eb47b28c5d2f488a61ac529cb242836b10e935c, comment-only (7+/7-, liveWorldPose module header), controller-verified by direct diff. Docblock now records the two epoch classes; T15 to confirm the in-produce-step epoch decision.

Task 13: complete — commits a668f3b64 + 8eb47b28c. Suite 8192 green, typecheck green, review PASS/APPROVED.
- Task 14 dispatched: sonnet, main tree, BASE 897ff38b2 (post-merge origin/main bfbbbcb70 famous-assets-only, typecheck gate green, pushed).

## Task 14 — implementation landed, review in flight
- Implementer (sonnet): DONE, commit d3468eff2716f8fdeb9be57cbc983b27e9b2f79b. Focused 55 tests + broader sweep 2466 green, typecheck:fast green. Report: task-14-report.md.
- Tolerance ruling applied: 5e-5 m (50 µm), matching poseFrameConversion.test.ts's EYE_FLOOR_M — brief's "~14 µm" superseded per T3 ruling.
- runFrame.ts + pickFrameContext.ts threading = mechanically forced (only production callers of deriveFrameContext), sanctioned by brief.
- OPUS reviewer dispatched on review-897ff38b2..d3468eff2.diff; verdict file task-14-review.md.
- REVIEW VERDICT: Spec PASS · Quality REVISE. 0C/3I/4m (task-14-review.md). Clean: inertness (toBodyArm zero src/ callers), one-resolution-per-frame, §5.2/S1 per-body branch + mode-switch mutant killed, anchor-fold test closed-form, threading mechanical.
- The 3 Importants = one defect: boundary-agreement test blind — providers bit-identical on fixture (reviewer measured), 5e-5 m tolerance ~13 decades below 1 ulp at 3e24 m, duplicate of poseFrameConversion.test.ts:338-359. Deleting provider-B branch fails NO test.
- Fix round 1 dispatched (resume implementer): replace agreement test with a ROUTING test (distinguishable hand-built body arm through deriveFrameContext; branch-delete must fail), drop duplicate numeric coverage, Minors at implementer judgment.
- LANDMINE (recurring, 3rd occurrence after T6/T11): agreement/equality tests at heliocentric magnitude are blind — demand a mutant-killing routing assertion, not numeric agreement.
- Fix round 1 landed: 2ceba02f1defd465a8e7478d054a8fd2f0580b98 — routing test (hand-built near-origin anchor split, provider A structurally can't produce it), EYE_FLOOR_M comparison deleted, duplicate coverage dropped; implementer mutation-verified by hand (seam-branch delete → only new test fails). Minor 6 applied; 4/5/7 skipped per reviewer's own out-of-scope notes. Sonnet scoped re-review dispatched on review-d3468eff2..2ceba02f1.diff.
- Re-review verdict: ALL ADDRESSED — independent mutation kill confirmed (seam-branch delete → exactly the routing test fails, expected value is a hand-computed literal). Full suite 8200 green.

Task 14: complete — commits d3468eff2 + 2ceba02f1. Provider B inert behind the seam; routing mutant-killed; one-resolution-per-frame intact.

## Task 15 — dispatched
- Implementer: OPUS, main tree, BASE 2ceba02f1 (T14 closed, suite 8200, pushed). The fold in runFrame — riskiest task. Dispatch carries the three rulings (resolveWorldArm throw/roster-dropout, saga epoch policy, autoRotate-active-in-body-arm) + the liveWorldPose epoch confirmation + the 3×-hit magnitude-blind-test landmine.
- Handling on DONE: review-package 2ceba02f1..HEAD → OPUS reviewer (fold placement vs runFrame ordering contract, one-resolution-per-frame, gesture-in-flight skip, no-snap test validity at magnitude, the three ruling resolutions).
- Implementer (opus): DONE_WITH_CONCERNS, commit d21ae5ab8c8b616695569fc7632f39d275f8fdb4. Full suite 8208 green (+8). Report: task-15-report.md.
- Ruling resolutions (implementer, pending review ratification): (1) unresolvable-body throw UNREACHABLE (deriveBodyStates key set time-invariant; regimeArmFor names only those ids) — throw left, dropout-hold branch now dead-from-frame-path, flagged not deleted. (2) saga keeps fresh clock sample — coherent at one epoch, can't reach lastRenderedSimDays store-side; RE-EXAMINE AT T19 (rewrites that file). (3) selectCameraActive auto-rotate term gated on absolute arm; selectAutoRotate preserves UI intent. liveWorldPose epoch docblock: confirmed correct.
- DEVIATION under adjudication: fold dispatches commitCameraPose on flip EDGE (else task inert — arm gates read s.camera.base.frame, resting re-emits absolute base). Spec §4/§12-T2 cited. OPUS reviewer told to give explicit verdict.
- INTERIM GAP (expected): engaged camera frozen to gestures until T16/T17 — branch NOT user-testable between 15 and 16; T22 feel gate after 16/17 (matches standing directive to ping user at that boundary).
- CARRY → T16 review lens: FramedCameraPose.frame.body vs BodyFixedPose.bodyId = one fact in two fields (T14 finding 5); fold sets both consistently; radar item.
- OPUS reviewer dispatched on review-2ceba02f1..d21ae5ab8.diff; verdict file task-15-review.md.
- REVIEW VERDICT: Spec FAIL · Quality REVISE. 1C/1I/5m (task-15-review.md). Deviation adjudication: commit-on-flip-edge SANCTIONED IN PRINCIPLE, implementation wrong — edge keyed on produced pose's arm (held.frame) not stored regime, so tween/clip (always absolute) inside band → re-commit EVERY frame (probe 4/4) and §4 hysteresis collapses to engage threshold during animated motion.
- C1 fix: key predicate current + dispatch edge on rootState.camera.base.frame; test: tween in band commits ONCE. I1: drainInput gestureEnd commits absoluteArm(poseOf(cam)) ungated — body-arm drag lands as snap on release (yaw 0.7→2.43 probe); interim fix = release no-op in body arm, T16 owns real behaviour.
- Verified sound: fold placement/FW-G order, one resolution per frame, gesture skip + no-double-fire, rulings 1+3, §14 inertness, no-snap tolerance HONEST at fixture magnitude (1 ulp ≈ 25 µm, 5e-5 ≈ 2 ulp = spec floor).
- Fix round 1 dispatched (resume implementer). Ruling: interim body-arm gesture release = no-op (freeze without snap) — honest until T16's anchored gestures; cost if wrong: none, T16 replaces the path.
- Fix round 1 landed: 8c742d98f2aead4bb650a91d6f9c8f51ced2b354. C1: edge + predicate keyed on stored regime (rootState.camera.base.frame), normalization stays unconditional; once-not-per-frame test mutation-verified (4≠1 on revert). I1: gestureEnd commits only in absolute arm; body-arm drag test pins base by reference, mutation-verified. Full suite 8210 green. Minors: M1 removed (load-bearing post-C1), M2 requestRender added, M4 comments 26→14; M3 = report correction + T16/19 flag (writers can leave base absolute while lastPose is body arm — watchFlyToLonLatSaga window); M5 → /feature-done deletion audit.
- INTERIM (corrected): in-band camera gives NO gesture response until T16 (freeze, no snap) — T16 acceptance item.
- Sonnet scoped re-review dispatched on review-d21ae5ab8..8c742d98f.diff.
- Re-review: ALL ADDRESSED (C1 hand-traced 4/4→1; I1 gated, zoom path already safe via applyWheelZoom null; no leak; tree clean).

Task 15: complete — commits d21ae5ab8 + 8c742d98f. Fold live, body arms reachable, hysteresis honest, full suite 8210 green.

## Task 16 — dispatched
- Implementer: OPUS, main tree, BASE 8c742d98f (T15 closed, suite 8210, pushed; main unchanged). Surface controller — first gesture task; carries: MIN_INCIDENCE_COS import-never-restate, controller re-checks incidence (miss⇒trackball vs grazing⇒strafe), driver keys on stored regime not lastPose (T15 M3 window), one-fact/two-fields consistency, magnitude-blind-fixture landmine.
- Handling on DONE: review-package 8c742d98f..HEAD → OPUS reviewer (mode latch/stickiness, ZXZ tilt order vs hand-computed pose, FW-C/FW-D tests, driver gating, no persistent target). After review closes: T17 next; USER PING due at T16/T17 boundary per standing directive (first hands-on feel check on :5173).
- Implementer (opus): DONE_WITH_CONCERNS, commit 3522458364e4c6e23d0c188e9bcfc7e226092aad. Full suite 8224 green (claims pre-task 8218 vs ledgered 8210 — reviewer told to reconcile). All 6 mandated tests mutation-verified per report. Report: task-16-report.md.
- Ruling: concern 1 (zoom-to-cursor centre-anchored at REST; InputStep has no pixel on zoom arm) ACCEPTED AS INTERIM — cursor-anchored during gestures; gap needs recognizer/aggregator surface outside this task; present at T22 feel gate for user ruling. Cost if wrong: one more task's worth of plumbing later.
- Extra surface (reviewer adjudicating): rotateBasisByQuat.ts extraction; cameraRuntime.surface home; engageHR tiebreak reuse; one-frame handoff at driver deactivation (claimed benign); tilt = secondary drag only, ceiling deferred to T17 (T17 carry).
- Prettier drift landmine: `npm run format` touched 654 unrelated files — reverted; future tasks use `npx prettier --write <files>` only (already standing instruction).
- OPUS reviewer dispatched on review-8c742d98f..352245836.diff (62KB); verdict file task-16-review.md.
- T17 CARRY: tilt ceiling application (implementer deliberately left to T17); zoom-at-rest pixel gap; one-frame handoff note.
- REVIEW VERDICT: Spec FAIL · Quality REVISE. 1C/2I/6m (task-16-review.md). C1: body-arm gesture latches vs camera.base not live pose (grab mid-tween = ordinary path via wireInput pointerdown cancel); fix = route lastPose.current when arm matches, keep base.frame gate. I1: NO collision floor on position-writing modes (only anchoredZoomStep has one; T17 is orientation-only → no owner) — assigned to this fix round via surfaceFloorM. I2: clip row re-wins at pointerup, commit-on-edge overwrites the gesture; comment promises opposite.
- Adjudications: extraction + cameraRuntime.surface home + engageHR tiebreak (1.71≈1.70, unpinned → M1 test) + rewritten-test coverage all UPHELD; concern 4 understated → C1.
- Test-count reconciled: true delta +14 (6 authored + 8 auto-generated via directory-swept it.each); baseline 8210 → 8224 correct. No skips/only anywhere; real tsc green.
- Fix round 1 dispatched (resume implementer): C1 + I1 + I2 + M1, minors at judgment.
- Fix round 1 landed: b5db931ee76677a83a6cc5f75fd28cb0c851d1bc, +5 tests → 8229 full-suite green. C1: lastPose.current routing + per-drain local chaining. I1: flooredPose at single drag exit (radial push). I2: clip===null on surface row + early return under clip; T22 PRODUCT FLAG — grabbing globe during tour beat does nothing until beat ends; hands-win remedy = clipPlayer.stop() at gesture start (user call at feel gate). Minors M1/M2/M3/M6 applied, M4/M5 skipped with recorded reasons. Corrected task-16 test accounting: 8210 → 8229 (+19: 6+8 round 1, +5 round 2).
- Sonnet scoped re-review dispatched on review-352245836..b5db931ee.diff.
- Re-review: ALL ADDRESSED (C1/I1/I2 each independently mutation-verified; both I2 halves load-bearing; scope clean; absolute path untouched).

Task 16: complete — commits 352245836 + b5db931ee. Surface gestures live (pan/trackball/look/tilt/zoom + floor + clip arbitration), suite 8229 green. T22 product flags: zoom-at-rest centre-anchored; hands don't win during tour beat.

## Task 17 — dispatched
- Implementer: sonnet, main tree, BASE b5db931ee (T16 closed, suite 8229, pushed; main unchanged). Ceiling enforcement, orientation-only, same file as controller. Carries: own eye-anchored ENU ruling, floor/ceiling composition order (ceiling at FINAL standpoint), no duplicate of T16's engageHR pin test.
- Handling on DONE: review-package b5db931ee..HEAD → sonnet or opus by diff size (small expected → sonnet with geometry lens; escalate if the ENU/composition maths look subtle). USER FEEL-CHECK PING right after T17 closes.

## Side-track (user-directed, 2026-09-01): layer-split bug + camera debug panel
- USER BUG REPORT while testing T16 gestures live: (a) star layer and galaxy layer move independently when zooming in on Earth; (b) Moon drifts off its orbit trail. Suspected: divergent pose/epoch sources post-fold (M3 window / epoch split). OPUS read-only investigator running → findings to bug-layer-split-investigation.md. NO FIX until user sees the finding.
- USER ASK: camera debug section in debug toolbar (old closed PR #623 had one), accurate for FramedCameraPose. Sonnet implementer in ISOLATED worktree (merge b5db931ee first) → cherry-pick by SHA onto camera-pivot when done. Shows: stored vs rendered arm + mismatch flag, h/R + hysteresis band, epoch delta, anchor/gesture/driver info.
- T17 (ceiling) still running in main tree, unaffected (surfaceController only).
- INVESTIGATION VERDICT (bug-layer-split-investigation.md): defect A = NEAR0 slab basis hard-codes roll 0 (slabs.ts:351) vs COSMO/body slabs honouring cam.roll; toWorldArm is sole roll producer → engage ⇒ stars/MW/trails shear vs galaxies/Moon (symptoms 1+2). Defect B = toWorldArm limb-miss branch re-aims world pose at body CENTRE → 15.8°/883 km jump at h/R 2.665 (symptom 3, feeds A). Symptom 4 (zoom asymmetry) = BY-DESIGN hysteresis, disproves threshold mixup; regimeArmFor correct. Corrections: earthSubCamera = earth-tile VT readout not RTC; debug dump is a faithful reader. FIXES PROPOSED TO USER, awaiting go (A trivial; B = design care in conversion pair).
- Camera debug panel (user ask): DONE in isolated worktree, cherry-picked as 4b4? — commit 23ccfe01a onto camera-pivot, typecheck + 15 focused tests green, pushed. Shows stored-vs-rendered arm MISMATCH flag, h/R vs 1.7/3.4, epoch delta, anchor/driver. Gesture-mode latch OMITTED (surfaceController private closure, T17 owns file) — T17/T18 candidate: add read accessor. Agent worktree removed.
- T17 implementer: DONE, commit ea0822957f710c153b7e45309e67d691fc43497a. Full suite 8247 green. Ceiling after floor (final standpoint), own eye-anchored ENU, true no-op below ceiling (roll preserved — rebuild-always broke 2 tests, reverted). USER tilt-inversion folded in (negate at tilt use site only; 2 direction tests updated; re-pick test now computes anchor via cursorRayBodyLocal/raySphereRoots = potential call-vs-call, review lens #4). Report: task-17-report.md.
- OPUS reviewer dispatched on review-b5db931ee..ea0822957.diff (2 commits — includes debug-panel 7d7ef9b36 for defect-scan only). Verdict → task-17-review.md.
- Pushed through ea0822957. Awaiting user go on layer-split fixes A (NEAR0 roll) + B (limb-miss continuity).
- REVIEW VERDICT: Spec PASS · Quality REVISE. 1C/4I/6m (task-17-review.md). C1: heading-through-clamp unpinned (heading→0 survives 1236 tests; all fixtures polar/heading-0). I1: ENU derivation dead under test (east hardcode survives 1090). I2: roll snaps 45°→0 in one tick at ceiling crossing — deviation stands, record header line + T22 FEEL FLAG. I3: ENU/heading-tilt duplicated verbatim (2× NADIR_ESCAPE_SIN) → extract utils/camera/headingTiltAt.ts. I4: debug panel epoch eps wrong currency (wall-clock vs sim days — permanently "stalled" at fast rates). Point 3 (tilt sign) + point 4 (re-pick test NOT blind) verified clean. hOverR export behaviour-neutral.
- Fix round 1 dispatched (resume implementer): C1+I1 via off-pole non-zero-heading fixture, I3 extraction, I2 header+flag, I4 currency fix, minors at judgment.
- T22 FEEL FLAGS now: zoom-at-rest centre anchor · hands-vs-tour-beat · zoom asymmetry in band (by-design check) · roll snap at ceiling crossing · tilt-above-ceiling standpoint slide (review m).
- Fix round 1 landed: 0579c5af3720290192d4484fab9de0dc1b87c153, suite 8255 green (real tsc too). C1+I1 via I3 extraction (utils/camera/headingTiltAt.ts, single NADIR_ESCAPE_SIN home) + off-pole non-zero-heading test, both mutants killed. I2 = header line + T22 flag. I4 = epoch tolerance derived from deriveSimDays/TimeState, fast-rate test mutation-verified. M1/M2/M3 applied (M2 caught its own fixture bug), M4/M5/M6 skipped per review scoping. Sonnet re-review dispatched on review-ea0822957..0579c5af3.diff.
- Re-review: ALL ADDRESSED (C1 mutant re-killed independently; I4 discriminator confirmed vs old constant; scope clean).

Task 17: complete — commits ea0822957 + 0579c5af3. Ceiling enforcement live, tilt direction per user, headingTiltAt extracted, debug-panel epoch fixed. Suite 8255 green.
- MAIN TREE QUIET. USER FEEL-CHECK WINDOW OPEN (the ledgered T16/T17 boundary ping). Holding T18 dispatch until user finishes hands-on pass + rules on layer-split fixes A/B (both touch the render path under test).
- USER: shear persists (expected — fix A was held for go); "have a fable agent look at it" = go for fix A. FABLE FORK dispatched (user-directed exception to never-Fable rule): verify defect A at HEAD, thread roll into NEAR0 basis, audit ALL imagePlaneBasis call sites for roll-blindness, mutation-verified test, full-suite gate, commit (no push — controller gates). Defect B still NO CODE (re-confirm diagnosis only). Handling on DONE: verify diff, push, user re-tests shear; B remains awaiting explicit go.
- FIX A LANDED + PUSHED: a676cdc97e8e30cebf571d24d1fe6d77c48a2ba7 (NEAR0 slab honours cam.roll; 11 call sites audited: 1 fixed, 7 correct, 3 left with rationale; roll-parity test mutation-verified; suite 8256). Defect B re-CONFIRMED live at poseFrameConversion.ts:110-115 — STILL awaiting explicit user go ("roll permanent after disengage" residual also waits on B).
- USER RULINGS (zoom feel, supersede T22 flags 1+3): at-rest wheel zoom anchors at CURSOR surface pick (pixel plumbing through recognizer/aggregator/InputStep); zoom-out + miss anchor moves body centre → SUB-EYE surface point (FW-H preserved: cursor never anchors zoom-out; recession stays centre-directed). Spec §6b amendment sanctioned. OPUS implementer dispatched (zoom-feel wave, BASE a676cdc97) → report zoom-feel-wave-report.md. Handling on DONE: opus review (FW-H pin, 260-notch round trip, reciprocity test honesty), then push + user re-test.
- USER GO: defect B pop fix DEFINITELY wanted. USER ASK: research Cesium/Google Earth implementations first (limb-miss target fallback + zoom anchoring) — OPUS research agent dispatched → prior-art-cesium-ge.md. B implementer dispatches AFTER zoom wave lands + research in (serial tree), design informed by prior art.
- User symptom during zoom-wave HMR churn: Earth drifts off view-centre on zoom-out — acceptance test relayed to zoom-wave implementer (angular invariance of body centre across zoom-out notches; anchor must sit on the eye radial) + probe-file cleanup ordered.
- USER RULING (zoom wave fix 3): heading converges to NORTH-UP during zoom as a smooth per-notch blend (GE behaviour), never a snap. Constraints relayed: zoom-writes only (drags/tilt/look untouched — T17 C1 heading-preservation test stays true, blend ≠ clamp), single basis rebuild composed with ceiling enforcement, shortest-arc across ±π wrap, blend fraction = named feel-open constant. Research agent asked to confirm GE/Cesium blend shape (Q3).
- USER RULING (zoom wave fix 4, GM base-pose return): zoom-out blends view back to canonical framing (body centred + north up + top-down) — aim blend per notch, monotone, capped, no snap; zoom-IN does NOT re-centre (cursor point pixel-locked, only north blend). SUPERSEDES the angular-invariance acceptance → becomes angular-CONVERGENCE test. Researcher Q4 added (GM/GE re-centre mechanics, Cesium comparison, rotation composition order for pixel-lock + north blend).
- Zoom wave now carries 4 rulings: cursor zoom-in / sub-eye reciprocal zoom-out / north-up blend / base-pose return. All blend fractions = named feel-open constants for T22.
- PRIOR ART IN (prior-art-cesium-ge.md, Q1-Q4 with quoted Cesium source): Q1 Cesium never re-aims at centre (no persistent target; grazingAltitudeLocation = continuous nearest-point fallback; miss changes gesture MODE latched at rest). Q2 zoom rate ∝ (distanceMeasure − minHeight) both ways = log-symmetric; Cesium does NOT solve repelling pivot (bugs #4913/#2968/#4639) — our sub-eye fallback strictly better. Q3/Q4 north-up + base pose = ZOOM-KEYED CLAMPS not blends (emergent convergence, no poppable state) — same architecture as T17 tilt ceiling; pixel-lock composition rule: rotate about ANCHOR axis (commutes with zoom along eye→anchor), never about eye.
- POP FIX DESIGN (from Q1 recommendation): keep target ON the forward ray both branches — rangeM = hit ? nearRoot : max(t*, altitudeM), t* = −dot(eyeLocal, forwardLocal); C⁰ through limb (nearRoot = t* − sqrt(disc)); viewDir stays forwardLocal ⇒ jump zero by construction. Use this for the B implementer brief.
- Clamp-over-blend refinement relayed to zoom-wave implementer (maxHeadingRad(h/R) + aim-offset ceiling in the same composed rebuild as tilt ceiling; ruling unless prohibitively late — implementer reports which shipped).
- ZOOM WAVE LANDED: 87f9f7ed9a5619640562d7c651c64c3e7cff2568 (fixes 1+2: cursorPx plumbing; sub-eye anchor, radius=bodyRadiusM — floor radius would deadlock an eye on the descent floor) + 0e6f0177fc2bbe44cf48599c8816a1d95d16b636 (fixes 3+4 as zoom-keyed CEILINGS per prior art; deviation: heading clamp recession-only, evidence 0.37 rad anchor drift on clamped dive). Suite 8265 (+9), 12 mutants killed. NOT PUSHED (review first). Report: zoom-feel-wave-report.md.
- Key implementer finding: Earth-drift-on-zoom-out NOT producible by either anchor → defect B (confirmed candidate) or world-arm zoom above band. B queued next with ray-continuous design.
- OPUS reviewer dispatched on review-a676cdc97..0e6f0177f.diff → zoom-feel-wave-review.md. Handling: fix rounds as needed → push → dispatch B implementer (poseFrameConversion toWorldArm, rangeM = hit ? nearRoot : max(t*, altitudeM)) → review → push → USER SETTLE PING.
- ZOOM WAVE REVIEW: Rulings PASS · Quality REVISE. 0C/3I/6m (zoom-feel-wave-review.md). I1: clamp trigger widened to h/R 0.03, 90° single-tick spin measured, §12-R4b "cannot pop" false → DELTA-ROTATION clamp form (also retires T17 roll-snap flag). I2: approach has no heading authority (82° north-off after off-centre dive) — violates user's "zooming in, north always up" → implement Q4(c) anchor-axis rotation on approach (gesture-authored write ≠ clamp; pixel-locked, altitude-preserving). I3: ascent figure corrected ~123 notches (report only). Recession-only clamp form UPHELD (0.37246 rad drift reproduced). Point-8: slow ascent + retreat north-up onset = T22 flags; roll-snap trigger = fixed via I1.
- Fix round 1 dispatched (resume implementer): I1 delta-clamp + spec sentence, I2 anchor-axis approach blend, I3 report fix. Ruling: I2 decided by the user's existing verbal ruling, not deferred — cost if wrong: one revert of a bounded feature.
- Zoom-wave fix round 1 landed: c4f82fc4b371017fcdf9494b24e1316bbb121fc3, suite 8268 (+3), 6 new mutants killed, M3/M12 re-verified. I1: delta-rotation enforcement (pop 1.5704→0.0005 rad; RETIRES T17 roll-snap flag; spec §6/§12-R4b corrected). I2: anchor-axis approach blend clamp(0.25·residual, ±0.1) — dive 2.39→0.011 rad north-up, anchor drift 0.0; residual = SCREEN-UP azimuth (forward's fails polar case, test-pinned); recession heading limit load-bearing only h/R≳1.5 (M12 fixture moved). I3 report fixed. m1/m2/m5/m6 applied, m3/m4 skipped per scoping. NEW WATCH: standpoint walks around anchor on approach (exact but check in app); two norths (heading vs screen-up — same when roll-free); cap constant = the no-pop property.
- Sonnet re-review dispatched on review-0e6f0177f..c4f82fc4b.diff. Then: push wave (3 commits) → dispatch B implementer → review → push → USER SETTLE PING.
- Re-review: ALL ADDRESSED (delta form verified no-reconstruction-left; anchor-axis geometry verified; M12 load-bearing at new fixture; T17 C1 tests green). OPEN (T22/pop-fix follow-up): two-norths divergence real+reachable — rolled retreat converges headingRad→0 but not screen-up.

ZOOM WAVE COMPLETE: 87f9f7ed9 + 0e6f0177f + c4f82fc4b. Pushing; dispatching B (pop fix) implementer.
- ZOOM WAVE PUSHED (through c4f82fc4b). B (pop fix) OPUS implementer dispatched, BASE c4f82fc4b: ray-continuous target (rangeM = hit ? nearRoot : max(t*, floor)), consumer audit mandated, 15.8°/883km regression fixture, limb-sweep continuity test, disengage-path analysis, roll-residual verdict. Handling on DONE: opus review → fix rounds → push → USER SETTLE PING (contents: roll shear fixed, zoom model per 4 rulings, pop fixed, what to test, feel constants list).
- POP FIX LANDED: cc9ac86271e9e494da9cd8584214de4601babd34 (rangeM = max(hit ? nearRoot : t*, altitudeFloor); direction jump zero by construction; suite 8270; restore-mutant fails 3 tests at exactly 0.274 rad/887,668 m). Roll DISCONTINUITY retired (0.3 rad held 12 digits across sweep); permanent-roll two-norths gap remains BY DESIGN. Corroboration: tilt ceiling < tangency angle above h/R 2.79 ⇒ limb reachable only below — user's 2.665 inside the window. Disengage-with-ray-off-body reachable via clip/tween/flyTo (ceiling binds driven writes only) — fix makes those continuous.
- ADJACENT (await review classification): applyInputToCamera.ts:56 world-arm pan roll=0 (one-token, defect-A shape, input feel → visual check); slabs.ts:337 distance−pivotRadius double-subtraction (now uniform 16,081 km, unrepaired).
- OPUS reviewer dispatched on review-c4f82fc4b..cc9ac8627.diff → pop-fix-review.md. On close: push + USER SETTLE PING.
- POP-FIX REVIEW: Correctness PASS · Quality REVISE (0C/2I/3m, pop-fix-review.md). Verified hard: only rangeM branches; roll 0.3 identical 12 digits; mutant re-killed at 0.2738 rad/887,668 m; √ε assertion kills step independently; floor single-sourced + inactive at limb 32% margin. I1: fix EXPOSED a new reachable state — off-ray disengage (absolute arm) + wheel notch → zoomedDistance h≤0 degenerate branch → clampDistance snaps eye out ~R. RULING: overrode reviewer's report-only scoping — code fix round dispatched (continuous first-notch behaviour + regression test); cost if wrong: one small guard. I2: double-subtraction = TWO sites (slabs.ts:338 + scaleBar.ts:103, fails closed, negative below h/R≈1) — single backlog item, design-bearing (who owns cam.distance semantics post-body-arm, 3 consumers re-derive).
- SETTLE-PING QUEUE: pan-roll one-token (applyInputToCamera.ts:56) = user ruling; double-subtraction backlog item = user ask (adjacent-findings convention: offer pick-up, don't silently backlog).
- Pop-fix fix round 1 landed: 35884c6dc4e9792a766450312bc8931f26002978, suite 8271, both mutants verified. I1 guard = min(floorMpc, distance) in zoomedDistance h≤0 (never ratchet outward; owner = cam.distance un-braiding backlog, now THREE sites). IMPLEMENTER REFUTED reviewer's I1 mechanism (altitude floor bounds distance ≥ |eye|−R; same-body tilt route impossible) but found real PRE-EXISTING cross-body route (Moon disengage 3.4·R_moon < Earth pivot floor). Sonnet re-review adjudicating the refutation + verifying guard/mutants. On ALL ADDRESSED: push + SETTLE PING.
- Re-review: ALL ADDRESSED; refutation ruled FOR implementer (same-body route impossible; cross-body Moon/Earth route real + pre-existing). POP FIX COMPLETE (cc9ac8627 + 35884c6dc), typecheck green, PUSHED through 35884c6dc. SETTLE PING SENT. Remaining user items: pan-roll one-token ruling · double-subtraction backlog offer (3 sites) · T22 feel constants. Next: resume T18 after user pass.
- USER: pop STILL present on zoom-out at HEAD 35884c6dc → FORK 2 investigating (candidates: disengage flip edge, zoom-law handoff, aim-clamp cutoff, pan-basis roll-0 snap) → bug-zoomout-pop-2.md. USER ASK: thorough Fable review → FABLE FORK reviewing whole engaged-camera stack (3 lenses from defect history + edges + one-fact-two-homes + simplicity) → fable-deep-review.md. USER FEEL: re-orientation ranges asymmetric in vs out (structural: anchor-axis blend any-altitude vs ceilings h/R≲2.2) — relayed to deep review as design question (one authority curve?).
- USER OBSERVATIONS (north cluster): orbit drag loses north (holonomy roll) · zoom-in restores it (anchor-axis blend working) · RULING: north-up correction must be SMOOTH continuous convergence (same character as backing-off), never a trigger/snap. Design direction under Fable review: north-locked engaged camera (pan = parallel transport in ENU field, roll never enters; tilt = only off-vertical freedom; smooth decay for pre-existing roll; one altitude-keyed orientation authority both zoom directions). All relayed to deep-review fork.

## Compact checkpoint 4 (2026-09-01, post pop-2 trace)
- BRANCH: camera-pivot @ 35884c6dc (pushed, suite 8271). Plan T2-T17 complete; T18-T22 PAUSED for feel side-quest; briefs beyond 17 not yet generated.
- POP 2 TRACED (bug-zoomout-pop-2.md, high confidence): fold's disengage commit emits ray-target pose (distance=altitude); next at-rest frame applyFocusedBodyPivot.ts:57-63 retargets to body centre keeping yaw/pitch/distance → eye teleports 1 body radius inward. FIX SKETCH: eye-preserving retarget to centre at fold's disengage branch; TEST: two-frame eye-continuity across disengage with pin active. NOT yet dispatched.
- IN FLIGHT: FABLE deep-review fork → fable-deep-review.md. Carries: 3 defect lenses + edges + one-fact-two-homes + north-locked architecture evaluation (pan = parallel transport, roll never enters, tilt only freedom, smooth decay for existing roll) + one altitude-keyed orientation authority + BINDING RULING: all north correction smooth/continuous, never triggered. Do NOT duplicate its work.
- HANDLING when deep review lands: compose ONE fix wave = pop-2 eye-preserving retarget + review's Criticals/Importants + north-lock architecture IF review upholds it (else present to user). Opus implementer, main tree (free), full-suite gate, opus review, push, USER PING.
- USER ITEMS still open: pan-roll one-token ruling (applyInputToCamera.ts:56) · cam.distance un-braiding backlog offer (3 sites) · T22 feel constants.
- Watch: probe-clamp.ts diagnostic = stale editor noise from a fork's restored probe (tree clean at last check; verify `git status --porcelain` before next commit).
- USER RULING (5th, approach-nadir): zoom-in converges smoothly to looking straight down at the dived-on point (tilt→nadir), GM character — today tilt ceiling binds recession only. Relayed to deep review with the pixel-lock-vs-tilt-convergence tension to resolve (both can't be exact; recommend which yields). Full orientation target = north-up + nadir, one altitude-keyed authority, both directions, no triggers.

## Fix wave (post deep review) — 2026-09-01
- Fable deep review LANDED → fable-deep-review.md: 1 Critical (C1 one-tick 153° ceiling snap, probe-measured), 4 Important (I1 dual return mechanisms, I2 pan holonomy roll, I3 45° azimuth-source flip, I4 dual orientation writers), 5 minors. R1 (north-locked engaged camera: gestures never create roll, ONE altitude-keyed orientation target heading-north/tilt-nadir, ONE bounded decay ORIENT_SHARE/ORIENT_CAP both zoom directions, tilt pivots about anchor → pixel-lock preserved) UPHELD — retires C1+I1–I4 and satisfies all 5 user rulings.
- Ruling: fix wave = pop-2 disengage retarget (bug-zoomout-pop-2.md sketch) + R1 in full + m2 large-residual test. Deferred: m1 pinch midpoint (T22), m3 (T19), m4 (pre-existing), cam.distance un-braid (backlog).
- Fix-wave implementer DISPATCHED (opus, this worktree). BASE=35884c6dc. Brief: fix-wave-brief.md. Report → fix-wave-report.md.
- Handling when report lands: review-package BASE..HEAD → opus reviewer (fix-wave-review.md) → fix rounds as needed → full suite (baseline 8271) → push to #647 → USER PING (cover: pop-2 fix, north-lock/nadir behaviour change, trackball deleted, open items: pan-roll one-token ruling, cam.distance backlog offer, T22 constants tuning). Then board refresh; plan T18–T22 resume after user feel pass.
- 2026-09-02 USER: "build it with fable" — opus implementer STOPPED mid-R1; its pop-2 commit 87d24cfa8 + uncommitted R1 partials DISCARDED (reset --hard 35884c6dc; commit recoverable via reflog). Fresh FABLE implementer dispatched, same brief (fix-wave-brief.md), BASE unchanged 35884c6dc. Handling plan unchanged (opus review → fix rounds → suite 8271 → push → user ping).
- 2026-09-02 USER: "so much code, still doesn't work, why can't it be simplified" → adversarial simplicity audit DISPATCHED (fable, read-only, isolated worktree snapshot; greenfield-justify protocol vs docs/superpowers/conventions/intent.md + spec). Report → adversarial-simplicity-audit.md. Handling: fold its verdict into the fix-wave adjudication — if it indicts the architecture beyond R1, present options to user BEFORE further waves.
- Adversarial simplicity audit LANDED → adversarial-simplicity-audit.md (recovered via re-emit after isolation worktree auto-clean ate the original). Verdict: ~18,100 LOC (7,250 src/10,900 test); 60-65% essential, ~10% accidental mechanisms, ~20% comments (~700 over budget), 5% debug. Diagnosis: N competing correctors instead of one constructor + live pose has 4+ homes synced by edge protocol → fixes land as new mechanisms; defect rate = mechanism count not LOC. R1 fixes half; does NOT touch pose-home duality/commit-on-edge compensators/60Hz body-arm dispatch/follow fragments — next defect family predicted there. Candidates: (1) dead reanchoredPose −194, (2) dead surfaceReadoutOf −281, (3) world-arm-returns-pose + ONE pose home −540/−4 mechanisms, (4) comment pass −600-700, tween self-commit −190, strategic body-relative focus −750 high-risk gated. Net near-term ≈ −1,800 (~10%). Relayed to user, recommended candidates 1-3 as follow-up wave post fix-wave. AWAITING user ruling on candidates (leanness convention — deletions are user's call).
- 2026-09-02 USER RULING: audit candidates 1-3 APPROVED — execute immediately after the fix-wave implementer finishes. Sequencing: fix-wave report → dispatch simplification wave (1: delete reanchoredPose, 2: delete surfaceReadoutOf+type, 3: world-arm-returns-pose + ONE live-pose home) as its own implementer (fable) with adversarial-simplicity-audit.md as authority → then ONE review over both waves → full suite → push → user ping. Candidate 4+ (comment pass, tween self-commit, body-relative focus) NOT approved yet.
- Fix wave DONE_WITH_CONCERNS (fable): 0165e2e3f pop-2 disengage-convention retarget + eye-continuity test; 89edd0988 R1 full (ORIENT_SHARE/ORIENT_CAP one authority both directions, anchor-pivoted dives/eye-pivoted recessions, pan north-locked per-step capped transport, DELETED trackball/clampHeading/northedOverAnchor/engageHR-tiebreak, new util cappedRotationToward, m2 test). Suite 8279 green, 9 mutations verified. Concerns for user ping + review: (1) disengage tilt asymptotic ~0 not exact — violent recession can carry ≤0.5 rad bounded one-frame re-aim, T22 lever = cap scales with notch; (2) pan north-lock = meridian-convergence corrective, degenerate near poles (feel gate); (3) dives re-centre tilt toward nadir per notch — old "never for centring" test consciously deleted. Report: fix-wave-report.md.
- Simplification wave DISPATCHED per user ruling (fable, BASE=89edd0988, brief simplification-wave-brief.md, re-verify audit claims post-R1). Report → simplification-wave-report.md. Then: ONE opus review over BOTH waves (BASE 35884c6dc..HEAD), fix rounds, suite (baseline 8279), push #647, USER PING (incl. fix-wave concerns 1-3).
- 2026-09-02 USER RULING 6 (live test of fix wave): zoom-out must NOT converge tilt toward nadir — GM/Cesium lerp smoothly back to the off-body pose over the recession range. Diagnosis confirmed at surfaceController.ts canonicalledPose: tilt residual measured against nadir both directions. Fix ruled: recession tilt residual = max(0, tilt − maxTiltRad(h/R)) (converge into the altitude-keyed band; ceiling→0 at disengage makes the return a distributed lerp); dive keeps nadir target (ruling 5). Heading/roll decay unchanged. QUEUED as fix round for the fix-wave implementer AFTER the simplification wave finishes (shared worktree, sequential). Test to add: below-ceiling tilted pose + one recession notch ⇒ tilt unchanged; above-ceiling ⇒ capped decay toward ceiling only.
- 2026-09-02 USER RULING 7 (same test pass): zoom-out from centre feels weird — recession must be SYMMETRICAL with the cursor-anchored zoom-in (GM: wheel zoom pins the cursor point both directions). Fix: recession uses the same cursor-anchored zoomStep/anchor pick as dive (drop the anchorM-null/sub-eye radial special case where a cursor hit exists; sub-eye stays the miss fallback). Interacts with ruling 6: recession orientation settle then pivots about the cursor anchor like the dive does, targets = into-the-band tilt + north heading. Both rulings = ONE fix round, queued behind simplification wave.
- 2026-09-02 USER RULING 8 (same test pass): the tilt from the main camera orientation frame to Earth's orientation frame (equatorial) currently TRIGGERS at a height — must blend smoothly over an altitude band, with zoom (user believed this was already implemented). Fix-round implementer must first locate the triggering mechanism (world-arm aim clamp / up-frame alignment on approach — check applyWheelZoom aim path, poseFrameConversion entry, any engage-keyed up switch), then key it to an altitude band with the same bounded-decay discipline as the orientation authority. Rulings 6+7+8 = ONE fix round, queued behind simplification wave.
- USER clarification on ruling 8: "same lerp" — the frame transition uses the SAME lerp as the other orientation settles (the one authority's bounded decay / band), not a parallel mechanism. One curve, one decay, everywhere.
- Simplification wave LANDED (fable): 475c12559 reanchoredPose −194; bd30fdfe8 surfaceReadoutOf+type −281; be218c930 one live-pose home (pure fold → cameraRuntime.lastPose, store commits on gesture-end/wheel-notch/regime edges; seedCameraFromBase, per-step body-arm dispatch, commit-before-endDrag asymmetry, surface driver row, accumulateFollowPan/lastPanTarget all DELETED, 6 mechanisms retired) −234. Net −709 (src −246/tests −463). Suite 8249 green (−31 with features, +1 strafe-fold), typecheck:fast verified clean by controller (editor diagnostics were stale). Concerns: c3 actual −234 vs audit ≈−540 (R1 pre-consumed mass); mid-gesture camera.base in body arm now updates at release (URL-hash/debug readers one gesture later — feel-gate item); m3 fly-to window remains (T19); state.cam survives as boot proxy (future retire candidate). Report: simplification-wave-report.md.
- Fix round rulings 6+7+8 DISPATCHED: fix-wave implementer RESUMED with brief fix-round-rulings-678.md @ BASE be218c930, baseline 8249. Then: ONE opus review 35884c6dc..HEAD (both waves + fix round), suite, push #647, USER PING.
- Fix round 6+7+8 DONE_WITH_CONCERNS (fable): b4c166847 rulings 6+7 fused (recession tilt residual = excess over ceiling; anchoredZoomStep cursor-anchors BOTH directions, FW-H carve-out overruled); 4a2e4628e ruling 8 (trigger was the engage edge itself — followBody dropped roll; new frameAlignedRoll extends the ONE authority to at-rest world-arm notches, decay pair homed in data/camera/orientDecay.ts, rollFromScreenUp extracted, follow pose lerps base.roll). Suite 8266 green, +7 tests all mutation-verified, typecheck verified clean by controller. Concerns: (1) ruling-7 anchor-pivot-recession prediction REFUTED by measurement (self-cancel ~h/(R+h), 40-notch stall at 1.46 rad) — shipped position-anchored both ways + orientation eye-pivoted on recession w/ toNadir discriminant, review to re-adjudicate; (2) convergence RATE steps at engage edge (≈0.5→1.0) — left alone, review judges; (3) alignment rides at-rest wheel notches only, no pinch path; followBody writes fresh base identity per notch; (4) baseline discrepancy 8249 vs 8259 pre-round.
- COMBINED OPUS REVIEW DISPATCHED: 35884c6dc..4a2e4628e (7 commits, all three units), package review-35884c6dc..4a2e4628e.diff, adjudications a-d requested → combined-review.md. Then: fix rounds if REVISE → push #647 → USER PING (ping covers rulings 6-8 behaviour, simplification timing change, fix-wave concerns).
- Combined review LANDED: REVISE/REVISE (rulings C1/I2/m2; quality I2/m5) → combined-review.md. C1: below-ceiling exemption + fixed cap ⇒ recession reaches disengage ~45-91° off nadir ⇒ one-frame re-aim (pop class at disengage edge). Adjudications: (a) self-cancel measurement CORRECT (φ·R/(R+h) re-derived), toNadir shape right but ruling-6 intent unmet; (b) engage rate step acceptable; (c) camera.base clear BUT real regression found: at-rest body-arm wheel notch swallowed when drag starts same drain; (d) 8259 = accounting error (+7 explicit +8 it.each, 2 residual). Gates independently re-run green (8266/1187).
- Ruling: recession tilt RIDES THE CEILING (wall, min(tilt, maxTiltRad) per notch) — distributed with zoom progress, tilt structurally 0 at disengage; capped decay only for non-zoom-authored excess; below-ceiling still untouched. FIX ROUND 2 dispatched to fix-wave implementer (resume #2): all Criticals+Importants, swallowed-notch regression, minors trivial-or-park. Baseline 8266. Then scoped re-review (resume opus reviewer) → push #647 → USER PING.
- Fix round 2 DONE (fable): b693e4a43 C1 wall (ceiling-ride per notch, inheritedTiltRad decay-only, crossing test, dead anchor param deleted); 77a3baa9a I1 register-write both arms + swallow regression tests; 0e20a17fa I3 spec sync (10 edits) + M2/M4/M5/M6/M7. Suite 8273 green. Dispositions: all C/I/M fixed except I2 disclosed-no-code (engage rate step, feel gate) and M3 PARKED (sky-dive settle asymmetry — needs user feel ruling). Concerns: fast zoom-out re-levels fast (proportionate, GM-correct — feel-gate watch); inherited clip/tour excess can cross disengage with bounded remainder (comment names it).
- Scoped re-review DISPATCHED (opus reviewer resumed) on 4a2e4628e..0e20a17fa. On APPROVED: push #647 → USER PING (rulings 6-8 + wall behaviour + I2/M3 open feel items + simplification timing change).
- Scoped re-review APPROVED (independent probe re-run: tilt 0.0° at crossing across 5 rates × 4 tilts; count model confirmed). Non-blocking N1 for feel gate: wall = commanded per-notch turn, max 16° at default notch (h/R≈2.2), 97° at MAX_FACTOR clamp — right trade, stated property.
- origin/main MERGED at boundary (007314379, 5 commits incl. #651 polyphorm workbench): one integration fix folded into the merge commit (createViewportInput wheel event now spreads xPx/yPx our branch added). typecheck clean, suite 8349 green. PUSHED to #647 @ 007314379. USER PING issued. Open feel-gate items: N1 wall turn rate, I2 engage rate step, M3 sky-dive asymmetry, pan meridian-convergence, simplification base-at-release timing, disengage inherited-excess remainder. Board refresh pending.
- 2026-09-02 USER RULING 9 (feel gate): roll toward the globally defined up axis (default ecliptic, must work with ANY configured axis) does NOT fully return on zoom-out — must follow the same lerp as the other parameters. Diagnosis (controller): frameAlignedRoll's correction is scaled by the band authority which → 0 above the band, so the decay stalls with residual left (same class as the tilt C1). Ruling: the altitude curve defines the roll TARGET (blend body-spin-axis ↔ global scene up across the band); zoom notches RIDE the target's change (wall) + capped decay for non-zoom excess — the tilt discipline exactly; global up read from the configured scene up axis, never hardcoded. Fix round 3 dispatched to fix-wave implementer; scoped re-review after; then push + ping.
- USER (mid round 3): "we end up in a completely different up vector" — possibly HMR-transient (implementer mid-edit on the live-served tree) but relayed to round 3 as candidate real symptom: check sign/hemisphere flip of the projected roll reference near the axis, quat double-cover, followBody fresh-base path; fixture = recede past the reference axis, converged screen-up ≈ configured global up (not negation/perpendicular). Implementer to state whether approved HEAD could exhibit it.
- Fix round 3 DONE (fable): 503efdbb9 bandRollTarget — curve-keyed screen-up target (RAW spin-axis projection at band floor ↔ frameUp(upBasis) at band top, verified routed not hardcoded), at-rest notches ride the target delta in full, capped decay only for non-zoom deviation; drainInput feeds pre+post poses. Suite 8351 green (+2 exact), 3 mutation kills. KEY: user's wrong-up-vector was REAL at approved HEAD (normalized pole projection unstable 2° off axis → −1.49 rad chase + stall −0.259 rad frozen) — both now unrepresentable. Concerns: in-band ~18° off scene-up near axis at h/R 1 = the honest blend (feel-gate); hardcoded-frame mutation only observable in-band; followBody roll lerp long-way-across-±π pre-existing noted.
- Scoped re-review 007314379..503efdbb9 DISPATCHED (opus resumed, 5 verification points incl. raw-projection continuity re-derivation). On APPROVED: push #647 → USER PING.
- Round-3 re-review APPROVED (analytic band-top completeness any frame; near-axis step OLD 164° → NEW 0.44° measured, user symptom reproduced independently; no-stall verified both paths — ride carries zero deviation by construction, genuine deviation 0.259→0.026 rad at band top vs 100% freeze; in-band 18.4° = correct ruled blend with monotone ladder; drainInput/register/followBody all clear; roll ride 2° default/11.4° max — no feel-gate disclosure needed). PUSHED #647 @ 503efdbb9. USER PING issued (ruling 9 resolved). NOTE for tests: `equatorial` frame is degenerate for Earth roll fixtures (its up IS the spin axis) — correct geometry, tests avoid it.
- 2026-09-02 USER: ruling 9 REOPENED after live test — zoom-out does NOT return to configured frame (equatorial persists); zoom-in first rolls to configured up then back to equatorial (= band blend working, localizes defect to zoom-out return not firing). Controller hypothesis: follow driver (Earth FOCUSED = default) gets (live,live) pre/post poses in round 3's drainInput feed ⇒ zero target delta ⇒ ride dead on the follow path; round-3 fixtures tested the resting driver only; re-review's "notch moves no distance there" claim suspect. FIX ROUND 4 dispatched (same implementer): PART A debug-panel expansion first (full orientation pipeline, copy-all button, user-requested) then PART B probe follow-path zoom-out + fix ride on every driven path + focused regression test. Baseline 8351.
- Fix round 4 DONE (fable): 23a2b31aa debug-panel camera section (full orientation pipeline + copy-all, live-path helpers no mirror); 21a460425 ruling-9 root cause CONFIRMED = controller's suspect (follow path pre/post identical ⇒ ride dead in default config; fix rides followDistanceTarget delta; gesture-held wheel — third driven path with NO alignment — also wired). Probe: 0.0478 rad frozen before, <1e-4 after. Suite 8354 (+3 exact), typecheck verified. Concerns: roll leads distance ease ~600ms (feel gate; riding eased altitude = the freeze); fixture simulates saturated ease (wall-clock runFrame sim = next step if residual persists); debug distance rows read rendered pose which lags target during ease. Scoped re-review DISPATCHED (told to re-examine its own round-3 blessing of the dead path). On APPROVED: push → USER PING.
- Round-4 re-review APPROVED (reviewer re-derived on own harness, admitted round-3 error class: judged instantaneous frame vs commanded altitude; residual got WORSE with faster zoom — 7.1° frozen at factor 1.5, now ~e-17 across rates; follow capture race-free; gesture-wheel double-apply structurally impossible; roll-lead worst mid-ease gap 0.23° only in 600ms after focus change — acceptable). PUSHED #647 @ 21a460425. PARKED one-line minors for next commit wave: R4-1 debug panel re-derives authority (would silently keep old formula if I2 lever changes — read snapshot's authority instead); R4-2 third nearest-body scan copy (fold into nearestBodyHR). FLAGGED R4-3 (not a defect): animated approach (focus tween + follow ease) enters band with no alignment — fails safe (arrives at scene up) but is the one uncovered path; first suspect on any third reopen. USER PING issued.
- 2026-09-02 USER: "the fix made it worse" (round 4, 21a460425). Asked user for copy-all dumps (mid-zoom + at-rest) + symptom description. Implementer dispatched to build wall-clock-faithful runFrame sim (ease UNSATURATED between notches) testing hypotheses: (a) roll rides commanded target while rendered altitude lags ease (bursty lead), (b) overlapping capture windows double-count, (c) gesture-wheel fold on trackpad duringGesture, (d) ride+crumbs both applying ⇒ overshoot. NO code changes until sim + user dump adjudicate. Round 5 investigation → fix-wave-report.md.
- Round 5 sim REPRODUCED the real mechanism (hypothesis e, off-list): recession stays body-armed through the whole 1.7-3.4 band (hysteresis), engaged settle norths to Earth ENU only (scene frame ignored), disengage bakes −0.2592 rad (14.85°) at h/R 3.68 — ABOVE the world ride's band top where authority=0 + above-band guard ⇒ frozen forever. Round 4 "worse" = inbound ride now fully tracks (deeper twist in), outbound freeze unchanged. Zoom-in symptom also reproduced by mechanism. Hypotheses a/b/c/d all cleanly refuted with traces.
- RULING (ruling 8 applied where missed): the frame blend belongs in the ENGAGED settle — canonicalledPose's north/up reference = band blend (Earth ENU at floor → scene frame up at disengageHR), same authority curve + ride discipline; disengage bakes ≈0 scene roll by construction; world-arm ride unchanged for never-engaged paths; band = the hysteresis window, one home. Fix round 5 dispatched: round-trip sim test <1e-4 at fast cadence, S2 control stays 0, no-double-authority pin, __round5probe cleanup. Baseline 8354.
- Fix round 5 DONE (fable): 846450405 — bodyUpWeight one-home band blend (pole at engageHR → scene up at disengageHR, hysteresis window IS the band), sceneUpLocal threaded body-fixed through SurfaceController.apply, engaged recession azimuth gets ride discipline. Sim round trip <1e-4 (was −0.2592 frozen); S2 control unchanged; 23 controller tests byte-identical; suite 8361 green, typecheck verified, tree clean. Concerns: (1) TWO BLEND CURVES seam at engage handoff (~0.2 rad, absorbed ~10 notches) — consolidation needs ruling, reviewer asked to recommend; (2) engaged reference co-rotates with body (bounded, at-rest never writes); (3) suite's first wall-clock camera sim test (~40ms deterministic). Scoped re-review DISPATCHED (6 points + ship-or-consolidate recommendation). On APPROVED: push → USER PING.
- Round-5 re-review REVISE: R5-1 CRITICAL (blendedRefAxis arc near zenith mid-band → 180°/notch on locus, 101° at 10° off; northern high latitudes; fixtures missed locus + controller tests defaulted sceneUpLocal=[0,0,1]); R5-2 CRITICAL pre-existing round-3 anti-parallel knot (raw terms cancel → π ride; yaw 0/pitch −1.40/hR 1.69 default frame — reviewer's own round-3 miss); shared root cause: normalize near-zero blend then ride uncapped. R5-3 debug heading reads pole frame while settle uses blend (instrument misleads); R5-4 azimuth dual-frame naming. Reviewer ruling rec ACCEPTED: ship the engage seam (dive-only, absorbed by cap), backlog consolidation w/ post-fix numbers (pre-fix: mean 10.4°/worst 34.8° ecliptic). Also record C1-wall↔round-5-bake load-bearing coupling.
- FIX ROUND 6 dispatched: (b) continuity-bound ride one guard both arms + (a) horizontal-projection blend engaged side; R5-3/R5-4; coupling comments; locus fixtures both criticals mutation-verified; post-fix seam re-measure. Baseline 8361. Then re-review → push → USER PING.
- Fix round 6 DONE_WITH_CONCERNS (fable): 20958d51a — ORIENT_DECAY.rideBoundRad=0.3 both arms (excess → capped decay); blendedEnuAt one home (settle + debug, R5-3 fixed, band_up_weight row); R5-4 renames; coupling comments. Suite 8371 green (+3 locus tests); on-arc flip π → ≤0.52 rad then converges; world knot π → ≤bound+cap. Post-fix seam UNCHANGED by construction (target-frame diff; response now bounded): ecliptic 10.4°/36° clean, 180° grid cells harmless — feeds consolidation backlog. CONCERNS: (1) (a)-projection blend analytically ≡ round-5 axis form — mutation unsatisfiable, (b) alone killed R5-1, reviewer to re-adjudicate own rec; (2) near-locus fast recession can freeze ≤0.166 rad above band (world inertness) — reviewer to judge vs user's twice-reopened frozen-roll class; (3) rideBoundRad=0.3 feel-open (T22). Scoped re-review DISPATCHED with 3 adjudications. On APPROVED: push → USER PING.
- Round-6 re-review REVISE (R6-1 CRITICAL): bound converts whip → permanent freeze (full-sphere sweep 4,128 standpoints: brisk scroll 10.4% ≥5°, 4.2% ≥15°, worst 157°); round-6 locus tests soft (60-notch park; 0.25 rad bar admits 14.3°). Reviewer RETRACTED its R5-1 (a) rec after verifying implementer's algebra (cross annihilates localUp component — projection ≡ axis blend; empirical 3.3e-8 over 20k triples); also corrected own round-5 arc-distance labels (~5× overstated). Adjudication 3 clean (C1 coupling documented, register write, no double-count, debug frame fixed).
- FIX ROUND 7 dispatched: (C) hold-and-transport across singular neighbourhood (carry preInBlendFrame north forward — path-continuous reference, no debt created) + (D) above-band debt drain (deviation-only, S2 stays 0); no-park recession tests at both cadences asserting at the disengage BAKE < 1e-2 incl. reviewer's worst cells; R5-3 45°-rule one-home nit. STOP-clause: if (C) needs another partial, halt and co-design with reviewer live — no third bound. Baseline 8371.
- Round 7 BLOCKED correctly (stop-clause honoured, no code): impossibility proof — on-arc endpoints anti-parallel ⇒ π rotation intrinsic; band crossed in 2-4 notches at e^0.10 / 2-3 at e^0.24; no-whip rate 0.4 rad/notch spends ≤1.6 rad ⇒ freeze-free + whip-free + <1e-2-at-bake mutually exclusive on worst cells (any two achievable). Projected under mandate: 88-111° at bake, draining only above band.
- RULING: implementer's resolution 1 adopted — never whip, never permanent; amended bar = <1e-2 at bake OUTSIDE singular neighbourhood; worst cells = no-whip rate + full drain ≤20 continued above-band notches same gesture; S2 <1e-4. (C)+(D)+R5-3 nit dispatched (D = delete frameAlignedRoll above-band early return). Rejected: locus whip exception (smoothness ruling), ramp widening (ruled deep behaviour, insufficient), Δw bounds (tuning not structure). Intrinsic-π trade documented in code. Baseline 8371.
- Round 7 DONE_WITH_CONCERNS (fable): e495366c4 — (C) stateless hold-and-transport in blendedEnuAt (HOLD_CONDITIONING=0.3, screen-up stand-in on cancellation; zenith keeps pole fallback, polar fixtures byte-identical); (D) frameAlignedRoll above-band early return DELETED (deviation-only decay, intrinsic-π documented); R5-3 refAzimuthOf one home. Suite 8378 green; singularLocusRecession.test.ts codifies amended bar; M7c/M7d mutations clean. DEVIATION FLAGGED: worst-cell drain 36-37 notches vs mandated ≤20 — arithmetic forced by ruled constants; controller SIGNED OFF ≤40 envelope (~1.2-2.2s monotone settle on singular cells vs permanent freeze; shortening = rejected tuning class). Concerns: (C) concentrates flip at zone exit (bake 151° vs 146°, trade = stillness in-zone); tour/clip arrival rolls now bleed above band (feel gate); first carry cut broke 5 polar tests before being restricted — polar fixtures load-bearing. Scoped re-review DISPATCHED (adjudicate drain arithmetic + ≤40 honesty, hold-gate stability, exit-flip rate, arrivals-bleed vs §12-R3, post-fix 4,128 sweep). On APPROVED: push → USER PING.
- Round-7 re-review APPROVED: drain arithmetic independently re-derived (closed form matches sim at every debt; ≤20 would need cap ≥0.135 = rejected class; ≤40 = theoretical worst not padding); hold gate stable stateless (no carryUp feedback, max 2 crossings, 2.5% enter zone); 23° max notch rotation both cadences (bound survives exit); (D) RESTORES R1 pt-4's own words — round 3's above-band hold was the deviation; polar byte-identity structural (w=1 ⇒ conditioning ratio exactly 1). Post-fix sweep: bake distribution unchanged from round 6 (expected — (C) relocates flip, (D) changes outcome), last column now DRAINS ≤37 notches instead of permanent. PUSHED #647 @ e495366c4 (rounds 5+6+7: 846450405, 20958d51a, e495366c4). USER PING issued with reviewer's mandated framing: singular-cell drain = "stops unwinding when you stop scrolling, resumes when you scroll again" (NOT "1.2-2.2s settle"). Suite 8378 green.
- 2026-09-03 USER RULING 10 (feel gate on e495366c4): zoom-out now CORRECT; residual roll pop at END of zoom-in @ altitude_m 11,534,448 (h/R≈1.81 = engage neighbourhood — the shipped two-curve seam); ruling = SHARED codepath so in/out discrepancies are structurally impossible. Round 8 dispatched: one reference field (bodyUpWeight/blendedEnuAt one home, world's maxTiltRad-keyed roll target deleted; S2 shape change now ruled), one settle discipline arm-agnostic (ride+decay+hold+drain shared object), reproduce pop first (expect engage-flip target discontinuity), symmetry property test (target identity over h/R sweep regardless of direction/arm) + dive regression at user's altitude. Baseline 8378.
- Blend curve Q&A: bodyUpWeight = smoothstep(disengageHR, engageHR, h/R) descending, C¹ edges. PARKED per user until round 8 lands + feel verdict: optional log(h/R) evaluation (uniform blend progress per geometric notch) as a T22 feel lever.
- 2026-09-03 USER: round-8 implementer near 1M tokens → STOPPED per user; uncommitted round-8 edits REVERTED (tree clean at e495366c4, no commits lost). Parting insight preserved in brief: "rate check fires on the conversion notch, not the post-flip burst — windowed before/after comparison needed". FRESH fable implementer dispatched with self-contained brief fix-round-8-brief.md (required reading: fix-wave-report.md rounds 1-7, combined-review.md, key files; ruling 10; symmetry property test; mutation contract). NOTE: the retired agent carried rounds 1-7 context — future fix rounds now go to the NEW agent or need brief-carried context; opus reviewer seat unchanged.
- Round 8 DONE (fresh fable, 239k tokens): 9726265fb — blendedUpDir one reference field (world arm gains hold-and-transport; maxTiltRad-keyed authority curve DELETED, maxTiltRad = tilt wall only); riddenOrientStepRad one rate discipline both arms verbatim; CI guards orientTargetSymmetry (cross-arm target equality, 1% fails) + engageFlipPop (windowed, user's altitude); 3 mutations clean. Pop mechanism CONFIRMED: flip minted ~0.12 rad discrepancy (world authority 0.53 vs engaged weight 1), walked out over ~8 notches — post-fix 1.8e-4. Suite 8390 green. Concerns → re-review: (1) in-band approach twist 0.059 vs 0.024 rad/notch (feel gate?); (2) 4,128 sweep NOT re-run (knot location shifts) — reviewer to re-run; (3) S2 fixture re-pin h/R 1.0→2.55 (below engage now pole-pure by ruling). Scoped re-review DISPATCHED (6 points + sweep + fresh-implementer misread check). On APPROVED: push → USER PING.
- Round-8 re-review APPROVED: unification verified by grep + algebra + empirics (engaged sweep bit-identical to round 7; world knot 180°→22.9° = R5-2 FIXED AT SOURCE, unclaimed bonus; cross-arm target continuity max jump 1.15e-3, target at 1.70 = −0.259204 exactly the round-5 frozen figure — seam closed by construction). Concern 1 = disclosure with corrected envelope: dive twist median 2.1°, p99 20°, worst 22.9° near singular locus (~1% tail) — implementer's 0.059 was typical not peak; gentler dive would violate ruling 10 symmetry. Concern 3 re-pin required (old position vacuous by ruling: bodyUpWeight(1.0)=1 ⇒ no scene term below engage). Reviewer ON RECORD: ship-the-seam call wrong, second "bounded therefore imperceptible" overrule by user's eye; unrepresentable > small, every time. PUSHED #647 @ 9726265fb. Suite 8390 green. USER PING issued. Feel gate: unified codepath + in-band dive twist disclosure. Parked/open unchanged: log(h/R) lever, north-up toggle offer, T18-T22, pan-roll one-token, cam.distance backlog, R4-1 panel authority dup (band_authority row deleted in R8 — likely moot, verify at cleanup).
- 2026-09-03 USER feel tune: tilt handle more responsive → TILT_GAIN = 1.6 on the tilt drag's pitch component only (surfaceController.ts, exported; rate-law comment updated), 2 hand-computed fixtures TILT_GAIN-corrected. 26/26 controller tests + typecheck green. COMMITTED 649f05239 (no explicit verdict — user moved on to ruling 11; constant stays tunable, revisit if tilt feel comes up again). Not yet pushed — rides the round-9 push.
- 2026-09-03 USER RULING 11 (verbatim): "lets try (log(h/R) blend-space, and add engage / disengage sliders, and north up toggle in separate subsection in the camera section debug". Unparks the log(h/R) lever + north-up toggle; adds live engage/disengage h/R sliders. ROUND 9 dispatched to round-8 fable implementer (abdf1bf83e91ef043, resumed — has round-8 context) with fix-round-9-brief.md: (1) bodyUpWeight interpolant in log(h/R), debug toggle lin/log default log, symmetry guards parameterized over both spaces; (2) sliders drive the ONE canonical hysteresis home (band + regime together — ruling 10 forbids divergence), clamp disengage > engage×1.1, defaults 1.7/3.4, session-only; (3) north-up toggle heading+roll authority only, default ON, C1 tilt wall untouched; (4) new "Orientation tuning" subsection in camera debug section per rung-6 settings consolidation. Baseline 8390. On DONE: opus re-review (scoped) → push → USER PING.
- 2026-09-03 USER BUG (queued as ROUND 10, after round 9): focus change to another body (search → Mars) while ENGAGED in body regime does nothing — camera only responds after manual zoom-out past disengage into absolute regime. Likely kin of R4-3 flagged path (focus tween/follow vs engaged regime — "the one uncovered path"). Read-only Explore trace dispatched (sonnet, background) to find the gate + the reusable disengage conversion; its report seeds fix-round-10-brief.md. NO fix until round 9 lands (single-implementer rule).
- Round-10 trace COMPLETE + brief WRITTEN (fix-round-10-brief.md): mechanism = focus lands in selectionRows.focus fine but ALL camera consumers gated (watchFocusTweenSaga.ts:121 skips moving bodies unconditionally; followBody.isActive requires frame==='absolute' cameraDrivers.ts:293; resting wins with Earth pose); no code compares focused body vs engaged body; recovery today is purely geometric (manual zoom past 3.4 → fold flips → stale focus honoured). CONTROLLER RULING in brief: fix = focus-mismatch disengage condition INSIDE regimeArmFor (fold stays the single regime-transition author; conversion + commit site untouched; followBody activates next frame) — saga-dispatched disengage and inline followBody conversion REJECTED as second-author divergence class. Edge cases pinned: same-body no-op, non-body focus deliberate decision, low-altitude conversion fixture. Dispatch when round 9 lands.
- Round 9 DONE (fable, same agent): e56657b48 (+539/−90, 14 files), suite 8405 green (8390 + 11 new + 4 both-space guard params). Knob homes: ORIENT_TUNING.blendSpace (new src/data/camera/orientTuning.ts, default log — LIVE immediately, half-weight 2.55→2.40 h/R); setSurfaceBand writes SURFACE_REGIME in place (one record: regimeArmFor + bodyUpWeight + maxTiltRad + debug row), clamp disengage≥engage×1.1 moved-knob-wins; ORIENT_TUNING.northUp read at both arm sites (canonicalledPose dPsi+level, frameAlignedRoll; C1 wall NOT gated; OFF also disables above-band drain + de-scene-aligns bake — honest meaning); UI OrientationTuning.tsx subsection. Implementer flags: mutable module records = deliberate trial mechanism → post-trial deletion audit hardcodes winners. OPUS RE-REVIEW DISPATCHED (4 adjudications: both-space guards non-vacuous, stale-copy capture of mutable records, north-up-off coherence, clamp/one-record grep). ROUND 10 DISPATCHED to implementer in parallel (pipelined; disjoint files, base e56657b48, baseline 8405). Push after review verdict + round 10.
- 2026-09-03 USER RULING 12 (near-verbatim): tilt reset = Cesium style — remember last tilt set in body regime (default 0 = from above), smoothly lerp in/out of it within engage/disengage window; zoom-in must NOT change tilt (current toNadir settle on zoom-in is WRONG). Queued as ROUND 11 (after round 10), brief WRITTEN fix-round-11-brief.md: display tilt = rememberedTiltRad × w(h/R) pure function (same band record + blend space as round 9, 0 at disengage ⇒ C1 preserved by construction); zoom never authors tilt; 4 reconciliations mandated (wall-vs-band single authority = STOP-and-un-braid if they disagree; mid-window tilt-set rule; persistence scope rec = per-session global; debug readout row); neutrality regression + mutation contract.
- Round 10 DONE (fable): a5bf83ce1 (+282/−15, 4 files), suite 8409 green (8405 + 3 regimeArmFor units + 1 runFrame sim), mutation-verified both ways. Shape per ruling: regimeArmFor gained focusedBodyId (string|null from the drivers' own pivotFocus snapshot), fold stays single regime author. ADDITION beyond brief letter: symmetric engage gate (differing focus also blocks engage) to kill engage/release flap after low-altitude release — 150-frame no-flap sim. Edge decisions: same-body no-op; non-body focus → null, does NOT release (incumbent tween-out stands, stated); clear = pure h/R; moons release; low-altitude release verified finite/eye-preserving (bakes ~2.1 R). Concerns: deep-release h/R<0.45 proximity capture (cut not ease; claimed unreachable — reviewer judging); focus-jump UX = incumbent absolute path by design. OPUS REVIEW QUEUED behind round 9 (5 adjudications; #1 = does the symmetric engage gate create a NEW bug: fly into an unfocused body → never engage?). ROUND 11 DISPATCHED to implementer (base a5bf83ce1, baseline 8409, pipelined).
- Rounds 9 + 10 both APPROVED (opus, combined-review.md). PUSHED #647 @ a5bf83ce1 (TILT_GAIN 649f05239 + R9 e56657b48 + R10 a5bf83ce1). R9 adjudications: parameterization real (anti-vacuity assert; cross-arm symmetry structural in any space — weight fixture is the space coverage); log-default sweep vs round-8 linear: marginally BETTER (<2° 96.8→97.1%, ≥45° 1.9→1.6%, envelope unchanged); no load-time capture (vitest isolate blocks leakage); north-up OFF coherent (disclosures: mid-drain toggle freezes debt; levelledPose stays on by design — ruling 3); clamp can't invert. R10 adjudications: symmetric engage gate necessary+sufficient+stateless (flap verified real); deep-release proximity UNREACHABLE (Earth→Moon h/R≈220 in Moon radii); one focus authority, no alloc.
- OPEN FINDINGS for next fix batch (after round 11): F1 process — R9's "8405" not attributable (another session's WIP mutated tree mid-review; R10's 8409 WAS clean-tree attested, supersedes); R10-1 IMPORTANT — engage now requires matching-or-absent body focus + wireInput seeds body focus at boot ⇒ clip/tour flying to body B with body A focused never engages surface arm — needs clip-path test or explicit statement; R9-1 minor (restores write literals); R9-3 DISCLOSURE briefed to user (dragging disengage slider below live altitude forces immediate disengage carrying present tilt = C1-class pop; move sliders parked outside band — NOTE: likely moot after round 11 remembered-tilt, re-judge); R10-2 spec:784 still says engage body-blind; R10-3 regimeArmFor header leads body-blind.
- Round 11 DONE (fable): 16892ecc4 (+369/−103, 13 files), suite 8414 green (8409 + 6 rememberedTilt − 1 superseded C1 ceiling test), toNadir-restore mutation fails 5/6. Reconciliations: (1) wall-vs-band UN-BRAIDED — band owns zoom-time tilt, walledTiltPose = gesture-time cap floored at max(maxTiltRad, remembered×w) (real disagreement found: remembered 1.5 maps above ramp mid-window, pre-fix wall eroded ~0.08/step — own fixture); (2) mid-window set: remembered = display/w clamped, memory untouched at degenerate w (fixed-point fixture); (3) persistence per-session global, closure state in surface controller + accessor, survives disengage/re-engage/body switch; (4) debug row remembered_tilt_rad read-only. Heading/roll settles verified un-braided, byte-identical. Tilt skips ride continuity bound (degeneracy-free target; bound would break exact-0 bake). Concerns → review: anchored-dive ~0.04 rad transient (Q4c trade); tour arrival tilt decays toward memory (arrivals-adopt = one-line if trial wants); mid-window-set-then-dive display rises toward remembered; lerp-in only exists entering engaged (claimed essential regime-boundary asymmetry — reviewer judging vs ruling 10). I verified clean tree + typecheck:fast at 16892ecc4 (F1 re-attestation superseded). OPUS REVIEW DISPATCHED (7 points). FINDINGS BATCH dispatched to implementer in parallel (one commit on 16892ecc4: R10-1 clip/tour engage investigation, R9-1 restore capture, R10-2 spec line, R10-3 header). Push after both return.
- Round-11 re-review APPROVED (tsc clean, 8414): all 6 reconciliations hold on mechanism. R11-1 IMPORTANT (user disclosure MANDATED as table): mid-window set rule amplifies invisibly — wall caps visible tilt while 1/w re-inflates stored value; stored converges ~76–87° at every mid-window altitude (h/R 3.35: 0.1° visible arms 86.6° stored, ×740); reviewer refuses "bounded therefore fine" (twice-overruled class); option floated (not prescribed): raise memory-write gate surfaceController.ts:665 from w>1e-6 to legibility threshold — USER FEEL RULING PENDING, implementer told not to act. R11-2 minor → folded into findings batch (String vs num() on remembered_tilt_rad row). R11-3 process: 8414 not measured on exactly R11 HEAD (findings batch landing concurrently; R11 files clean, review stands). Adjudications: floor sound + C1 by construction (both terms 0 together at 3.39); deleted C1 test's invariant re-pinned rememberedTilt.test.ts:169 (caveat: no per-notch tilt magnitude pin anywhere — same unpinned class as old ceiling-delta); un-mapping FORCED (no third rule exists); one tilt home; bound-skip both halves verified (scalar monotone target, π-class unrepresentable; 0.3 bound would carry ~2.5 rad across disengage); dive transient fixture-pinned <0.05; lerp-in asymmetry ESSENTIAL (tilt has no world-arm counterpart); R9-1 already fixed in R11 (capture-based restore).
- Findings batch DONE (fable): 762a2d44e (+127/−35, 12 files), suite 8415 green (+1 fixture), tree clean verified at HEAD. R10-1 REACHABLE + SHARPER: hand-authored flyToClip/flyPath parked at body B with stale body-A focus → post-R10 the pivot pin re-targets the focused body at surface distance and the camera LEAVES for it (pre-R10 focus-blind engage shielded the landing); guided beats safe (flyAndFocusOnClip aligns focus at beat start). Resolution: sim fixture both halves in focusReleaseWhileEngaged.test.ts + mechanism statement at gate site; gate not redesigned. R9-1 capture-restores all 7 files; R10-2 spec §12 amended (argmin stays body-blind); R10-3 header reworded; R11-2 num() via pre-formatted-readout contract. SCOPED RE-REVIEW DISPATCHED (adjudication: flag-and-document vs behavior fix for clip authors — verdict decides follow-up round vs documented landmine). Push after verdict. R11-1 mid-window memory-write gate = USER FEEL RULING still pending.
- Findings-batch re-review APPROVED (no findings; regimeArmFor diff = comments only, gate untouched). R10-1 ADJUDICATED: flag-and-document RIGHT, no behavior fix — parent defect pre-existing + already spec'd out of scope (spec:790 tour-end pivot-pin snap); round 10 removed an accidental shield, didn't create the interaction; guided beats safe; candidate fix (clips clear focus) riskier than bug; +54-line sim fixture = executable statement for the eventual pivot-pin fix. Reviewer self-checked vs round-8 ship-the-seam error: reachability call re content authoring, not perceptual call — different class. NON-BLOCKING follow-up ledgered: clip-authoring docs (docs/tour/) need the stale-focus note where authors will see it (regimeArmFor.ts is the wrong side) — fold into wave-end cleanup. PUSHED #647 @ 762a2d44e (16892ecc4 R11 + 762a2d44e batch). Suite 8415 green. WAVE IDLE — all agents free. PENDING USER: R11-1 gate ruling; feel verdicts on log/lin blend, sliders, north-up, remembered tilt, Mars focus-release. Board republish due at wave end.
- 2026-09-03 USER RULING 13 (verbatim): "something flips the tilt on a specific threshold... I thought we were going to do a lerp?" — round-11 concern-4 asymmetry (lerp-in only when entered engaged; world-armed approach expresses no tilt until engage 1.7 snap/walk) OVERRULED as defect. THIRD reversal of a bounded/essential-therefore-fine verdict by user's eye. ROUND 12 dispatched (fable, base 762a2d44e, baseline 8415), brief fix-round-12-brief.md: reproduce first (round-trip continuity sim failing at engage notch), then tilt = remembered × w(h/R) pure function regardless of arm — world arm expresses view-axis-vs-nadir tilt in-window, engage edge changes ownership not image (round-8 invariant extended to tilt); one mapping home; never-engaged byte-identical control; blendedUpDir/heading write-order fight = STOP-and-un-braid. Then opus review → push → user ping.
- 2026-09-03 USER RULING 14 (verbatim): "when tilt is 0 and we're decreasing the tilt, the earth moves underneath us... tilt should be clamped to 0 and no dragging of the world underneath us should occur." Queued as ROUND 13 (after round 12 — same files), brief WRITTEN fix-round-13-brief.md: reproduce first (full-pose byte-bar dead-stop fixture at tilt 0, TILT_GAIN included; hypothesis = clamp-after-rotate residue about pick point — confirm not assume); fix = gesture-level clamp before rotation (excess input → zero rotation, dead stop); mixed drags keep heading live; remembered → 0 legal, nothing beyond; band mapping untouched; mirror the round-8 ceiling-overshoot fixture structure for the floor.
- Round 12 DONE (fable): f62b5e0ed (+481/−4, 6 files), suite 8425 green (8415 + 4 explicit + 6 sweep-generated), mutation (re-gate world expression) fails the right tests with byte-identity controls surviving. Pre-fix measured: display pinned 0 through world-armed window while map rises to 0.3547 rad at engage; user saw sudden-onset attenuated walk 0.033–0.036 rad/notch (~15 notches; 0.1 cap eaten ~60% by anchored-dive localUp chase). Post-fix: world leg on map to 4 decimals, engage inherits exactly; zoom-out confirmed already smooth. Write order ONE chain documented: drivers → pivot pin (WHERE) → approachTiltedPose NEW (view-vs-nadir angle about fixed eye, roll carried) → fold; frameAlignedRoll different DOF, base stays centre-looking; one mapping home mappedTiltRad NEW (world projection + engaged settle + drag-wall floor). Concerns → review: (1) in-window world-arm drag then pin re-centre+re-projection = small eye shift at large remembered (feel trial); (2) engaged rows keep round-11 anchored-dive transient ≤0.08 (pre-existing); (3) expression keys on FOCUSED body like the pin — unfocused manual flight gets no lerp-in but also no flip (stated). OPUS REVIEW DISPATCHED (6 points; #2 = quantify the drag-then-release shift — next reopen candidate). ROUND 13 DISPATCHED (pipelined, base f62b5e0ed, baseline 8425). Push after both reviews.
- 2026-09-03 USER RULING 15 (verbatim): "also the heading direction on right drag should be inverted" — folded into round 13 same commit (message queued to implementer): heading component of right-drag handle sign-flipped ONLY (tilt component + left-drag/orbit untouched), fixtures assert new direction, feel-ruling comment at handle so it isn't "fixed" back.
- 2026-09-03 USER: both seats well past 600k tokens (implementer abdf1bf ~575k+, reviewer a178859 ~651k). RULING: in-flight tasks (round 13 impl, round-12 review) run to completion — NOTHING further dispatched to either agent afterwards; both RETIRED on return. All subsequent rounds → FRESH fable implementer + FRESH opus reviewer, briefed from files only (implementer: fix-wave-report.md rounds 1-13 + round brief + combined-review.md pointers; reviewer: combined-review.md is the full seat record + the round's package/brief/report). Round-13 review in particular goes to a FRESH reviewer.
- ROTATION POLICY encoded (memory feedback_bg_agent_context_rotation.md; user raised cliff 300k→400k for headroom): bands <200k free / 200–350k fresh-for-full-rounds, incumbent only small own-diff follow-ups / >350k retire at boundary; never start a task whose estimate crosses 400k; in-flight always finishes; costs from this session: scoped fix 30–60k, full round 100–240k, review 100–200k.
- Round 13 DONE (fable, RETIRED at ~601k): e532f644a (+80/−15, 2 files), suite 8427 green. Mechanism REFUTED brief hypothesis: NO floor existed — handle rotated through nadir (0.503 rad far-side orbit for 20 px = the "earth dragging"; unsigned readout rose with heading flipped) AND wrote swing into remembered memory (pollution reachable since round 11). Fix: gesture-level bound (lowering clamped to held tilt, pure-excess returns pose BY REFERENCE for byte bar), raising side keeps ceiling wall, remembered floors at 0. RULING 15 in same commit: right-drag heading negated (−yawRad), feel-ruling comment + re-signed Z-X-Z/mixed fixtures; overshoot fixture re-aimed (was riding missing floor through nadir). Concerns: asymptotic approach to 0 from small tilt (never lands exactly — feel trial); tilt handle vs orbit drag now turn opposite (explicit ruling, pinned).
- Round-12 review REVISE (reviewer RETIRED at ~680k): R12-1 CRITICAL — approachTiltedPose (eye-fixed via moved target) × pivot pin (target-fixed, eye derived) on COMMITTED tilted pose ⇒ eye jump d·2sin(τ/2): 4,221 km (rem 0.5 h/R 2.55) → 23,787 km (1.5, 1.75), ACCUMULATES 8.4k→40.7k km over 6 commit cycles; reachable via in-window gestureEnd commit + any commit-on-edge (tween/autoRotate/clip/followBody); suite green because round-12 sim commits once then only reads; reviewer self-flagged "idempotent by construction" error (idempotent in tilt angle ≠ eye position — only measuring caught it). Offered fix ADOPTED as ruling: commit sites bake PRE-projection centre-looking pose, projection render-side only; autoRotate roll secondary expected to self-resolve. R12-2 minor: inverse map inline at surfaceController.ts:686 → one-home counterpart of mappedTiltRad (inverse writes MEMORY, divergence sticky). R12-3 process: tree dirty 3rd time (round-13 WIP; failures all in dirty file).
- FRESH SEATS spawned: round 12b → fresh fable implementer (brief fix-round-12b-brief.md: required reading list, R12-1 verbatim mechanism + tables, commit→re-derive idempotence fixture pre-fix-failing, engage-edge display-tilt inheritance must survive, R12-2 same commit; base e532f644a, baseline 8427). Round-13 review → fresh opus reviewer (combined-review.md = seat record; 6 adjudications incl. through-nadir proof with TILT_GAIN, asymptotic-stall quantification, by-reference aliasing, ruling-15 fixture honesty; appends "Round 13 review" to combined-review.md). Push after 12b + both verdicts.
- Round-13 review REVISE (fresh reviewer, ~184k): R13-1 CRITICAL clamp on WRONG SIDE (shipped controller: positive input RAISES tilt; unsigned acos can't express direction) — lowering drag still crosses nadir (1.29°/event eye orbit) + up-drag from exactly 0 PERMANENTLY LOCKED + unrequested (1+R/h) ramp on raising; R13-2 IMPORTANT module comment inverted vs measured behavior (drag-down tilts DOWN, comment says up) — direction question sent to USER; R13-3 minor third inline acos copy → one-symbol signed util; R13-4 minor overshoot fixture false rationale + no up-from-nadir pin. Suite 8427 independently attested clean-tree at e532f644a (first clean attestation of wave).
- 2026-09-03 USER RULING 16: INVERT tilt-drag pitch (Google-Earth style: drag toward you = tilt UP toward horizon; away = toward top-down) — mirrors ruling 15; makes module comment true again (R13-2 resolves code→prose). ROUND 13b dispatched to FRESH fable implementer (brief fix-round-13b-brief.md: flip pitch sign this handle only, signed-tilt clamp on toward-zero side, dead stop byte bar, kill lock-at-0 + memory pollution crossings, re-sign round-13 fixtures; base 2494ba057, baseline 8435).
- Round 12b DONE (fresh fable, ~208k): 2494ba057 (+427/−15, 7 files), suite 8435 green (8427 + 2 idempotence + 6 sweep), both mutations caught (8,519 km / 16,731 km signatures). Shape: centreLookingPose.ts commit-side inverse (eye preserved, by-reference untouched paths) at drainInput gestureEnd + runFrame commit-on-edge gated pivotsOnFocusedBody; clip/tween commit verbatim; unmappedTiltRad one-home (R12-2). AutoRotate roll secondary RESOLVED (full commitCameraPose writer inventory). CONCERN 1 CRITICAL-GRADE out of scope: ACTIVE in-window drag register loop (store projected → pin → re-project) walks eye ~8,519 km/FRAME at 60Hz, unchanged — ROUND 12c planned, CONTROLLER RULING: register holds AUTHORED centre-looking pose during gestures, displayed pose = pure projection at read (pick, followBody capture, sim liveWorldPose adapt) — reviewer sanity-checking direction + collisions for the 12c brief. Concern 3: third "aim at point, keep eye" site → deletion audit. 12b REVIEW dispatched to round-13 reviewer (a01ee, ~184k, under free band). SEQUENCE: 13b → 12c (avoid parallel implementers); push after 13b + 12b verdict + 12c.
- Round-12b review APPROVED (reviewer a01ee now ~262k): inverse algebraically exact + measured idempotent (25 gestureEnd cycles 6.2e-9 km; 25 edge cycles exactly 0; engage-edge Δ +0.00001 across arm flip); clip/tween paths clean (evaluateClip never reads register); 8435/1211 independently attested clean tree; 12b = incumbent design (runFrame:487-500 disengage retarget documents same landmine) applied consistently. R12b-1 CRITICAL confirmed pre-existing (press-and-hold zero-motion in-window walks eye 8,519 km/frame, 6 Earth radii/20 frames, invisible on screen) — GATES in-window feel trial, = round 12c. R12b-2 minor (bake sites gate differently, unstated arbitration assumption), R12b-3 minor (centre-looking invariant enforced 3 shapes stated nowhere → state once at cameraSlice.ts:97). Reviewer endorsed 12c direction with TWO-BOX variant (authored register + explicit displayed box) + 5-reader inventory (pick runFrame:274/starCatalogLayer:928, render override :415 else one-frame pop, followBody capture CameraClock.d.ts:54, demand/LOD engine.ts:972, fold source authored w/ slight drag-mapping feel change to DISCLOSE); deletion-audit input: DON'T unify the three aim-at-point sites (differ in what they hold fixed). 12c BRIEF WRITTEN (fix-round-12c-brief.md: two-box + 5 readers + bake-site delete-or-justify + R12b-2/3 same commit + press-and-hold regression). Dispatch on 13b return.
- Round 13b DONE (fresh fable, ~261k, retired next boundary): 90fa55be9 (+286/−63, 8 files), suite 8451 green (8435 + 2 controller + 6 util + 8 sweep), both R13-1 halves reproduced pre-fix, both mutations kill right fixtures. DEVIATION from R13-3 letter (reviewer re-judging): shared util UNSIGNED tiltFromNadirRad — pose-level sign ill-defined (opposite-azimuth ≡ crossed byte-identical; signed attempt broke disengage wall fixture, legit look-tilts escaped); signedness lives in tiltFloorBudgetRad (has rotation axis; P+K≤0 = signed about axis), contract test pins unsigned fold. Other concerns: in-plane land-at-0 (roll levelled per step = lived case); overshoot fixture re-scanned 295→115 px (old length floored eye onto surface at new direction; window 105–130 valid); tiltLerpRoundTrip harness re-tuned 2 px steps (remembered 0.385→0.354 back under 0.09 bar — bar untouched).
- ROUND 12c DISPATCHED (fresh fable implementer, base 90fa55be9, baseline 8451; brief fix-round-12c-brief.md two-box + 5-reader repoint + bake delete-or-justify + R12b-2/3). 13b RE-REVIEW dispatched to reviewer a01ee (~262k, LAST TASK then retired; 7 points incl. re-judging the unsigned-util deviation + the two fixture re-tunes honesty). Push after 13b verdict + 12c + its verdict.
- Round-13b re-review APPROVED (2 minors; reviewer a01ee RETIRED at ~314k, record in combined-review.md): floor EXACT not conservative (brute-force 150 geometries, worst landing 0.000°, budgets match analytic (1+h/R)·τ); no lock (50px from 0 → 4.2°); raise linear again; ruling-16 scope correct, GE prose true by measurement; unsigned-util deviation ACCEPTED as better than R13-3 (only other through-nadir path = free-look, eye never moves); roll cases converge 0.000°; both fixture re-tunes honest. R13b-1 minor DISCLOSURE: where no rotation about the axis reaches nadir, budget=Infinity, lowering uncapped (verified correct, no crossing; stress 5000px at 3.4R sweeps 444° orbit) — wants branch clause + user line, queue with 12c findings. R13b-2 process = F1 #4 (12c red TDD fixtures mid-run; attestation stands). PUSHED #647 @ 90fa55be9 (12b 2494ba057 + 13b 90fa55be9). Carried-forward for next reviewer seat: R12b-1 gates in-window feel trial (12c in flight); ruling-16 live behavior awaits user feel confirm.
- Round 12c DONE (fresh fable, ~240k): 3047a8875 (src +181/−162 15 files, tests +392/−1 22 files), suite 8453 green (8451 + 4 − 2 sweep rows), walk reproduced ~8,700 km/frame pre-fix, mutations verified. Two-box: lastPose = AUTHORED register, new cameraRuntime.displayedPose; liveWorldPose→displayed, new authoredWorldPose→register. Readers: pick/demand/debug/clip-tween-seams → displayed; fold → authored (ruled); TWO DEVIATIONS from reviewer letter, both measured: commit-edge render override → AUTHORED (feeds pin+projection which re-derive displayed exactly; displayed would re-pin projected = one walk frame), followBody capture → AUTHORED (ease decodes vs body-centred target; displayed capture = R12-1 composition, 8,718 km first eased frame). BAKES DELETED: centreLookingPose.ts removed, invariant by construction, R12b-2 dissolves, R12b-3 stated once at commitCameraPose. Disclosed feel change: drag deltas compose below tilt, screen mapping shifts slightly (12c review to BOUND the number). Concern: clip/tween deactivation w/ non-pivoting incoming driver renders authored register one override frame (pre-existing tween-start discontinuity moved ≤1 frame, unpinned). 12C REVIEW dispatched to FRESH opus seat (7 points: independent walk repro, both deviations, invariant-closure grep-trace, one-frame concern, feel-change BOUNDED number, tiltCommitIdempotence not weakened). OPEN for next findings batch: R13b-1 branch clause + user line. Push after verdict.
- Round-12c review REVISE (fresh opus seat ad23ca, ~217k; suite 8453 independently attested clean-tree, no F1 recurrence — probes ran in separate worktrees): R12c-1 CRITICAL — override reads authored UNCONDITIONALLY but pin+projection gate on incoming driver's pivotsOnFocusedBody ⇒ non-pivoting incoming (clip/tween) draws untilted register 1 frame: 0.402 rad/453px flash, NEW not moved (pre-fix continuous; saga seeds from displayed); reviewer BUILT+VERIFIED fix (discriminant on incoming driver at runFrame.ts:403, full suite green, both walks still 0) + fixture gap named (edge fixture uses setAutoRotate = pivoting = pins only authored-correct case). Deviation 2 (capture→authored) CONFIRMED CORRECT (8,718.4 km to the decimal; arrival clean). Invariant closed on all 10 commitCameraPose callers (≤2.6e-8 rad/200 frames); statement overreaches (R12c-2: 4th route runFrame:393 clip/tween prevRow, pre-existing spec§790 — name it). R12c-3 four stale docblocks; R12c-4 comment overrun → wave-end audit. FEEL CHANGE BOUNDED: vertical 0px; horizontal +7px @ rem 0.57 (×1.02), +52px @ 1.05 (×1.17) per 100px drag on 900px viewport; new mapping isotropic, old wasn't. Accuracy note: mutation-1 "7 failures" not reproducible (4 measured). 12C-FIX dispatched to 12c implementer (own-diff follow-up, ~240k→est ~290k): reviewer's discriminant + non-pivoting-incoming fixture + R12c-2 note + R12c-3 docblocks + R13b-1 Infinity clause + probe-file hygiene; R12c-4 explicitly excluded. Then scoped re-review (12c reviewer) → push.
- 12c-fix DONE (12c implementer, ~266k → retire after): b7800bf4a (+61/−18, 7 files), suite 8454 green (+1 tween-start fixture, failed pre-fix 0.389 rad edge drop). Discriminant applied (flag hoisted); R12c-2 fourth route named; R12c-3 four docblocks; R13b-1 Infinity clause; no probe files (verified status+ls-files). ADDITION for reviewer: authoredOverride keeps register stamp AUTHORED on non-pivoting arm (else post-pin capture writes displayed pose into register 1 frame; drag-during-tween — orbitDrag@80 outranks tween@60 — could fold that window into the walk). SCOPED RE-REVIEW dispatched (ad23ca; adjudicate authoredOverride real-vs-dead + quick checks). Push on APPROVED.
- 12c-fix re-review APPROVED, PUSHED #647 @ b7800bf4a (12c 3047a8875 + fix b7800bf4a). Suite 8454/1214 independently attested clean-tree. authoredOverride = REAL hazard correctly closed (drop it: register stamps projected pose, drag next frame teleports 9,005 km one-shot; cancelCameraTween at pointerdown doesn't rescue — applyWorldStep bails only on playing CLIP; stamp not observable elsewhere, register/base pair strictly more consistent). R12c-1 revert reddens only the new fixture at 0.3893 rad. R12c-4a minor non-blocking: hazard unpinned (suite green without authoredOverride) — one-liner assertion dispatched to implementer as FINAL micro-task (then retired ~266k+); reviewer nit no-action (nullable pose carrying one bit). Reviewer ad23ca at ~240k after this — retire-or-small-only band. R12c-4 comment budget → wave-end /comment-audit. R12c-4a DONE + PUSHED @ 332c39442 (mutation reddens exactly the new assertion at 0.389 rad; suite 8454 green; tree clean at push). BOTH SEATS RETIRED (implementer aa532d2 ~269k, reviewer ad23ca ~240k) — next round = fresh seats per rotation policy. 2026-09-03 USER RULING 17 (verbatim): "tilt direction is reversed from google maps. fix that please" — supersedes ruling 16's direction; ROUND 13c dispatched to fresh fable (brief fix-round-13c-brief.md: one pitch-sign flip on tilt handle, floor/wall claimed tilt-space thus untouched — verify not assume, re-sign direction fixtures, comment records rulings 16+17 both; base 332c39442, baseline 8454). Round 13c DONE + PUSHED @ 7102591aa (fresh fable, ~138k, surgical — no review seat, verified by mutation: sign revert fails 11 direction fixtures; suite 8454 exact baseline): pitch sign back to Google-Maps style (comment records rulings 16+17 both); floor/wall CONFIRMED pixel-sign independent (floor keys on tiltRequest post-negation, budget takes pose geometry only); overshoot fixture re-geometried (net-raising drag ends above press pixel — fixture consequence, not code dependency); ADDENDUM same commit: SURFACE_BAND_LIMITS engageMin 1.05→0.1, disengageMin 1.5→0.2 (one home surfaceRegime.ts, ratio clamp holds below 1). 2026-09-03 USER: tilt-up + zoom-out jarring — IDEAS ONLY delivered (no implementation): (1) gesture-end settle tween à la Cesium [my pick], (2) screen-space px/notch rate cap, (3) drain-late w reshape [cheap first experiment, sliderable], (4) nadir-anchored recession while tilted, (5) display capped by altitude ramp [warned: ruling-10 braid risk]. Awaiting user pick. WAVE STATE: all pushed @ 7102591aa; pending = USER FEEL GATE + jarring-fix pick (tilt direction/floor, levers, focus release, remembered tilt, in-window drag w/ +52px@1.05 disclosure, R11-1 ruling), board republish, wave-end comment audit + deletion audit.
- 2026-09-03 USER RULING 18 (verbatim): "when switching to saturn or jupiter (using focus), im ending up inside the planet. it should really fully reset the body pose on body switch, so not remember tilt / heading etc, and switch to the actual focus distance. implement neatly, no shortcuts." ROUND 14 dispatched to FRESH fable implementer (rotation policy; base 7102591aa, baseline 8454), brief fix-round-14-brief.md: reproduce FIRST (mechanism NOT established — hypotheses: bodyLikeFraming arrival h/R ~1.37 < engage 1.7 so engage fires mid-tween/on-arrival with Earth's stale remembered tilt; giant radii 9-11x Earth make carried distances interior), CONTROLLER RULING remembered tilt keyed to authoring body, resets on switch (supersedes round-11 survives-body-switch scope), same-body re-focus + same-body disengage/re-engage KEEP memory; fold stays single regime author; heading not remembered today (implementer to confirm); focusTweenDescriptor yaw/pitch carry-over NOT in scope unless reproduction implicates it. Then fresh opus review → push → user ping.
- RULING 18 AMENDMENT (user, verbatim): "you can actually fully reset on switch" — no per-body memory store; body switch WIPES remembered tilt to 0 (detection may use an authoring-body id, but nothing is restored per body). Same-body re-focus + same-body disengage/re-engage still keep memory. Relayed to round-14 implementer mid-flight (scope-only clarification, simplifies — safe mid-task).
- Round 14 DONE (fresh fable, ~222k): 740f078ae (not pushed), suite 8457 green (8454 + 3 bodySwitchReset fixtures), tsc clean, tree CLEAN verified by controller (stale editor diagnostics = known noise; no probe files). MECHANISM (refutes brief hypothesis again): NO body-focus tween exists for moving bodies (watchFocusTweenSaga returns on bodyMovesThisFrame) — followBody IS the flight; its activation capture carried the OLD body's orbit distance verbatim (engaged-Earth 2.37 R⊕ = 0.2589 R♄) → eye inside Saturn frame one → fold engages there (h/R<0, focus matches) → body arm blocks followBody, disengage unreachable → STRANDED inside. Fires for every engaged-Earth→giant switch. FIX: followBody capture adopts framing distance (new clock.followBodyId, one capture site) + SurfaceController.noteBody(bodyId|null) closure wipe, runFrame single caller (engaged-else-focused, once/frame pre-projection) — covers absolute-regime switches; full wipe per amendment, A→B→A wipes (letter, stated). CONCERNS→review: (1) autoRotate-active switch = same inside-planet class via pivot pin, UNTOUCHED (brief STOP condition, needs ruling); (2) arrival h/R 3.33 just inside 3.4 band; (3) static-body focus counts as switch and wipes; (4) brief's tween-repro unbuildable, real-saga fixture instead (deviation recorded). ROUND-14 REVIEW dispatched to FRESH opus seat (7 points: independent repro, noteBody ordering/null-flicker, followBody capture regression + 12c walk re-measure, autoRotate-class reachability for user ruling, h/R 3.33 arrival behavior, fixture/mutation honesty, clean-tree attestation; package round-14-package.diff). Push after verdict.
- ROUND-14 REVIEW PARKED (Anthropic outage): fresh opus seat died 3x on 529 Overloaded + 1x stream-watchdog stall over ~30 min (status.claude.com: minor service outage; local tool-safety classifier also timing out). Seat barely started (was launching the suite + reading). RESUME: SendMessage to the round-14 review agent (or spawn fresh from the same 7-point dispatch in this ledger entry above; package .superpowers/sdd/2026-09-01-camera-pivot/round-14-package.diff). 740f078ae committed locally, NOT pushed — push gated on verdict.
- 2026-09-09 PUSHED #647 @ 740f078ae (round 14) on user word, review still pending (round-14 reviewer seat never ran — outage). PR remains CONFLICTING vs origin/main (13 commits behind, merge-base 5fb5984fe); main merge-in due before landing. Dev server 5173 restarted this session (bg shell bt9488iuz).
- 2026-09-09 MAIN MERGED IN: origin/main 0a53aef82 → camera-pivot. 4 keep-both conflicts (CameraRuntime.d.ts + engine.ts + 2 test fixtures: surface/lastZoomFactor beside main's skyCubemapCapture). One semantic fix in the merge commit: main's new skyCubemapFaceContext.ts calls deriveFrameContext, which gained the `arm` param on this branch — passes `{ frame: 'absolute', pose }` (capture pose is synthetic world-absolute). tsc clean, suite 8647/1248 green, pushed.
- 2026-09-09 ROUND-14 REVIEW RE-DISPATCHED: fresh opus reviewer (background) in camera-pivot worktree on merged HEAD a4c23f4d2, same 7-point brief, package round-14-package.diff; appends "Round 14 review" to combined-review.md. Tracked tree must stay untouched until it returns (F1 lesson). Round 14 already pushed on user word; verdict → fix round if REVISE → user ping (incl. autoRotate-class decision item).
- 2026-09-09 ROUND-14 REVIEW = REVISE (fresh opus, ~207k, section combined-review.md:2966): R14-1 Important NEW — framing distance adopted as ease START = its TARGET ⇒ every body switch an instant cut (reviewer built+verified eye-preserving capture fix); R14-2 Important NEW — clip/tour landing on focused body surface yanked to h/R 3.33, never engages, whenever any follow happened first (guard harness never followed); R14-3 Important PRE-EXISTING → USER RULING: autoRotate@20 outranks followBody@10 so spin-pill-on + focus Saturn from engaged Earth = 0.2589 R♄ inside, UNRECOVERABLE (toggle-off does not release arm; 60 wheel notches reach h/R 0.0009) — cheapest = cancel autoRotate on focus-row change (one line) vs pivot-pin-learns-framing (the STOP-condition broad change); R14-4 minor first-ever-follow exemption still strands (1.203 R♄); R14-5 minor comment budget 1.66–3.83×; R14-6 minor clock.followBodyId exists only for a comparison the neater capture drops; R14-7 disclosure star focus rows wipe memory. Gates on merged HEAD: tsc 0, 8647/1248 green, mutations M1/M2/M3 all have teeth, walk 0 km/frame, idempotence 0 km. Ruling-18 halves HOLD on the named path (4.3301 R♄, tilt 0, mem 0).
- 2026-09-09 USER RULING 19: engage h/R 1.7 → 0.2 (controller assumption disengage 0.4 = 2× hysteresis, stated, unobjected). User also asked to surface the ×1.1 hysteresis floor (round-9 e56657b48, not in spec) in the debug view → readout row + setSurfaceBand returns moved knob. Brief band-defaults-brief.md.
- 2026-09-09 DISPATCHED IN PARALLEL: ROUND 14b (fresh fable implementer, this worktree, brief fix-round-14b-brief.md: R14-1/2/4/5/6; R14-3 OUT pending user; band files OUT) + BAND DEFAULTS (fresh sonnet, isolation worktree, brief band-defaults-brief.md, two commits, cherry-pick onto camera-pivot on return). Disjoint file sets stated in both briefs. Then: fresh opus re-review of 14b → push → user ping w/ R14-3 ruling ask.
- 2026-09-09 Round 14b DONE (fresh fable, ~211k): 8ab766815 on a4c23f4d2, suite 8650/1248 green, tsc clean, NOT pushed. R14-1 reviewer option A verbatim (eye-preserving capture, cut→flight fixture), R14-2 reproduced w/ prior-follow harness + fixed (guard split, R10-1 first-half assertion CHANGED "engages within 480ms"→"settles absolute at framing" — deviation flagged), R14-4 folded (exemption gone, first-follow fixture), R14-5 all 6 files ≤0.5 (runFrame −375 comment lines, cameraDrivers trim — rode the fix commit, whole-file), R14-6 followBodyId DELETED, R14-7 recorded. Concerns: R14-3 open; surfaceController at 0.50 exactly; same-body trace unpinned. NEXT: fresh opus re-review (incl. comment-trim landmine audit) → push. surfaceController SPLIT brief written (surface-controller-split-brief.md) — dispatch in isolation worktree off 8ab766815 during the review; cherry-pick after.
- 2026-09-09 Round-14b review APPROVED (fresh opus, ~202k, combined-review.md "Round 14b review"): option A verbatim, all claims reproduced (deep-space→Saturn 22205 R♄ → 4.3301 in 608 ms; first-follow no strand; R14-2 landing engages h/R 0.5; same-body ≤5.6e-13 rel — no fixture owed). 4 minors: R14b-1 stale R12b-1 justification at cameraDrivers.ts:150-158 (reword), R14b-2 lost "ease toward committed base so post-follow drag honoured" (restore 1 line), R14b-3 followFrom.target aliases deriveBodyStates memo array (copy), R14b-4 pan-offset world-frame rationale lost (restore 1 line). Disclosures: R14b-5 deviation 1 truthful + stronger (old assertion pinned engage at 0.798 R⊕ = inside Earth) — USER TICK; R14b-6 runFrame −375 comment lines rides fix commit (blame cost). Comment-trim audit: 38 load-bearing graded, 36 survive/relocated, 2 restore. Gates 8650/1248, tsc 0, budgets all ≤0.5. PUSHED 8ab766815. Minors → scoped fix agent (sonnet) → push.
- 2026-09-09 14b minors DONE + PUSHED 7e58c5837 (sonnet, ~82k): R14b-1 reword, R14b-2/4 one-liners restored, R14b-3 followFrom.target copied; ratios 0.444/0.478. Round 14 CLOSED except R14-3 (user ruling pending: recommended = split followBody into followApproach@60 + followHold@10).
- 2026-09-09 BAND DEFAULTS cherry-picked: 0c4350e36 (0.2/0.4 + 14 test files re-geometried + spec ruling-19 note) + 1acf67c65 (hysteresis readout; setSurfaceBand returns moved knob, new @types SurfaceBandKnob). Agent (sonnet, ~400k — over the rotation cliff, retired) left 12 RED by my scoping: surfaceController.test.ts ×7 (closed-form trig scenes at altitudes now outside the reshaped ceiling ramp: disengage 3.4→0.4 while tiltFullHR stays 0.02 ⇒ ramp compressed 8.9× vs band 8.5×), bodySwitchReset ×3 + focusReleaseWhileEngaged ×2 (round-14 fixtures at old-band altitudes). NOT PUSHED (red). Fix agent (fable) dispatched: fixtures re-geometried honestly, src untouched unless a real bug. OPEN DESIGN Q for user: tiltFullHR 0.02 under the new band. Reviewer later must audit the 14-file retune for honesty.
- 2026-09-09 SPLIT DONE (sonnet, ~251k) on branch surface-split off 8ab766815, worktree agent-a09fd21a07b15e7e1: 669a971f0 types+data → f0575fcda 14 helpers → utils/camera → 625895fca dot3 5→1 → 8fd47a717 bodyFixedEyeM 5→1 + poseWithBasisTurn in anchoredDragRotation → 7d5d310f4 4 focused tests. surfaceController.ts 697→119 lines; suite 8650→8718/1252 (convention sweeps auto-generate per file). Leftovers: TILT_GAIN rationale duplicated (call-site block + tiltGain.ts pointer), surfaceController.test.ts:300 stale `latchFor` name in a comment, private dot3/eyeOf copies in test files out of scope. CHERRY-PICK QUEUED behind the red-fixture agent (same worktree, shares surfaceController.test.ts).
- 2026-09-09 RED FIXTURES DONE (fable, ~205k): a8bf59c49 — 12 fixtures re-homed into the new band (mechanism: at old h/R≈1 w=0 and ceiling 0 so the wall erased every drag tilt; follow framing h/R 3.33 with e^-0.1/notch needs ~32 notches to engage), no assertion weakened, src untouched, adjacent R10-1 stale-focus fixture de-vacuoused (MARS_PARK 1.5→1.1 R). SPLIT cherry-picked clean: 7eec6dc10 62a486781 0560a94e6 f0890696a bbdf0a5a9; surfaceController.ts 119 lines. tsc clean, suite 8719/1252 green. PUSHED through bbdf0a5a9. Pending review: honesty audit of the 17-file band retune (0c4350e36 + a8bf59c49) + mechanical-move check of the split.
- 2026-09-09 USER RULINGS (size complaint: PR ~12k lines, mechanism ~1.9k code): (1) shared sim harness — sonnet, isolation wt `sim-harness` off bbdf0a5a9, brief sim-harness-brief.md, target ≥−1,200 test lines; (2) un-braid the five settle mechanisms (settledZoomPose/walledTiltPose/levelledPose/frameAlignedRoll/approachTiltedPose → one target fn + one step law + one pivot application) — fable, isolation wt `settle-unbraid` off bbdf0a5a9, brief settle-unbraid-brief.md, checkpointed (radar → STOP if ruling needed; golden-trace byte bar before src); (3) comment audit — QUEUED, runs LAST after 1+2 cherry-picked (touches every file); (4) debug UI KEPT for now (user: "a little longer"). Band+split reviewer (opus) still running read-only in camera-pivot. Cherry-pick order: harness → un-braid → audit.
- 2026-09-09 BAND+SPLIT REVIEW (fresh opus, ~281k): A APPROVED w/ 1 Important — RB-1: two fixtures left out-of-band asserting where bodyUpWeight≡0 while claiming in-band (surfaceController.test.ts:472-531 round-6 blend flip; drainInput.test.ts:391 ruling-8 roll ride) — mutation-proven unguarded; RB-2 tiltLerpRoundTrip 0.09→0.12 bar rests on false mechanism claim (log blend is scale-invariant); RB-4 spec:291 + FW-E:607 magnitudes "at 3.4 R" now 8.5× off; RB-5 spec:450 1.71→0.21 R, stale h/R≈1.1 at focusReleaseWhileEngaged.test.ts:183; RB-6 OrientationTuning unused tick/limits/mid-file import; RB-7 readout non-floor branch untested. B APPROVED — SS-1 flooredBodyPose test >0.1 only; SS-2 canonicalBasisAt handedness compares sample to itself; SS-3 rotatedAboutPoint anchor test restates; SS-4 BODY_CENTRE 4 private copies survive; SS-5 5 files over comment budget (pre-existing). MEASURED: engage seam 32× smoother (flip Δtilt 0.00042 vs 0.0134), per-notch continuity unchanged, nothing snaps; tiltFullHR RECOMMEND KEEP 0.02 (band-scaled costs look-up between 15–127 km; ceiling now 97° at engage vs 178.5° under Q6 — user eye at feel gate). Gates 8719/1252, tsc 0. ALL findings QUEUED into one post-consolidation minors round (files owned by harness/un-braid agents now).
- 2026-09-09 COMPACT CHECKPOINT — HEAD 8a11c6082 pushed (backlog: smooth zoom + flick coast, awaiting-decision, Q8 revision). LIVE AGENTS: (a) sim-harness (sonnet, isolation wt branch `sim-harness` off bbdf0a5a9) → on return: cherry-pick its commits onto camera-pivot, full suite, push; (b) settle-unbraid (fable, isolation wt branch `settle-unbraid` off bbdf0a5a9, checkpointed: may return STOPPED-AT-RADAR needing a ruling — radar at settle-unbraid-radar.md) → on return: cherry-pick AFTER harness, full suite, fresh opus review (golden-trace deviation + existing byte-bar fixtures), push. THEN: (c) comment audit over the whole branch (comment-audit skill, own commit, BASE = merge-base with main) → (d) post-consolidation minors round: RB-1 (Important: re-home the two out-of-band fixtures surfaceController.test.ts round-6 flip + drainInput.test.ts ruling-8 ride), RB-2, RB-4/5 spec magnitudes + stale literals, RB-6/7 OrientationTuning, SS-1..4 → (e) USER: R14-3 ruling (rec: split followBody → followApproach@60 + followHold@10), tick R14b-5 assertion change, feel pass on 0.2 band (Saturn/Jupiter focus; ceiling 97° at engage; tiltFullHR keep 0.02 rec) → (f) T18–T21 → wave-end deletion audit + radar → T22 gate → whole-branch review → /feature-done → land. Debug UI KEPT (user). Dev server :5173 bg shell bt9488iuz. PR body rewritten 2026-09-09 (update "in flight" lines when 14b/band/split are described as landed).
- 2026-09-09 SETTLE UN-BRAID DONE (fable, ~311k) on branch `settle-unbraid` (wt agent-a48eab64ec46de748): 1c52456d3 golden trace (test + 153 KB JSON fixture, 8,656 values, 17-digit) + 3e5ec818c un-braid. RESULT IS LOC-NEUTRAL: src +163/−165, tests +386. Shape built = scalar step laws + body-arm apply primitives with pivot as data (turnedPose, tiltTurnedPose, levelledPose w/ named bag, riddenOrientStepRad takes rideBound, wrapRad shared); the brief's three cross-arm functions NOT built (would need an arm union inside one fn = the representation×operation braid ruling 10 leaves alone; targets already had one home each). approachTiltedPose kept its inline tilt readout (tiltFromNadirRad moved pitch 1.8e-8 rel — world-arm in-window projection ill-conditioned at Earth scale: REAL FINDING, design change to fix). Golden trace deviation 0. Gates 8736/1255 tsc clean. headingTiltAt has 0 src refs (dead, needs ruling). HALTED per code-is-liability (neutral measurement) — user rules land/park; NOT cherry-picked yet. Harness agent still running.
- 2026-09-09 USER RULING: LAND the un-braid + DELETE headingTiltAt. Cherry-picked 40b2a9fb2 (golden trace) + 0ddbcc164 (un-braid) onto camera-pivot, clean. Follow-up agent (sonnet, this worktree): shrink fixture 153 KB → ~15 KB (stride + leg/mode seams, mutation-verified) + `refactor -- delete` headingTiltAt (+ HeadingTiltAt type if orphaned). Then push. Harness agent still running (isolation wt `sim-harness`); cherry-pick it after — its base bbdf0a5a9 predates these, expect clean.
- 2026-09-09 HARNESS DONE (sonnet, ~384k) on branch `sim-harness` off bbdf0a5a9, 13 commits 290334c04..4b36cd771 (wt agent-a76a11ca50ea7fd6d): tests net −773 (fixtures −1218 / harness +445, 14 files under tests/helpers/camera/: makeCameraSimHarness + diveUntilEngaged/recedeUntilDisengaged/seedRememberedTilt/driveWheelEvents + readers + poseAtHR). 11 files migrated; incidental 32-notch dives → until-verb, load-bearing counts kept explicit; controller-level unit tests (rememberedTilt/singularLocus/northUpToggle) left — no runFrame harness in them. Suite 8719/1252 green at both ends. CHERRY-PICK 13 commits after the fixture-shrink/headingTiltAt agent returns (same worktree).
- 2026-09-09 COMPACT CHECKPOINT 2 — pushed through 0ddbcc164 (golden trace + un-braid). LIVE: fixture-shrink + headingTiltAt-delete agent (sonnet, THIS worktree; commits 2, then push). QUEUE after it: cherry-pick sim-harness 13 commits (290334c04..4b36cd771 from wt agent-a76a11ca50ea7fd6d) → full suite → push → comment audit (comment-audit skill, whole branch, own commit) → post-consolidation minors round (RB-1 Important + RB-2/4/5/6/7 + SS-1..4) → update PR #647 body "in flight" lines → user items (R14-3 ruling rec followApproach@60/followHold@10; R14b-5 tick; feel pass on 0.2 band) → T18–T21. Dev server :5173 shell bt9488iuz.
  (correction: push landed through 7709a4813 — the shrink agent had already committed the fixture-stride commit; its headingTiltAt delete commit is in progress, tree has 3 uncommitted agent files.)
- 2026-09-09 SHRINK+DELETE DONE: 7709a4813 fixture 153→20 KB (STRIDE 40 + leg/arm seams; seam floor alone 18 KB because body-arm registers carry a Mat3; mutation-verified on the exercised branch) + eafb79a72 headingTiltAt + HeadingTiltAt type + test deleted (prose mentions remain in CameraDebugSnapshot.d.ts:35, blendedEnuAt.ts:5,25, surfaceController.test.ts:100, spec:790,872 — for the comment audit). HARNESS cherry-picked 93189a2d2..812a54d85 (13), suite 8729/1254 green, tsc clean, PUSHED @ 812a54d85. PR now tests +7826/−609, src +3860/−1262 vs main. COMMENT AUDIT dispatched as 3 parallel isolation agents off 812a54d85 (scope lists audit-scope-{A,B,C}.txt beside ledger; A utils/@types/data opus branch comment-audit-a; B services/components/state/tools opus branch comment-audit-b; C tests sonnet branch comment-audit-c) → cherry-pick all three, suite, push → then minors round.

## COMMENT AUDIT A landed (2026-09-09)

Agent A (utils/@types/data, 69 files) returned `5bee244f9` → cherry-picked as
`01c6f61e6` on camera-pivot (36 files, +284/−750, comment-only, tsc clean).
Not pushed yet — push together with B and C. B (services/components/state) and
C (tests) still LIVE in isolation worktrees; cherry-pick each on return, full
suite + tsc, push, then minors round.

Agent A adjudication items for the user (recorded; not acted on):
1. `headingTiltAt` refs deleted in CameraDebugSnapshot.d.ts + blendedEnuAt.ts;
   one left in tests/services/camera/surfaceController.test.ts:100 (agent C scope).
2. CameraDebugSnapshot.d.ts: dropped `armMismatch` / `epochDeltaDays` one-liners
   as name-restating — restore if user reads them as definitions.
3. InputStep.d.ts: dropped the "why startPx/endPx are absolute (ray per pixel)"
   sentence — that is the only WHY for the encoding; consider restoring one clause.
4. zoomedDistance.ts: dropped inline "real repair = cam.distance / altitude
   un-braid" note — already a pending user item (cam.distance un-braid offer);
   nothing lost.

## COMMENT AUDIT C landed (2026-09-09)

Agent C (tests, 86 files) returned `37a0853d6` → cherry-picked as `bdb3cbc37`
(43 files, +365/−628). Flagged: oneMpcSeam.test.ts header ~24 lines (cross-file
gate contract, not a literal exemption); "(prior art Q3/Q4c)" cites in
surfaceController.test.ts ~663/682 kept; anchoredZoomStep.test.ts:122 "old
sub-eye value" kept (paired with FW-H). Awaiting B, then suite + push.

## AUDIT B stalled + resumed (2026-09-09)

Agent B hit the 600 s stream watchdog while on slabs.ts/engine.ts (uncommitted
edits in its worktree agent-a7d59c64af67ae180, branch comment-audit-b). Resumed
via SendMessage with: finish scope, tsc + suite, one commit, report. Editor
diagnostics from its worktree showed unused-import warnings (Vec3 in
frameAlignedRoll.ts, eyeMpcOf in engine.ts) — told it those must be clean.
If it stalls again: take over its worktree tree directly (finish + commit).
Then cherry-pick, full suite + tsc on camera-pivot, push A+C+B together.

## COMMENT AUDIT B landed (2026-09-09)

Agent B returned `406de1092` (32 files, +717/−2504) after 3 watchdog stalls
(the full vitest run trips the 600 s watchdog — future briefs: `--reporter=dot`
or skip the suite and run it on the branch). Cherry-picked then AMENDED to
`9b155f77c` (31 files, +558/−2003): I pulled the starCatalogLayer.ts hunk
(−501 comment lines) OUT — the branch touches that file by 2 lines only and the
star-catalog-unbraid worktree is active on it; patch parked at
`starCatalogLayer-comment-audit.patch` beside this ledger for the user to route
(own PR / ride the un-braid). Verified the whole B diff is comment-only.
B adjudication items: (1) frameAlignedRoll.ts lost "round-7" + "2–4-notch" in
the singular-locus clause; (2) cameraSlice.ts clipStarted-vs-startClip naming
trap note deleted; (3) cameraSlice.ts commitCameraPose KNOWN RESIDUAL (spec
§790) deleted — spec still carries it.
Full suite + tsc running in background (bf1r3j2ih); on green → push.

## COMMENT AUDIT PUSHED (2026-09-09) — camera-pivot @ 9b155f77c

Full suite: two runs under machine load avg 90–145 (78 min and 39 min) showed
only 5-s timeouts in unrelated files (conventions sweeps, SettingsPanel,
CommandPalette) plus worker-level errors; targeted rerun of all 13 affected
files green 13/13, 1417 tests. tsc clean. Pushed 812a54d85..9b155f77c.
NEXT: (a) user adjudication on the audits' unsure deletions (list above);
(b) route starCatalogLayer-comment-audit.patch; (c) minors round (RB-1 first)
+ PR body "in flight" lines update; (d) R14-3 ruling still pending.

## MINORS ROUND dispatched (2026-09-09)

One opus agent, isolation worktree, branch `minors-round` off 9b155f77c, brief
`minors-round-brief.md` (RB-1a/b, RB-2, RB-3/4/5, RB-6, RB-7, RB-10, SS-1..4,
spec headingTiltAt prose). On return: cherry-pick its commits onto
camera-pivot, tsc + full suite (slow under load; use --reporter=dot), push,
then run the round reviewer over the minors diff. PR #647 body already
updated (14b/band/split/harness/un-braid/audit landed; smooth-zoom backlog).

## MINORS ROUND landed + pushed (2026-09-09) — camera-pivot @ 29232590f

Cherry-picked 772741f08/c01845234/2100cb484 → 678ca17ca/7a97198c3/29232590f
(14 files, +90/−67). Agent ran full suite green 8729/1254 in its worktree; on
the branch tsc clean + touched areas 165 files/2811 green. Deviations to note:
RB-1a needed an extra below-engage assertion to be mutation-sensitive; RB-1b
at 1.35 R⊕ (h/R 0.35, not 0.3 — at 0.3 the target roll coincided with the
fixture's own); SS-2 handedness is −1 (right = forward × up), not +1; RB-10
now near-duplicates the "from the record, not a literal" it (merge candidate).
Reviewer over 9b155f77c..29232590f dispatched (opus, read-only) — F1 rule: no
tracked-file edits on camera-pivot until it returns.

## MINORS REVIEW: fix-first (2026-09-09)

Reviewer over 9b155f77c..29232590f: RB-1a/b genuinely in-band + mutation-
sensitive (6 fixtures fail with w≡0); RB-6/SS-4 behaviour-preserving; spec
arithmetic right. Findings → fix agent (opus, isolation wt, branch
`minors-fix` off 29232590f): (1) canonicalBasisAt handedness comment claims
trig-slip sensitivity that mutation disproves; 1 sample, −1, state the
cross-order invariant; (2) delete the now-duplicate "not a literal" it in
regimeArmFor; (3) flooredBodyPose fixture needs non-zero anchor; (4) locus
maxTurn bar 0.52 → rideBound (+ hoist the `if (i===3)` assertion);
(5) SPEC/FW-E: "at the flip 0.4 R" is the RELEASE edge — the inbound engage
edge 0.2 R gives 3.6e-4 rad/s (0.021°/s), AT the perceptibility threshold →
FW-E now needs the T22 feel gate (USER-FACING: report); (6) tiltLerp "14 %
whatever the edges" only under 2× hysteresis; (7) OrientationTuning readout
test restated defaults → not-AT-FLOOR + '(floor '; (8) drainInput "mid-band"
wording at w≈0.097.
On return: cherry-pick, tsc + touched areas, push; no second review needed
unless the agent deviates.

## MINORS FIX landed + pushed (2026-09-09) — camera-pivot @ 458210efb

Fix agent's b5d7ed3ca/81e0770fc → 7f6797d36/458210efb (8 files, +61/−57).
All 8 findings done; one deviation: ride bound is `ORIENT_DECAY.rideBoundRad`
(orientDecay.ts), not ORIENT_TUNING. flooredBodyPose mutation (floor
eyeRelAnchorM) now FAILS the test. tsc clean; touched areas 4074 green.
Minors round CLOSED. The editor diagnostic "bodyFixedEyeM unused in
flooredBodyPose.ts" was the agent worktree's transient mutation, not the
branch (grep confirms the import is used).

## QUEUE (next)
1. USER: FW-E at engage 0.2 R = 0.021°/s drift (perceptibility threshold) —
   T22 feel-gate item; options if visible: wider band or shorter engage settle.
2. USER: route starCatalogLayer-comment-audit.patch; audit unsure-deletion
   rulings (naming trap / known-residual / round-7 id / 2 snapshot field docs).
3. USER: R14-3 ruling (rec: followApproach@60 + followHold@10); R11-1;
   pan-roll; cam.distance un-braid offer; RB-10 two ratio its.
4. Plan T18–T21, wave-end deletion audit + radar, T22 gate, whole-branch
   review, /feature-done, land. Retire earth-rtc-foundation wt.

## SIDE PR: skyCubemapCapture off cameraRuntime (2026-09-09)

User asked for it as a separate PR off main, in parallel. Opus agent in an
isolation worktree, branch `refactor/sky-cubemap-capture-off-camera-runtime`,
draft PR against main. Moves the field to top-level `EngineState.skyCubemapCapture`
(no new bag). When it merges to main, merging main into camera-pivot needs ONE
touch here: `tests/helpers/camera/makeCameraSimHarness.ts` seeds
`cameraRuntime.skyCubemapCapture` (camera-pivot-only file) → move the seed to
the state top level.
Addendum (user): same side PR also renames `bandActive`→`lastBandActive`,
`gcDistanceMpc`→`lastGcDistanceMpc` (last-frame memory vocabulary) and adds
backlog item "Sky-cubemap band memory derived, not stored" (needs-design,
detail md 2026-09-09-sky-cubemap-band-memory-derived.md). Sent to the agent
via SendMessage. camera-pivot merge touch grows to: harness seed field path +
the two renamed field names.
Side PR OPEN: draft #670 (6748cd273 + ce6e038b4, 15 files +111/−89), tests
343 files green, backlog entry added. Merge-back touch on camera-pivot:
harness seed → state top level + renamed fields lastBandActive/lastGcDistanceMpc.

## DESIGN NOTE (user, 2026-09-09): cameraRuntime single-writer reducer
User wants cameraRuntime mutated in ONE place via a reducer-like step. My
recommendation given: `state.cameraRuntime = stepCameraRuntime(prev, inputs,
nowMs)` once in runFrame; stages stepClock / replayInput / driver step
(drivers return `{ pose, next }` incl. follow capture state — R14-3 lands
there) / fold; boxes `{current}` removed; clipPlayer returns a new epoch;
surface controller converted last. Guard: ts-morph gate test (oneMpcSeam
style) forbidding cameraRuntime assignment outside runFrame + boot seed;
deep-freeze in the sim harness. Sequencing rec: own PR AFTER #647 lands, as
ground for T18 (+ R14-3). Awaiting user ruling.

## #670 MERGED + main merged into camera-pivot (2026-09-09) — @ 1d44398e5

#670 squash → main 2befbd94a. Merge: 4 conflicts (CameraRuntime.d.ts +
engine.ts: kept audited comments, took main's structure; two test files:
HEAD harness wins), harness seed moved to state.skyCubemapCapture with the
renamed fields. tsc clean; engine/gpu/visual/camera/conventions 4463 green.
Pushed.

## USER RULING (2026-09-09): cameraRuntime single-writer refactor ON THIS
BRANCH, with a plan. Process: refactor-ground skill (ideal diff, data delta
first, checkpoint with user) → spec section → writing-plans → SDD execution.

## REFACTOR-GROUND in flight: cameraRuntime single-writer (2026-09-09)

Two agents dispatched: (1) Explore/opus — box holders, runFrame step order,
driver/clock/drainInput/surface contracts, test constructors; (2) opus
greenfield — shapes from requirements R1–R9 only (no incumbent types).
On return: sketch ideal diff (data delta first), diff vs greenfield, verdicts
per touchpoint, prep list, adjacent findings → CHECKPOINT to user (shape
sign-off + PR packaging ask). Then spec "Ground preparation" section in
docs/superpowers/specs/2026-09-01-camera-pivot.md → writing-plans → SDD.
Byte bar for the refactor: settleGoldenTrace + round fixtures.
Trace + greenfield returned; CHECKPOINT written: runtime-refactor-ground.md
(ideal shape, options A–D, joints J1–J7+G, preps P1–P5, ask a/b/c).
Presented to user 2026-09-09; awaiting sign-off + PR packaging + units call.
Then: spec "Ground preparation" section → writing-plans (P1–P5 + T18 + R14-3).

## RULINGS (user, 2026-09-09) on runtime-refactor-ground checkpoint
1. Shape SIGNED OFF (A pure step returning actions + effective intent; B clip
   epoch in `epochs`; register+winner merge; surface as data; gate test).
2. Packaging: ALL FIVE PREPS AS COMMITS ON #647 (camera-pivot).
3. Units: elapsed unit unification IN P1.
NEXT: spec "Ground preparation" section (docs/superpowers/specs/2026-09-01-camera-pivot.md)
→ plan docs/superpowers/plans/2026-09-09-camera-runtime-single-writer.md
(writing-plans skill + plan-style.md) covering P1–P5, then T18 + R14-3 tasks.
PLAN AUTHOR dispatched (opus): writes docs/superpowers/plans/2026-09-09-camera-runtime-single-writer.md
+ spec section "Ground preparation — cameraRuntime single-writer" in the camera-pivot spec.
Inputs: runtime-refactor-ground.md, runtime-trace.md, runtime-greenfield.md, plan-style.md.
Phases 0–7 (byte bar, P1..P5, T18+R14-3 followApproach@60/followHold@10, gate).
On return: I self-check the plan against plan-style + the checkpoint, commit spec+plan
on camera-pivot, push, then ask user parallelism level and start SDD execution
(subagent-driven-development; ledger = this file).

## PLAN WRITTEN + PUSHED (2026-09-10) — camera-pivot @ 24182c2c3
docs/superpowers/plans/2026-09-09-camera-runtime-single-writer.md (21 tasks, 8
phases) + spec section (line ~910). Parallel groups: A = T1 ‖ T2 ‖ T10; B = T20 ‖
T21; rest sequential (runFrame/drainInput/cameraDrivers/harness shared).
Plan author's design calls awaiting user: (1) followApproach priority 55 not 60
(60 ties tween; pickWinner tie = table order); (2) advanceEpochs has per-row
eligibility keyed on the winner (three epochs reset only when their driver wins —
unconditional advance would burn a tween's ease queued behind a drag) + idempotent
same-ref; (3) follow roll ride moves from drainInput:230-255 to runFrame after
runCameraDrivers (riskiest move in P2); (4) NEAR_CLIP_MPC extracted (near 0.01
literal ×4); (5) register.winner stays string; (6) T18 re-records the driver
golden trace (R14-3 is a ruled behaviour change; settleGoldenTrace stays byte-
identical). ASK USER: parallelism level + (1)/(6) confirmations. Then SDD execute.
USER (2026-09-10): parallel groups (A: T1‖T2‖T10, B: T20‖T21), followApproach 55
confirmed; trace re-record not contested → proceed as planned. START SDD execution.
SDD EXECUTION of the single-writer plan runs in ITS OWN workspace/ledger:
.superpowers/sdd/2026-09-09-camera-runtime-single-writer/progress.md (resume map for that plan).
- 2026-09-10 SINGLE-WRITER PLAN COMPLETE + user rulings: LAND on neutral perf; notch family backlogged (docs/backlog/2026-09-10-wheel-notch-route-by-last-winner.md, needs-design); simulateFrame ×2 collapsed onto stepCameraRuntime (tests/helpers/camera/simulateCameraFrame.ts); makeSurfaceDriver kept; poseOf inlined into wireInput (file + test deleted, anti-alias assertion moved to wireInput.test). Ledger archived 258ce1a45 (completed/2026-09-09-camera-runtime-single-writer.ledger.md + .perf-T19.md); workspace deleted. camera-pivot @ 258ce1a45 pushed. RESUMING THIS PLAN at T19 ‖ T20 (isolation worktrees off 258ce1a45, opus each; briefs task-19-brief.md / task-20-brief.md; T19 also owns the deferred m3 = applyWheelZoom in the base-absolute/lastPose-body window the fly-to saga produces). Then T21 perf (paired A/B vs merge-base with main) → T22 USER feel gate → wave-end deletion audit + radar → /feature-done.
- 2026-09-10 T19 dispatched (opus, isolation wt, branch t19-lonlat-body-arm off 258ce1a45; report in ITS worktree .superpowers/sdd/2026-09-01-camera-pivot/task-19-report.md). T20 dispatched (opus, isolation wt, branch t20-keyframe-frames off 258ce1a45; report likewise task-20-report.md). Handling on return of either: cherry-pick its commits onto camera-pivot (record pre-pick HEAD as BASE), copy its report into THIS workspace, `review-package PLAN BASE HEAD`, task reviewer (opus) with brief + report + package + Global constraints (plan lines 63-89); fix rounds resume the same agent; push on clean review; `Task N: complete`. T20 picks AFTER T19 if both land together (cameraDrivers.ts shared only by T20; disjoint otherwise). Then T21 perf (paired A/B: base = merge-base 2befbd94a server vs HEAD server, MERGED medians, own port each) → T22 USER gate.
- T19 returned DONE_WITH_CONCERNS (800b4d3ca in wt agent-a0e1d9bb2b9d0429a) → cherry-picked 02d1613d9 (BASE 258ce1a45). Concerns: (1) rangeM = eye ALTITUDE not resolved-arm distance (absolute distance = orbit radius, would push out one R) — reviewer to rule; (2) GAL_*_EQ 6-decimal literals → basis unit to ~2e-7, metres-level altitude error, saga test moved to equatorial frame — possible backlog; (3) no floor on rangeM, deliberate; (4) heading read in pure body ENU (blendW=1). m3: closed for the saga; inverse one-frame window on fly-to from outside the band (notch takes anchored zoom) — reviewer to classify. Reviewer dispatched (opus) on review-258ce1a45..02d1613d9.diff. T20 still running.
- T19 review (opus): spec Accepted, quality Accepted. Concern 1 UPHELD (altitude is the correct "range preserved"; the brief's literal resolved-arm distance would push out one R — brief wording was the defect). Two Importants = knowing out-of-band deltas mandated by T19 itself, RULING: accepted as plan-mandated (fly-to from outside the band now lands at the heading-derived roll instead of screen-up; eye at true altitude when base.target ≠ Earth centre) — both observable above disengageHR → carry to the T22 user ping + spec deviations list at /feature-done. Minor 4 (body→world→body round trip on an engaged path, ~1.3 m via 6-decimal GAL literals, default orientation unaffected) NOT taken (one more branch for near-zero effect). m3 inverse window = backlog: added as case (c) to the notch-routing detail (cb02b6b4c). Pushed camera-pivot @ cb02b6b4c. Task 19: complete (02d1613d9). T20 still running.
- T20 returned DONE_WITH_CONCERNS (909241caf..b1c1ef32d in wt agent-a5876189b0a0cf511) → cherry-picked 8e71ba4a3, 2d79d796f, b9a94550d, ff89eb6c5 (BASE cb02b6b4c), +628/−74 over 19 files. Once-per-leg memo = WeakMap<playback obj, Map<segment, CameraPose>> in evaluateClip. Concerns: (1) evaluateClip lossy by name (metres for body-framed clips, ~48 callers expect Mpc); (2) mid-tween frame change freezes a straddling channel; (3) no driver-level test for framedClipArm body branch; (4) body keyframes can't express roll → levelled on BODY_LOCAL_FRAME.pole; (5) zero-range toBodyArm call to dodge oneMpcSeam gate; (6) no perf run. Reviewer dispatched (FABLE — size + simplicity judgement) on review-cb02b6b4c..ff89eb6c5.diff. Fix rounds resume agent a5876189b0a0cf511. On clean: push → T21 perf.
- T20 review (fable): spec NEEDS FIX + quality NEEDS FIX. Critical: spin opens a new absolute leg after a body endpoint (relative writers must stay in the current arm). Important: leg-start origin walk inclusive of co-starting segments (zero-length cut leaks units body→absolute); zero-range toBodyArm = wrong seam entry → bodyRelativePose for the point; bodyRadiusM/bodyStateFor duplicate resolveWorldArm; no round-trip test of the pair; no driver-level body-branch test. Minors: ClipFrameOptions comment instant, purity claim false + evaluateClip 0.87 comment ratio, dead fallbacks, dead roll ?? 0, mirror assertion, cosmicFlows tollbooth test, ReadonlyMap<string> return type. Rulings: concern 1 JSDoc suffices (throws without bodies); 2 = authoring-pathology class → compile-time validation FOLLOW-UP (surface at user ping); 4 consistent with surface roll rule; 5 not evasion but wrong entry; 6 T21 covers. Fix round 1 sent to agent a5876189b0a0cf511 (at ~235k tokens; this is its last own-diff round — round 2+ goes to a FRESH opus). On return: cherry-pick new commits, scoped re-review (opus, package from ff89eb6c5), push.
- T20 fix round 1 DONE_WITH_CONCERNS (agent now ~310k tokens → RETIRED; any round 2 = fresh opus). Cherry-picked 104e37936→…, c1281f8a3, 80db8109e, f54894beb onto camera-pivot = HEAD 04d55ff43 (BASE ff89eb6c5; +208/−135, 5 files). Suite 8764 green, traces untouched. Not done: item 13 (deriveBodyStates key type — BodyId is the source-registry union, 14 pre-existing casts; needs a scene-body-id type → candidate backlog). Item 8 partial (own delta 0.32; legacy 90-line header left — no mass sweep). Scoped re-review dispatched (opus) on review-ff89eb6c5..04d55ff43.diff. On Accepted: push → Task 20 complete → T21 perf.
- T20 scoped re-review (opus): ACCEPTED, all 13 items verified (mutation-tested). Item 13 → backlog warranted (scene-body-id type + 14 casts). New non-blocking: straddling spin freezes after a leg boundary (same class as concern 2, newly reachable), equal-startSec differing-frame tweens resolve by track order (pre-existing). Residual class for the user ping: per-endpoint tags under a pose-level frame → compile-time validation follow-up. Pushed camera-pivot @ 04d55ff43. Task 20: complete (8e71ba4a3..04d55ff43). NEXT: T21 perf.
- 2026-09-10 T21 dispatched (opus, isolation wt detached at merge-base 2befbd94a with own dev server = A; B = camera-pivot @ 04d55ff43 on http://localhost:5175, bg shell bvj163lc9 — KILL after T21; DO NOT edit camera-pivot files while T21 measures). Report → its wt .superpowers/sdd/2026-09-01-camera-pivot/task-21-report.md + perf-T21/. Neutral/negative → USER ruling (land/park) per plan. In parallel (read-only, isolation worktrees at 04d55ff43): wave-end deletion audit + entanglement radar over merge-base..HEAD — findings only, fixes dispatched AFTER T21 finishes.
- Deletion audit dispatched (opus, isolation wt at 04d55ff43, read-only; report → its wt .superpowers/sdd/2026-09-01-camera-pivot/deletion-audit.md). Entanglement radar dispatched (opus, isolation wt at 04d55ff43, read-only; report → its wt …/wave-end-radar.md). Handling: copy both reports here; rank; after T21 finishes (and only then — HEAD server must not change mid-measurement) ONE fix dispatch for the certain/likely deletions + agreed un-braids, review, push; "unsure" items → USER ruling list alongside T22.
- Radar DONE (copied → wave-end-radar.md): 3 high / 6 medium / 2 low. TRIAGE (controller): TAKE in the post-T21 fix dispatch, all high-confidence, no behaviour change, no re-record — H2 (poseBasis/upBasis onto DriverCtx, delete 5 ORIENTATION_FRAMES lookups in cameraDrivers), M1 (cameraDebugSnapshotOf → nearestBodyHR, −14), M2 (thread `bodies` into approachTiltedPose + liveBodyPosition/applyFocusedBodyPivot, memo becomes optimisation), M6 (DriverId union type, 4 string fields). M3 (autoRotate epoch advanced twice; disagreement only on a frame where autoRotate was last winner but loses this frame = the stale-winner family) → append as case (d) to docs/backlog/2026-09-10-wheel-notch-route-by-last-winner.md, not fixed here (re-record + design). USER RULINGS at the ping: H1 (session-mutable SURFACE_REGIME/ORIENT_TUNING globals read inside pure math; 4× save/restore ritual in tests), H3 (selectCameraActive restates 5 isActive predicates → `wakesLoop` row field), M4 (expiry rows registry ~30 lines), M5 (authoredOverride carries two stages; pin move → re-run traces). L1/L2 noted only. Waiting on T21 + deletion audit before any edit.
- Deletion audit DONE (copied → deletion-audit.md): ~120 certain / ~350 likely / ~3,650 unsure. TRIAGE (controller, per leanness.md): TAKE post-T21 — 3a settleGoldenTrace hand-rolled harness → makeCameraSimHarness/poseAtHR (trace bytes must stay identical), 8 cameraDrivers mirror (21) + isActive/resting restatements (52), 9 oneMpcSeam readFileSync `it`, 10 state.cam → boolean + drop wireInput createOrbitCamera call, 11+13 comment budget trims (~80, headers only), 12 inline recedeUntilDisengaged, 14 selectCameraIntent un-export (NO_FOLLOW_MEMORY keeps export: 1 external ref). NOT taken: 7 noStoredRegimeFlag = spec §11 acceptance grep (plan Global constraints name it) → keep unless user amends spec; 2 DebugPanel readout = already ruled KEPT by user (ledger 2026-09-09); 1 driverGoldenTrace byte bar (2,169) + 3b settle trace → USER ruling (retire-after-landing vs keep); 4/5/6 feel-trial knobs + northUp/lin parallel paths (~470) → decide AT/AFTER T22 (they are the gate's levers) — USER; readCameraEpochs dies with 1. Combined post-T21 dispatch = radar H2/M1/M2/M6 + M3 backlog append + deletion items above; opus, in camera-pivot, one commit per concern, review, push.
- Both camera-pivot dev servers (5175 shell bvj163lc9, old 5173 shell bt9488iuz) exited 143 (SIGTERM) — most likely T21's end-of-run kill was broader than its own server. task-21-report.md already exists in its worktree → measurement presumably complete; awaiting its notification. No live dev server for camera-pivot now; restart with `npm run dev` (bg) for T22.
- T21 DONE: paired A/B (A 2befbd94a @5176 vs B 04d55ff43 @5175), 4 pairs × 10 scenarios, MERGED medians: sums 216.4 vs 215.8 (Δ −0.6 ms), every per-scenario Δ inside its own spread (median spread 2.5 ms; sgr-a-star-lens bimodal 2/2 both sides); rAF probe vsync-pinned 8.30 ms both sides (no sub-8.3 resolving power — proves 120 fps sustained, not a CPU delta). VERDICT NEUTRAL = the bar. Report → task-21-report.md (raw stays in the agent worktree). PER PLAN: neutral HALTS LANDING → USER ruling land/park (to be asked together with T22 + the other open rulings). INCIDENT: agent's `pkill -f vite -n` killed EVERY Vite server on the machine (5173/5174/5175) — other sessions' worktree servers too; user must be told. Task 21: complete. Fix wave (not a landing step) proceeds now.
- Wave-end fix dispatched (opus, IN camera-pivot, BASE 04d55ff43; 12 commits: M6 DriverId, H2 basis on DriverCtx, M1, M2, M3 backlog (d), 3a settle harness dedupe [STOP if any sampled value moves], 8, 9, 10 state.cam→flag, 12 recede inline, 11+13 header trims, 14). Report → wave-end-fix-report.md. On DONE: review-package 04d55ff43..HEAD → reviewer (opus) → push → restart dev server → USER PING with: T21 land/park ruling, T22 gate list, deletion rulings (driver trace byte bar; feel knobs after T22), radar rulings (H1/H3/M4/M5), clip authoring-validation follow-up, deriveBodyStates key type backlog, the Vite kill incident.
- 2026-09-10 ACCOUNT HANDOFF (personal → ludens; this session ends). LIVE AGENT AT HANDOFF: the wave-end fix implementer (opus, IN camera-pivot, BASE 04d55ff43, 12 commits per the dispatch line above) — it dies with the session. NEW SESSION FIRST: list commits 04d55ff43..HEAD in camera-pivot and check for `wave-end-fix-report.md`; commits present = done items; anything missing → re-dispatch ONLY the missing items from the dispatch spec (BASE = current HEAD); a dirty tree = a half-done item: inspect, then finish or discard it. Then review-package 04d55ff43..HEAD → opus reviewer → fix rounds → push → restart `npm run dev` (bg) → USER PING (contents in the dispatch line). Agent worktrees to clean afterwards via tools/dev/skymap-wt-clean.sh: agent-a0e1d9bb2b9d0429a (T19), agent-a5876189b0a0cf511 (T20), agent-ab3f090826d16fb03 (T21; holds perf-T21 raw), agent-aa968ac3bcf1abe24 (deletion audit), agent-a8d3e0da7a3b9f053 (radar), plus the single-writer plan's older agent worktrees.
- UPDATE before the switch: the fix wave FINISHED — all 12 landed, e7b0fdb2c..7c5aee771 (74 files, +415/−728; src code +10, src comments −87, tests −256, docs +25); suite 8757 green, real tsc clean, fixtures byte-identical, gate untouched. PUSHED camera-pivot @ 7c5aee771 UNREVIEWED (draft PR, sanctioned). Report: wave-end-fix-report.md. Judgement calls for the reviewer: only poseBasis went onto DriverCtx (upBasis resolves after produce, unread) and only 3 of the "5 lookups" were the frame basis (clip/tween authoring basis stays); cameraRuntimeSingleWriter.test.ts:73 allow-list LABEL still says "when state.cam is built" (stale prose, one-line follow-up — allow-list itself unchanged); two tests rewritten not deleted (liveRenderCamera stale-cam leak, wireInput target-copy guard now mutates the spy's array); tiltGain.ts/orientDecay.ts stay over the half-ratio (1 and 5 code lines). NEW SESSION FIRST ACTION is now: review-package 04d55ff43..7c5aee771 → opus reviewer (pass the report + the two audit files' sections) → fix rounds → push → restart dev server → USER PING.
- 2026-09-10 LUDENS SESSION RESUMED from .claude/rps/restart-prompt-2026-09-10_12-01.md. Tree clean @ 7c5aee771 = origin. Wave-end fix REVIEW dispatched (opus, read-only, package review-04d55ff43..7c5aee771.diff + fix report + radar/deletion sections) → report wave-end-fix-review.md. Dev server restarted (bg). On verdict: NEEDS FIX → fresh opus fix round in camera-pivot + scoped re-review; ACCEPTED → push (already pushed) → USER PING (contents in the dispatch line above).
- 2026-09-10 USER DIRECTIVE: surface band defaults 0.2/0.4 → 0.45/0.9 h/R (supersedes ruling 19 values; hysteresis stays 2×). src edit applied in surfaceRegime.ts; 4 tests (surfaceStep ×3, replayInput ×1) hard-coded notch counts to the old band → fix agent (opus, in camera-pivot) re-homing them on SURFACE_REGIME, one commit incl. src, report band-0.45-report.md. Golden traces unaffected (passed with the new band). Wave-end fix review still running in parallel. On DONE: cherry-nothing (agent commits in place) → typecheck → push → note spec/doc lines carrying old defaults for the ping.
- Wave-end fix REVIEW (opus) → wave-end-fix-review.md: NEEDS FIX narrow — 11/12 MATCH, fixtures byte-identical, judgement calls 4 ACCEPT + liveRenderCamera REJECT. C1 = the USER band re-tune (not the wave): settle trace 26→27 steps + poseFold disengage test. Band commit 5aa438961 (tests re-homed on SURFACE_REGIME) + trace RE-RECORDED a94706a45 (parse-compared: engage crossing dive 28→20, no key change) — re-record sanctioned by the user directive (Ruling: band change is a ruled behaviour change → trace re-record permitted; cost if wrong: trace no longer guards the pre-re-tune settles, git has the old fixture). Ruling: minors (a) roll passthrough (dead: InitialCam has no roll), (d) ReadonlyMap<string> seams (= radar L2, out of scope), (h) hoist — NOT taken. USER RULING 2026-09-10: tilt blend (bodyUpWeight) gets its own TILT_BAND + 2 sliders, "blend only" (maxTiltRad stays on disengage); revises ruling 10; invariant zeroHR ≤ disengageHR. Fix round dispatched (opus, in camera-pivot, BASE a94706a45, brief tilt-band-fix-brief.md, units A–F one commit each) → report tilt-band-fix-report.md. On DONE: review-package 7c5aee771..HEAD → scoped re-review (opus) → push → USER PING.
- USER: merge origin/main into camera-pivot. Dry-run: 4 commits behind (#671 #674 #672 #673), CONFLICTS in engine.ts, runFrame.ts, slabs.ts, wireInput.ts (ContentLayer→ContentPass + splat ground prep vs single-writer runFrame). QUEUED behind the tilt-band fix round (dirty tree). Then: merge agent (opus, in camera-pivot; resolve, suite green, golden traces byte-identical vs pre-merge, tsc) → scoped re-review over 7c5aee771..<pre-merge HEAD> (branch-own commits only; merge commit excluded from the package) → push → USER PING.
- Tilt-band fix round DONE_WITH_CONCERNS: 7 commits 82c1446ad..c43b757a3 (A poseFold re-home, B log-space line, C liveRenderCamera observable, D minors b/c/e/f/g, E band prose+spec numbers, A2 7 more old-band literal tests re-homed [outside brief, kept — suite gate], F TILT_BAND + setTiltBand + 2 sliders, defaults = regime band). Suite 8760 green, fixtures hash-identical to a94706a45. Concerns: f32 half-ulp sightline nudge on abs→body flip in narrow altitude windows (pre-existing, unbacklogged → user ping); agent used git stash once (restored); spec Δtilt-at-flip figure not re-measured for 0.45/0.9. Report tilt-band-fix-report.md. NOW: scoped re-review (opus) on review-7c5aee771..c43b757a3.diff → wave-end-fix-rereview.md, IN PARALLEL merge agent (opus) origin/main → camera-pivot (pre-merge HEAD c43b757a3).
- Merge origin/main DONE: 6c02b9439 (parents c43b757a3 + 89d716438), 4 conflicts resolved in-commit (branch condensed prose kept, main renames ported; one hand-edited executable line runFrame.ts earthPass.enabled — reviewer eye), suite 8760 green, gate 5/5, fixtures byte-identical. NOT pushed — waiting on scoped re-review (opus, in flight) → push. Heading-reset diagnosis agent (opus, read-only, scratch wt) in flight → heading-reset-diagnosis.md. Debug-panel grill STARTED (Q1 open: what the panel answers first; rec = per-DOF current/target/residual).
- Scoped re-review (opus) ACCEPTED w/ follow-ups → wave-end-fix-rereview.md: 7/7 prior ADDRESSED, 0 Critical, 2 Important (N1 rememberedTilt.test.ts:153/181 standpoints keyed to regime edges → log-vs-lin test vacuous under narrow TILT_BAND; :161-168 loop must STAY on disengageHR; N2 invariant zeroHR ≤ disengageHR only on write → add load-time assertion in tiltBand.ts), 8 minors (ledgered in the file, deferred). Fix dispatched (opus, in camera-pivot, BASE 6c02b9439) → then PUSH.
- N1/N2 fix 9655c6810 (N2 guard homed in bodyUpWeight.ts — the two records import each other cyclically and neither body can see both defaults; report rereview-n1n2-report.md; third regime-keyed fixture = drag-wall test, left, = minor N9). PUSHED camera-pivot @ 9655c6810 (15 commits: band 0.45/0.9, trace re-record, fix round A–F+A2, merge main 6c02b9439, N1/N2). OPEN: heading-reset diagnosis agent in flight; debug-panel grill Q2 open; USER PING still owed (T21 land/park, T22 gate, deletion + radar rulings, clip authoring-validation, deriveBodyStates key type, f32 half-ulp flip nudge, Vite kill incident) — deliver after the heading diagnosis lands.
- Heading-reset DIAGNOSED (heading-reset-diagnosis.md): F1 = orientStepRad decays 25%/frame regardless of notch size (aggregator folds wheel events → one step/frame) → trackpad resets heading in ~90-180 ms; CONFIRMED by user (north-up off ⇒ no reset). F2 = blended-up reversal at the cancel locus flips the heading READOUT only (|lat|>60° ecliptic). Adjacent: absolute-arm wheel burst unclamped; unbacked tilt pops 37° at disengage — offered to user, unruled. F1 fix (decay ∝ log-zoom) OFFERED, not started. USER DIRECTIVE: TILT_BAND defaults 0.06/0.60 → agent (opus) dispatched: defaults + re-home + trace re-record (ruled) → tilt-band-defaults-report.md → push. User observation: north-up off keeps heading as roll when zoomed out = designed R1 behaviour, told.
- USER RULINGS 2026-09-10: T21 = LAND (perf ok). F1 = GO (brief f1-decay-per-logzoom-brief.md; dispatch after the tilt-band-defaults agent lands — both re-record the settle trace). Grill Q3 = engine-side per-frame delta + peak hold beside cameraDebugSnapshotOf (agreed). Grill continues (Q4 next).
- GRILL debug panel COMPLETE (9 Qs; transcript agent writing docs/grill-sessions/camera-debug-panel-2026-09-10.md): per-DOF current/target/residual/Δ/peak rows; engine-side per-frame delta record; endpoint rolls dropped; drawn log band bar with sliders under it; header = arm·driver·gesture; raw rows collapsed; degrees on screen, radians in dump; targets shown with (off) marker; LANDS ON THIS PR (user overruled own-branch rec). Build: dispatch after F1 (or in parallel in an isolation wt off camera-pivot HEAD) — brief to write from the transcript.
- Tilt-band defaults 0.06/0.60 DONE: 3229a164f + f0e41a488 (settle trace re-recorded 27→26 steps, labels diverge at idx 19 = one fewer recede notch; driver trace untouched); 18 tests re-homed on TILT_BAND (report tilt-band-defaults-report.md). Concerns → USER RULINGS: (1) drag-wall reconciliation UNREACHABLE at shipped defaults (ceiling ramp contains the blend band) → re-key maxTiltRad to TILT_BAND, or delete the wall; (3) zeroHR < engageHR would empty the world-arm∩in-band set (7 register-loop fixtures) — consider a floor zeroHR ≥ engageHR. Grill transcript committed ee75dce53. PUSHED @ ee75dce53. DISPATCHED in parallel: F1 fix (opus, IN camera-pivot, BASE ee75dce53, brief f1-decay-per-logzoom-brief.md → f1-decay-report.md) and debug-panel rebuild (opus, ISOLATION wt, branch debug-panel-rebuild off ee75dce53, brief debug-panel-brief.md → its wt report; cherry-pick onto camera-pivot after F1 lands). Then: review both (one package each), push, T22.
- 2026-09-10 ~12:35 USER RULING: "simplify it, and unbraid it" (orientation stack: three h/R ramps over tilt = regime band, tilt blend band, drag-wall ceiling; plus two decays, two trial toggles). Dispatched read-only opus design agent per `orientation-unbraid-brief.md` → output `orientation-unbraid-design.md` (radar + target design + deletion list + behaviour-change rulings + task plan). F1 agent left RUNNING (mid-edit in the same files; its per-log-zoom settle lands FIRST, un-braid goes on top). Debug-panel agent left RUNNING in its worktree (cherry-pick after un-braid; its snapshot fields may need re-fit). On design DONE: user checkpoint on the deletion list + behaviour changes, then execute as SDD tasks on camera-pivot. T22 feel gate moves AFTER the un-braid.
- 2026-09-10 ~14:55 Design DONE: `orientation-unbraid-design.md` (F1 wall accidental, F2/F3 knob+toggle freeze −544 post-T22, F4 gesture union, F5 drag cap, ≈−749 net). USER PING sent: rulings B1/B2 (wall), B4/B5 (toggles), B6 (sliders after T22). Debug-panel agent DONE: branch `debug-panel-rebuild` commits 43c772266 + de32c7560 in wt agent-a6987fd534f6c7e12, report `debug-panel-report.md`; NOT cherry-picked yet (after F1 + T-A land; re-fit: ceilingRad row dies, band bar + sliders die at T-F, per-frame cameraDofAnglesOf cost unmeasured). F1 agent still RUNNING.
- 2026-09-10 ~15:05 F1 agent DONE: bac4f435d (fix) + e9e2c03af (settle trace re-record; driver trace untouched), report `f1-decay-report.md`, NOT pushed. Concerns: (1) park no longer settles (by ruling, T22 checks), (2) u = raw notch not post-clamp spent zoom → provisional ruling: u = SPENT log-zoom, (3) zoom(0.5) spends 0.69 rad. Review dispatched (opus) → `f1-decay-review.md`, package review-ee75dce53..e9e2c03af.diff. On verdict: fix round if needed (fresh opus, include ruling 2), push, then un-braid T-A..T-D pending user rulings B1/B2/B4/B5/B6.
- 2026-09-10 ~15:25 F1 review = FIX ROUND (`f1-decay-review.md`): F1 u raw not spent (HIGH), F2 decay per-notch unbounded + envelope fixtures gone (HIGH), F3 rememberedTilt:214 tautological. Rulings R-A u = spent log-zoom from post/pre distance (derive inside frameAlignedRoll, spentZoomFactor util), R-B no extra cap, pin envelope at u=ln2 by test, R-C dither. Fix round 1 dispatched (fresh opus) → `f1-fix1-report.md`; then scoped re-review, push.
- 2026-09-10 ~15:50 F1 fix round 1 DONE: ffca44eeb (spentZoomFactor util at body-arm site; frameAlignedRoll keeps threaded u — deviation ACCEPTED: absolute-arm zoom unclamped so raw=spent) + 2039ea13f (envelope test at u=ln2). Report `f1-fix1-report.md`. Suite 8774 green, tsc clean (verified by controller), both fixtures + gate byte-identical. Scoped re-review dispatched → `f1-fix1-rereview.md`. On APPROVE: push camera-pivot. Adjacent unruled: "absolute-arm wheel burst unclamped" has NO backlog home (only in design.md:546) → include in user ping.
- 2026-09-10 ~16:05 F1 re-review APPROVE (`f1-fix1-rereview.md`); residuals N1-N3 applied ff48c5c53; PUSHED camera-pivot @ ff48c5c53. F1 CLOSED. Next: user rulings B1/B2/B4/B5/B6 → un-braid T-A (wall) + T-B/T-C/T-D (safe) → cherry-pick debug-panel-rebuild (43c772266, de32c7560; re-fit ceilingRad row) → T22 → T-F freeze → /feature-done.
- 2026-09-10 ~16:15 USER RULINGS: B1/B2/B3 (wall) = YES; B4/B5/B6 (toggles, sliders) = NOT SURE YET → deferred to after T22 (T-F stays parked). Dispatched opus implementer for T-A (wall delete + spec §6 amend) + trace re-record + T-B/T-D (gesture phase union, noteBody) + T-C (drag capRad); BASE ff48c5c53; report `unbraid-TA-TD-report.md`. On DONE: review-package ff48c5c53..HEAD → opus review → fix rounds → push → cherry-pick debug-panel-rebuild → T22 ping.
- 2026-09-10 ~16:25 USER: "pause now". Told T-A..T-D implementer to stop at a clean commit boundary (finish-if-near-green else revert uncommitted, never stash). On its PAUSED report: record committed SHAs + remaining tasks here; nothing else in flight. RESUME = re-dispatch the remaining T-A..T-D tasks from `orientation-unbraid-design.md` §5, then review-package ff48c5c53..HEAD.
- 2026-09-10 ~16:45 T-A..T-D implementer DONE before the pause landed: 884eacaf4 (T-A wall delete + spec §6), e7c6c92e2 (T-B/T-D gesture phase union), c99b0e01b (T-C dragLevelCapRad; notchLogZoom kept as calibration constant, 2 test readers). settleGoldenTrace re-record was BYTE-IDENTICAL (wall inert at every trace pose) → no fixture commit. Suite 8760 green, tsc clean, gate untouched. Net −198. NOT pushed, NOT reviewed. PAUSED here per user. RESUME = review-package ff48c5c53..c99b0e01b → opus review → fix rounds → push → cherry-pick debug-panel-rebuild (43c772266, de32c7560; re-fit: ceilingRad row gone, SurfaceMemory.pointerDown gone) → T22 ping (+ rulings B4/B5/B6, absolute-arm burst unclamped backlog home).
- 2026-09-11 RESUMED (user "you can continue"). Review dispatched (opus) for ff48c5c53..c99b0e01b → `unbraid-TA-TD-review.md`. Then fix rounds → push → cherry-pick debug-panel-rebuild → T22 ping.
- 2026-09-11 un-braid review = FIX ROUND (`unbraid-TA-TD-review.md`): (1) no witness for B1/B2 — golden trace drags all at h/R 2.4e-6 where the wall saturated, so byte-identical was forced; (2) spec §6 paragraph false on the drag path: look drag at h/R 0.9 → 45° unbacked tilt at the flip = SECOND ROUTE to the 37° pop (B7); (3) 4 stale wall comments, spec:346, notchLogZoom doc clause, report overstated. RULING: accept B2 semantics (next notch settles unbacked tilt; no ramp comes back), spec must be true on both paths, B7 second route → T22 checklist item (drag-tilt near disengage then zoom out, watch the flip). Fix round 1 dispatched (opus).
- 2026-09-11 un-braid fix round 1 DONE 8301cdd05 (witness test B1: look drag at disengage altitude → 45° where ceiling was 0; §6 trued; stale prose) + b0dfb6475 (seedRememberedTilt comment). PUSHED camera-pivot @ b0dfb6475. T-A..T-D CLOSED (net ≈ −175 after the witness). Dispatched opus: cherry-pick debug-panel-rebuild (43c772266, de32c7560) onto camera-pivot with re-fit + cameraDofAnglesOf microbench → `debug-panel-cherrypick-report.md`. On DONE: review-package b0dfb6475..HEAD → review → push → T22 ping (checklist += drag-tilt near disengage then zoom out; rulings B4/B5/B6; absolute-arm burst backlog home).
- 2026-09-11 debug-panel cherry-pick DONE: 79cd028d0 (engine record) + c67b3d25b (panel), re-fitted (no ceiling row; gesture three-state); suite 8777 green; microbench 20 µs/frame body arm, 40 µs absolute, ALWAYS ON (two 184-body walks). RULING: not acceptable as shipped — gate on panel mounted or reuse frame values; reviewer to pick. Review dispatched → `debug-panel-review.md`. Stale wall prose in northUpToggle.test.ts:5,81,83 — dies at T-F if B5=freeze, else fix. Then fix round → push → T22 ping.
- 2026-09-11 debug-panel review = FIX ROUND (`debug-panel-review.md`): F1 record unconditional above isReady (fix (a) mount gate ~18 lines; (b) impossible — bandRollTarget not per-frame), F2/F3 test tautologies, F4 band group not on the one model; heading target=0 KEEP. Fix round 1 dispatched (opus) → `debug-panel-fix1-report.md`; then scoped re-review → push → T22 ping.
- 2026-09-11 panel fix round 1 DONE: 1aed9215e (mount gate) + 09cc12a1c (tests); suite 8778 green; scoped re-review dispatched → `debug-panel-fix1-rereview.md`. On APPROVE: push → T22 ping.
- 2026-09-11 panel re-review APPROVE; nits 4c0c88c93; PUSHED camera-pivot @ 4c0c88c93. Panel CLOSED. T22 PING SENT (checklist below in the ping). Open rulings for the user after T22: B4/B5 (toggles), B6 (sliders), B7 (arm-entry adopts tilt), driverGoldenTrace byte bar keep/retire, radar H1/H3/M4/M5, backlog homes (absolute-arm burst, deriveBodyStates casts, clip per-endpoint validation, f32 half-ulp nudge). Then T-F (if ruled) → /feature-done.
- 2026-09-11 T22 USER ATTESTATION: items 1,2,3,5,6 CHECKED; 7 (debug panel) LOOKS GOOD; 4 (drag-tilt near disengage → zoom out, pop) NOT SURE, user will check others first. Rulings B4/B5/B6/B7 still open.
- 2026-09-11 USER RULING B4/B5/B6 = KEEP AND RE-HOME: band sliders + log blend + north-up move into Redux camera state, threaded into the math (radar H1 the threading way; T-F freeze is DEAD). Dispatched read-only opus design per `camera-tuning-slice-brief.md` → `camera-tuning-slice-design.md` (slice placement, threading table, net LOC, 2-4 tasks). On DONE: short user checkpoint on the shape, then execute tasks on camera-pivot (BASE 4c0c88c93), review, push. Golden traces byte-identical is a gate on every task. Still open: item 4 of T22, B7, driverGoldenTrace keep/retire, H3/M4/M5 backlog, 4 backlog homes.
- 2026-09-11 tuning design DONE (`camera-tuning-slice-design.md`): tuning field on camera slice (StepInputs carries RootState; settings rejected = mirror); cycle dies by deleting all three records → one import-free cameraTuning.ts + clampCameraTuning; 26 threading rows via existing ctx bags; net ≈ −60 (src ≈ −5); goldens byte-identical every task. RULING R1: drop the "(engage yielded)" readout clause. Dispatched opus for T1+T2 (BASE 4c0c88c93) → `tuning-T1T2-report.md`. Then: review T1+T2 ∥ dispatch T3+T4 (panel via useAppSelector/dispatch, R1, refs sweep, comment pass, deletion-audit) → review → push → user visual check of sliders/toggles + T22 item 4.
- 2026-09-11 tuning T1 3cb63f494 + T2 7b21505a0 DONE (T3 wiring rode T2: useAppSelector/dispatch, Provider tests; R1 applied = no yielded clause); suite 8782 green, goldens byte-identical, cycle greps pass; net −9 (design said −60). Dispatched opus T4 sweep (refs/spec prose, comment pass, madge, test tuning helper) → `tuning-T4-report.md`. Then ONE review package 4c0c88c93..HEAD → fix rounds → push → user visual pass on sliders/toggles + T22 item 4 → /feature-done (deletion-audit there).
- 2026-09-11 tuning T4 DONE 6ce2c013a (spec/plan prose, CameraBandBar/test comments, madge: only cycle in the camera folders is PRE-EXISTING bodyLikeFraming⇄focusFraming; helper declined; 5 stale plan maxTiltRad hits incl. live checkbox :1010 need a ruling). Suite 8782 green. Review dispatched (opus) for 4c0c88c93..6ce2c013a → `tuning-review.md`. Then fix rounds → push → user visual pass (sliders/toggles live) + T22 item 4 → /feature-done.
- 2026-09-11 tuning review APPROVE (`tuning-review.md`); residuals 20f3d6627 (F1-F4, plan :1010 restated structural); PUSHED camera-pivot @ 20f3d6627. Tuning slice CLOSED. USER PING: visual pass on sliders/toggles (live) + T22 item 4 → rulings B7, driverGoldenTrace keep/retire, H3/M4/M5 backlog, 4 backlog homes, pre-existing bodyLikeFraming⇄focusFraming cycle → /feature-done (deletion-audit there).
- 2026-09-11 USER ATTESTATION: sliders and toggles work live from Redux (T3 visual pass DONE). Still open: T22 item 4, rulings B7 / driverGoldenTrace / backlog yes-no.
- 2026-09-11 USER ATTESTATION T22 item 4: NO POP (drag-tilt near disengage → zoom out through flip). T22 COMPLETE (7/7). B7 → backlog (no feel need). Remaining rulings: driverGoldenTrace keep/retire; backlog yes-no list. Then /feature-done.
- 2026-09-11 RULINGS: driverGoldenTrace KEEP; adjacent findings → BACKLOG ALL (B7, absolute-arm burst, deriveBodyStates casts, clip per-endpoint validation, f32 half-ulp nudge, bodyLikeFraming⇄focusFraming cycle, radar H3/M4/M5). Starting /feature-done: (1) backlog entries agent ∥ whole-branch deletion audit (opus, legacy framing, fenced by wave-end `deletion-audit.md`); (2) DoD audit; (3) safe-now deletions commit; (4) completion moves + ledger archive + push; (5) user squash-merges #647.
- 2026-09-11 backlog entries committed 420cbd211 (7 detail files + index lines). NOTE: index clauses too long for the convention → trim to one terse clause each in the completion commit. Waiting: deletion-audit-final.md, feature-done-audit.md.
- 2026-09-11 DoD audit NOT READY on process only (`feature-done-audit.md`): checkboxes 0/43 ticked, Task 5 prose names dead maxTiltRad, single-writer plan straggler in plans/; tests+tsc PASS, 0 TODOs, smoke FOUND, parity up; branch 4 behind main. RULINGS: tick from ledger, restate Task 5 lines, move straggler, merge main. Dispatched opus completion agent (merge main → tick → moves + ledger archive + backlog trim → push). Deletion audit still running → safe-now bin = follow-up commit (ride if it lands before the push). Then USER squash-merges #647; worktree cleanup after.
- 2026-09-11 USER: at cleanup also remove the agent-* worktrees used for this work (memory saved). Cleanup set after merge: camera-pivot, earth-rtc-foundation, agent-a6987fd534f6c7e12 (debug-panel-rebuild, cherry-picked), agent-a0e1d9bb2b9d0429a, agent-a5876189b0a0cf511, agent-ab3f090826d16fb03, agent-aa968ac3bcf1abe24, agent-a8d3e0da7a3b9f053 + any older agent-* from this PR; branches debug-panel-rebuild, worktree-agent-*.
