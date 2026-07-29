# `uiSlice` reads the URL + localStorage at module load

Surfaced during the 2026-07-29 refactor-ground pass for the URL-hash saga.

## Current state

```ts
// src/state/ui/uiSlice.ts:34-36
import { buildInitialUiState } from './buildInitialUiState';

const initialState: UiState = buildInitialUiState();
```

`buildInitialUiState()` calls `readUrlAtMount()` (`window.location.hash` +
`.search`, `splashStorage.ts:63`) and `readSeenVersion()` (localStorage). Both run at
**module evaluation time**, as a side effect of importing `uiSlice` — which `rootReducer`
does, which `createAppStore` does, which every store test does.

`main.tsx:89` already passes `ui` explicitly via `preloadedState`, so the module-load call
serves only the omitted-`ui` fallback path (tests, and any future non-`main.tsx` store
construction).

## Why it matters now

The URL-hash saga makes `hasDeepLink` derive its intent keys from `HASH_PARAM_SOURCES`
(grill Q2). That means `buildInitialUiState` imports `state/url/hashParamSources.ts`, which
transitively pulls in `selectionSlice`, `settingsSlice`, `timeSlice`, their selectors, and
`services/engine/helpers/buildFocusable`.

Verified 2026-07-28: **no import cycle** — none of those modules import back into
`state/ui/`. But the load-time graph of `uiSlice` widens considerably, and it is now
order-sensitive in a way that would fail loudly and confusingly if a cycle ever were
introduced.

## Options

1. **Make the fallback lazy.** `initialState` becomes a cheap literal; the URL/localStorage
   read happens only in `main.tsx`'s explicit `preloadedState` seed. Tests that want the
   gate ladder call `buildInitialUiState()` themselves. Smallest change; removes the
   import-time side effect entirely.
2. **Leave it, document the constraint.** A docblock on `uiSlice` saying its module load
   performs boot I/O and must not gain a cycle. Zero code change, keeps the hazard.

Option 1 is preferred, but it changes what an omitted-`ui` store looks like in tests —
grep `createAppStore(` call sites that omit `ui` and check whether any depend on the splash
gate having run.
