# Version the URL hash and add an id-alias table

**Readiness:** `awaiting-decision`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

Focus-id encoding exists in `urlHashFor.ts:25-52` and in each Layer row's `focusId.encode` (the existing `URL_HASH_FOR` line, now `ready`). `hasDeepLink.ts:49-63` answers by key presence while `linkIntentFrom.ts:11-20` parses values, so `#t=junk` hides the splash and lands home. The URL is read three times at boot (`buildInitialUiState.ts:38`, `ArrivalVeilContainer.tsx:20`, `watchHashReadSaga.ts:120`). `hashBodyFor` composes only table rows, so unknown keys vanish on the next write. `decodeFramedPose.ts:21,38,53` decodes by field count. `navigateSaga.ts:156,169,174` returns `UNKNOWN_ID` for a renamed exhibit, tour, clip or famous id. `pose` is read-only (`hashParamSources.ts:264-265`), so the arrival's replace-write strips it on reload.

## Blocked on

ADR 0015 (`docs/adrs/0015-data-contracts.md`) §4. The `URL_HASH_FOR` deletion and deriving `hasDeepLink` from `linkIntentFrom` do not need the ADR.
