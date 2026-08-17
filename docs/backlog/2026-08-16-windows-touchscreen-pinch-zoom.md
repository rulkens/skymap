# Windows touchscreen pinch-zoom dead

**Status:** needs-repro · low priority
**Reported:** 2026-08-16, single user report — Windows machine with a touch screen, pinch-to-zoom does nothing. Verified working on mobile (iOS/Android).

## Verified current state (2026-08-16 trace)

The gesture code is platform-uniform — there is no Windows-specific branch to be wrong:

- Pinch is implemented once, PointerEvent-only, in `src/services/camera/orbitControls.ts`: two `pointerdown`s on the canvas promote `dragMode` to `'pinch'` (line 260); `onMove` zooms from the finger-distance ratio (lines 348–369). No TouchEvent listener exists anywhere in `src/` (grep: zero hits for `touchstart`/`gesturestart`).
- No UA sniffing, `maxTouchPoints`, or media-query gating of the handlers. `useIsMobile`/`useInitialMobile` are viewport-width checks used only for UI layout, never by input code.
- No `setPointerCapture` (deliberately removed for an iOS WebKit bug — module header, `orbitControls.ts:27-46`).
- Single wiring point: `attachOrbitControls` called once from `src/services/engine/phases/wireInput.ts:325`. The hover-pick bindings (`inputBindings.ts`) don't touch drag state.
- The app's **only** defense against native browser pinch-zoom is `#c { touch-action: none; }` (`src/styles/global.css:385-390`) — nothing on `html`/`body`, no `user-scalable=no` in the viewport meta (`index.html:14`).
- `onWheel` (`orbitControls.ts:484-531`) `preventDefault`s unconditionally and reads `e.deltaY` raw — no `ctrlKey` (trackpad-pinch convention) or `deltaMode` handling.

## Hypotheses, ranked

1. **Browser/OS consumes the gesture before JS sees it.** Desktop Chromium treats touchscreen pinch as browser zoom unless `touch-action` suppresses it; the single per-element declaration with no backup is a known-flaky pattern under Windows' Direct Manipulation layer. Telling detail: if Windows delivered the pinch as `ctrl`+`wheel` instead, `onWheel` would zoom — "nothing happens" suggests the second finger's pointer events never arrive.
2. **Second finger lands on UI chrome.** On viewports ≥768px (`useInitialMobile.ts:11`) NavigationPanel + SettingsPanel default **open**, fixed bottom-left, ~300px wide, above the canvas, no `touch-action` override. A finger on a panel never enters `activePointers`; gesture silently stays single-finger orbit. Mobile defaults them closed — structural reason it works there.
3. (low) Windows two-finger-tap→right-click reclassification, or a spurious mouse-typed `pointerdown` tripping the state clear at `orbitControls.ts:214-219`.

## Decisive diagnostic (blocks everything else)

Get from the reporting user: (a) does one-finger orbit work on that machine? (b) where on screen did they pinch? (c) this console snippet's output during a pinch:

```js
['pointerdown','pointerup','pointercancel','wheel'].forEach(t =>
  window.addEventListener(t, e => console.log(t, e.pointerType ?? '', e.pointerId ?? '', e.ctrlKey ? 'ctrl' : '', e.target.id || e.target.tagName), true));
```

Two touch `pointerdown`s with distinct ids targeting `c` → code bug after all; one or zero → delivery problem, and the fix is defense-in-depth: `touch-action: none` on `html, body`, plus explicit `ctrlKey`/`deltaMode` handling in `onWheel` as a fallback zoom path.
