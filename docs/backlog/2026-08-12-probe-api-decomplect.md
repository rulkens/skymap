# Decomplect the galaxy tool's probe/debug API surface

**Area:** tools/galaxy-renderer · **Readiness:** ready · **Origin:** gpu-side-v2-placement final review (PR #547)

## Problem

The debug/probe surface now outnumbers the production surface on the engine
handle: `GalaxyEngineHandle` carries ~14 `request*` methods (over half its
members), and `GalaxyModel` carries 9. Every one has exactly one caller —
`probeGpuErrors.ts` — yet each is declared three times: on the `GalaxyModel`
type, again on `GalaxyEngineHandle.d.ts` (with duplicated doc comments), and
wired as a one-line passthrough in `createGalaxyEngine.ts` (~lines 1143-1244).
Production API and probe API are braided into one type; "no production
caller" is enforced by per-method comments, not structure.

## Design sketch (from the review conversation)

1. **One `probe` sub-object.** Model builds `probe: GalaxyProbeApi` once;
   engine exposes it by reference (`handle.probe`). Kills the passthroughs
   and the triple doc duplication; production code simply never touches
   `.probe`, so the separation is structural. Handle drops to ~15 members,
   all production.
2. **One generic slot-range peek.** The four `request<Tier>BufferPeek`
   bodies are clones parameterized on (buffer, offset, count, scratch
   buffer): replace with `peekRecords(buffer: 'field' | 'hii', offset,
   count)` plus ONE shared MAP_READ scratch buffer sized at the max of the
   four tier maxes (replaces `dustPeekBuffer`/`armCloudPeekBuffer`/
   `spurCloudPeekBuffer`/`digVeilPeekBuffer`). The probe already reaches
   every offset/count it needs via `fieldCounts`, the reservations, and
   `hiiSegments`. This is the 4-way table-dispatch case
   (`feedback_tagged_union_table_dispatch`).
3. **Leave the four placement readbacks as distinct methods** (inside
   `probe`): their return shapes genuinely differ (dust: `mass`+
   `renormScale`; arm/spur: `flux`+`fluxWeight`+`renormScale`; DIG:
   `amplitudeBase`, no renorm) and the asymmetry mirrors which renorm
   pipeline each tier has — essential, not accidental.

## Constraints

- Peek-vs-readback semantics are load-bearing, not redundancy: readback
  re-dispatches fresh (validates the kernel), peek copies the LIVE buffer
  (validates that `ensureFresh()`'s keyed rebuilds refilled slots the last
  repack zeroed — a fresh dispatch cannot see that bug class; Task 14's
  vanish bug). Any consolidation must preserve both reads.
- `probeGpuErrors.ts` is the only automated gate reaching this code — the
  refactor rewrites its call sites; run the full probe before/after
  (edit → probe → read sequencing, never edit mid-probe).
- Mechanical but wide; sequence AFTER PR #547 merges.
