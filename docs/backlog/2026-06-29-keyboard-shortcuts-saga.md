# Migrate global shortcuts to the saga keyboard pattern

> **Backlog item** · `needs-design` · area: UI & UX
> **Promote to:** a spec when picked up. Aligns with ADR 0007 (sagas drive intent).

## Problem

The tour keys (`→`/`←`/`Space`) already route through `watchTourKeyboardSaga` + `createKeyboardListener` (a `hotkeys-js` `eventChannel`), bracketed by the tour lifecycle. The rest of the global shortcuts still live in a React hook. Migrate them to a single declarative `KeyboardShortcutsInfo` map (`{ action, filter?, args? }`) + a shared `watchKeyboardEventsSaga` (the [repperjs](file:///Users/rulkens/Development/js/repperjs) `watchKeyboardEventsSaga` pattern).

## Current state (verified 2026-06-29)

The non-tour shortcuts (`Cmd+K`, `/`, `Esc`→clearSelection+exitTour, `f`, `h`, `l`, `Tab`, `d`) still live in `src/hooks/useKeyboardShortcuts.ts` — a `window.addEventListener('keydown')` + if-chain (lines 46-145), consumed by `App.tsx`. The saga keyboard infrastructure (`createKeyboardListener.ts` → `watchTourKeyboardSaga.ts`) is used **only** by the tour. There is no `KeyboardShortcutsInfo` map and no `watchKeyboardEventsSaga` (neither symbol exists yet).

## Wrinkles to design around

- Engine-method keys (`h`→`focusHome`, `l`→`logState`) need a `reconcile` effect or a camera intent.
- Conditional `preventDefault` (`/` only when the palette is closed) needs hotkeys scopes or a synchronous state read.
