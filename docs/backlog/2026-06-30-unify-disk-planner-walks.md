# Unify the two disk-planner catalog walks

**Status:** ready (prerequisite pure-helper refactor shipped; this is the perf-bearing follow-on)
**Area:** Rendering
**Surfaced:** 2026-06-30, from a disk-subsystem decomplection pass + a frame profile.

## Problem

`proceduralDiskSubsystem` (LOD-1) and `texturedDiskSubsystem` (LOD-2) each walk
every visible catalog every frame, with their own per-source stride cursor. For
each row both planners independently:

- read the row's position (`positions[i3..]`),
- compute `camDistSq = dx²+dy²+dz²` and early-out against a px-threshold bound,
- `Math.sqrt` it,
- compute apparent size `px`.

That per-row geometry is computed **twice** — once per planner — and it's the
dominant per-row cost (the bodies differ, but the walk skeleton is identical).

### Measured cost (M1 Max, 2026-06-30)

```
runFrame            5.1 ms
  proceduralDisk    1.6 ms
  texturedDisk      2.6 ms   → the two planners are ~82% of frame CPU
```

## Why it's like this

The `2026-05-28-procedural-disk-fade-out-design.md` spec deliberately chose
**two separate walks**, on the stated premise that "per-row cost is dominated by
the squared-distance compare which neither planner can make cheaper." A single
shared walk disproves exactly that premise: computed once, the distance/position
work halves. The spec also feared a shared walk would be "an outer loop wrapping
two independent inner bodies — recreating the kitchen-sink concern the split
exists to eliminate" — but injecting two _named_ row-reducers into one walk is
strategy-pattern, not interleaved branches; the bodies stay separate functions.

## Un-braided shape

One shared catalog walk that owns concern #1 (source iteration, stride
decimation, per-source sticky maps, collect, back-to-front sort) and computes
each row's geometry once, handing `(source, i, x, y, z, camDist, px)` to two
injected row-reducers — the procedural body and the textured body — each owning
its own sticky map, output array, and extra surface (the textured layer keeps
its atlas-evict / `hasInFlightWork` / `setHiResFamous` surface; procedural stays
lean). The two subsystems are NOT merged into one; only the walk is shared.

Sketch:

```ts
type DiskRow = {
  source: SourceType;
  i: number;
  x: number;
  y: number;
  z: number;
  camDist: number;
  px: number;
};

function walkDiskRows(input, opts: { minPx: number }, visit: (row: DiskRow) => void): void {
  const maxCamDistSq = maxVisibleCamDistSq(opts.minPx, input.pxPerRad);
  for (const [source, cloud] of input.catalogs) {
    if (!visible(source)) {
      /* clear sticky for both */ continue;
    }
    const { safeStart, end, nextStart } = strideWindow(cloud.count, decim, cursor.get(source) ?? 0);
    for (let i = safeStart; i < end; i++) {
      // read pos, camDistSq early-out, sqrt ONCE, px ONCE
      if (px > opts.minPx) visit({ source, i, x, y, z, camDist, px });
    }
    cursor.set(source, nextStart);
  }
}
```

Care points:

- The merged walk must use the **looser** px-threshold bound (procedural's 8, not
  textured's 24) so it doesn't skip rows the procedural body needs; the textured
  body re-applies its own ≥24 gate and returns null below it.
- The unified walk shares **one stride cursor**, so both bodies see the same
  decimation window each frame (today the cursors are independent). This changes
  _which frame_ each galaxy's disk updates, not correctness (sticky maps keep the
  last value) — likely visually identical or more coherent. Verify on the dev
  server.
- The `visit` callback must not allocate per row (close over frame state once);
  keep it monomorphic per subsystem so V8 doesn't deopt the hot call site.

## Prerequisite (shipped)

The pure leaf helpers this needs already live in `src/utils/render/disk/`
(`apparentSizePxAtDistance`, `maxVisibleCamDistSq`, `diskQuadExtentMpc`,
`strideWindow`, `purgeStrideWindow`, `byDistanceToCamera`, plus the textured-only
`resolveDiskPlacement` / `hiResLayerFold` / `loadFadeAlpha`), and both planners
already call them. That refactor was the behaviour-neutral groundwork; this item
is the perf-bearing merge on top.

## Definition of done

- One shared walk; `camDistSq`/`sqrt`/position-read computed once per row.
- Before/after frame profile against the 4.2 ms baseline above.
- `2026-05-28-procedural-disk-fade-out-design.md` updated (or an ADR added)
  recording that the two-walks premise was superseded.
- Visual parity confirmed on the dev server (crossfades, sticky behaviour).
