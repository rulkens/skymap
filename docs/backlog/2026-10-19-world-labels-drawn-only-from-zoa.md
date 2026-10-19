# World labels are drawn only from inside the zoneOfAvoidance Layer

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`runLabel3DProducers.ts:33` uploads every Layer's `worldLabels` to `label3DRenderer`. Its only draw call is `zoneOfAvoidanceUpsamplePass.ts:21-24` (`postBlit`), behind ZoA's `enabled` gate (line 20). Only ZoA contributes world labels today (`zoneOfAvoidance/layer.ts:43`), so nothing is visibly wrong. A second Layer's world labels would show only while ZoA is composed and its fade is above zero.

## Direction

Either the renderer is ZoA's own (move it into the Layer and drop the core producer walk), or it gets a core pass on its own `FRAME_ORDER` line. The first is smaller if no second producer is planned.
