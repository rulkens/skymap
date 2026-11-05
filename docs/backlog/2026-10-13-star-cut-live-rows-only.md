# The star cut sweeps every row of the pool

**Readiness:** `needs-design`. **Surfaced:** 2026-10-12, phone GPU pass on #885.

## Problem

The phone Earth pose still runs ~1.3 ms behind main (star-aggregates +1.5, star-catalog +0.5, star-cut-compute
-0.3 mid-drag). The cut dispatch covers the whole pool, most of it padding at some poses (chunkNodeCap against
the median chunk).

## Options

1. Sweep only the live rows (the per-slot live-row table already exists).
2. Skip the cut when the cut inputs and the residency are unchanged since the last one.

## Trap

Mac `star-cut-compute` does not measure dispatch work: a build that never dispatched still read 0.39 ms on the Mac
while the phone read 0.0 ms. Measure on the phone.
