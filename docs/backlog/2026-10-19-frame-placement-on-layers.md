# Frame placement: core keeps the steps, Layers pin their passes

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

See `docs/research/2026-10-16-central-frame-table.md` §2 and §4 and ADR 0014 (`docs/adrs/0014-frame-placement-on-layers.md`). Adding a Layer is a core commit; four intra-roster constraints between Layers exist only as prose; a Layer target still needs a core line.

## Blocked on

ADR 0014's acceptance, decided together with the dependency DAG item (`2026-10-11-layer-dependency-dag.md`) because `after:` edges are the first explicit inter-Layer reference.

## Plan shape once ruled

Behaviour-neutral ladder: ids on today's lines; optional `step` on `ContentPass`; one Layer per PR; delete the names from the table last. `frameOrderBoot.test.ts` is the gate.
