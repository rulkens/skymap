# Plan rows make the frame table composition-specific

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`checkFrameOrder.ts:116-120` throws when a plan row names an unregistered planner and `runPlanSteps.ts` throws again per frame, while a pass or compute name no Layer contributed is simply dropped (`resolvePassNames`). All five planners in the table are Layer-owned. The boot test has to stub them (`frameOrderBoot.test.ts`, `stubPlannersFor`), and the reference engine the layer-composition spec describes (§7) cannot reuse the sections.

## Direction

Treat a missing planner like a missing pass: skip the row. Keep the scope-mismatch and lead-the-section rules. Delete `stubPlannersFor`.
