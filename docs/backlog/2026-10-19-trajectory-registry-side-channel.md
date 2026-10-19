# `trajectoryRegistry` is a module-level Layer-to-core side channel

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`src/services/bodies/trajectoryRegistry.ts:11-12` is a module-level `Map` with a version counter. `missions/sagas/loadSpacecraftTracksSaga.ts` and `missions/create.ts` write it; core's `deriveBodyStates.ts` reads it; `destroy()` never clears it. Other module-level mutable state: `deriveBodyStates.ts:44`, `produceSceneBodyCaptions.ts:32-51`, `loading/dataManifest.ts:12-13`, `camera/orientDeltas.ts:34`, `runFrame.ts:71`, `planStarChunks.ts:34-43`, `starCatalog/present/produceStarCaptions.ts:36-37`. A second engine instance or an HMR re-create shares them.

## Direction

The trajectory registry becomes per-engine state behind a `LayerCoreDeps` capability (`trajectories.publish(...)`) or a Layer fact. Caches reset in `destroy`. A conventions test over `src/services` and `src/layers` bans top-level `let` outside an allow-list that only shrinks.
