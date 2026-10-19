# Split `Source` into a string id and per-use dense codes

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

See ADR 0013 (`docs/adrs/0013-source-identity.md`). Readers to migrate: pick decode (`selectionEncoding.ts:54-71` → `composeSelectionRows.ts:30`), the registry key, the asset-slot key (`galaxyCatalogAssetRows.ts:33`), the `galaxyType` switch, and the mask (`maskWith.ts`, `maskHas.ts`, `sourceMaskOf.ts`, `selectors.ts:59-66`, `structureMemberCount.ts:51`). The `source.ts` docblock's claim that codes are persisted in `.bin` was wrong and is fixed (2026-10-19); SKMP records carry no source field.

## Blocked on

ADR 0013's acceptance. The interim guard (`2026-10-19-mask-width-guard.md`) does not wait.
