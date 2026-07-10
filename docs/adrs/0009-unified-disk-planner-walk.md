# ADR 0009: One Shared Catalog Walk Feeds Both Disk Planners

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** Alexander Rulkens
- **Tags:** engine, rendering, performance, subsystems
- **Supersedes:** the "two separate walks" premise of
  [`specs/completed/2026-05-28-procedural-disk-fade-out-design.md`](../superpowers/specs/completed/2026-05-28-procedural-disk-fade-out-design.md)
  (its Approach section) — not the shipped fade-out behaviour, only the walk-count rationale.
- **Related:** `src/services/engine/subsystems/diskPlannerWalk.ts` (the shared walk);
  `proceduralDiskSubsystem.ts` + `texturedDiskSubsystem.ts` (the two row-reducers).

## Context

The procedural-disk and textured-disk subsystems each decide, per frame, which
catalog rows get a disk this frame. Both need the same per-row geometry: read the
position, compute `camDistSq`, take a `sqrt`, project to apparent pixels `px`. The
2026-05-28 procedural-disk fade-out spec left these as **two independent per-frame
catalog walks**, one per subsystem, on the premise that

> per-row cost is dominated by the squared-distance compare, which neither planner
> can make cheaper.

That premise held that the geometry was irreducible, so sharing a walk would only
braid two unrelated planners into one kitchen-sink walker for no gain.

The premise is superseded by measurement. On an M1 Max (2026-06-30) the two walks
cost ~4.2 ms of a 5.1 ms frame — the dominant frame cost, and duplicated. The
irreducible cost is not just the squared-distance compare but the whole per-row
read / `camDistSq` / `sqrt` / `px` chain — and while no single planner can make it
cheaper, running it once instead of twice halves it. Two walkers were each
iterating the same ~2.5M rows independently.

The spec's "kitchen-sink walker" fear is real but avoidable: it assumes sharing a
walk means interleaving both planners' branches inside one loop body. A strategy
that keeps the two decision bodies separate — the walk owns iteration and geometry,
each subsystem owns its own row decision — does not braid them.

## Decision

**One shared walk computes each row's geometry once and hands it to two injected
row-reducers.**

`createDiskPlannerWalk` (`src/services/engine/subsystems/diskPlannerWalk.ts`) owns:

- **Source iteration** — the single pass over the loaded catalogs.
- **The single shared per-source stride cursor** — the decimation "which rows update
  this frame" state, previously duplicated per subsystem, now one cursor.
- **The distance early-out at the looser 8-px bound** —
  `maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX)`. The walk rejects rows too far
  to matter to *either* planner; a row inside the loose bound but outside a
  subsystem's own tighter bound is filtered by that subsystem, not the walk.
- **The per-row geometry** — position read, `camDistSq`, `sqrt`, `px`, computed once.

For each surviving row the walk calls two reducers with
`(source, catalog, i, x, y, z, camDist, px)`. Each subsystem exposes
`beginFrame(input): DiskRowVisitor` returning a visitor whose `onRow` applies that
subsystem's **own px gate** and records its decision. Two named visitor bodies, not
interleaved branches inside the walk — the strategy pattern, so the geometry is
shared but the two decisions stay un-braided.

**What this does NOT change:** the shipped procedural-disk fade-out (per-instance
`procFadeOut`, one shader multiply) from the 2026-05-28 spec is untouched. This ADR
supersedes only that spec's *rationale for two walks*, not its behaviour.

## Consequences

### Positive

- **Per-row geometry runs once, not twice.** The read / `camDistSq` / `sqrt` / `px`
  chain — the ~4.2 ms the two walks cost — is halved at the source, over the full
  ~2.5M-row hot loop.
- **One decimation cursor.** "Which rows update this frame" is now a single shared
  per-source cursor instead of two that drift independently.
- **The un-braiding is enforced by shape.** The walk cannot see either subsystem's px
  gate; a subsystem cannot see the other's. Adding a third disk planner is a third
  `beginFrame`/`onRow` pair, not a new branch in a shared loop.

### Negative — accepted behaviour change

- **Famous-galaxy thumbnail prefetch now starts ~3× farther out.** The famous-row
  px-exemption (famous galaxies prefetch their thumbnail regardless of the ordinary
  size gate) previously rode the textured planner's tighter 24-px distance bound; it
  now rides the shared walk's looser 8-px bound, so prefetch begins at a greater
  camera distance. With ≤80 famous rows the earlier prefetch is benign-to-better
  (thumbnails are ready sooner; the extra fetches are bounded and small). Pinned by a
  test in
  `tests/services/engine/subsystems/diskPlannerWalk.integration.test.ts` so the
  shift is a recorded expectation, not a silent drift.

### Neutral / forward-looking

- **Shared decimation timing.** Both planners now update the same subset of rows on
  the same frames (one cursor), where before their "which frame updates this row"
  phases were independent. Visually benign: both subsystems keep sticky per-row maps,
  so a row not refreshed this frame retains last frame's decision rather than
  popping.
