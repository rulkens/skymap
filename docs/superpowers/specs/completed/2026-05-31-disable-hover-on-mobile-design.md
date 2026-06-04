# Disable hover on mobile (touch) — design

**Date:** 2026-05-31
**Status:** Approved, awaiting implementation plan

## Problem

On touch devices (iOS, Android, and any touchscreen) a finger tap emits a
synthetic `pointermove`, which drives the engine's throttled hover-pick. The
result is a hover/InfoCard interaction on tap that makes no sense without a
real pointer — touch has no "hover" state to begin with. We want hover
suppressed for touch input while keeping tap-to-select and touch camera
controls intact.

## Approach: gate hover on `pointerType`

The hover pipeline is:

```
canvas 'pointermove'  →  onPointerMove(cssPx)  →  state.picking.latestMouseCss
                                                       │
                                                       ▼
                                   throttled hover-pick in runFrame.ts
```

The single seam that feeds hover is the `pointermove` handler in
`src/services/engine/interaction/inputBindings.ts`. We gate it on the moving
pointer being a mouse:

```js
addCanvasListener('pointermove', (e) => {
  const pe = e as PointerEvent;
  // Touch/pen don't hover — only a mouse drives the hover-pick. Per-event,
  // so a hybrid device (touchscreen laptop, iPad + trackpad) still gets hover
  // from its mouse and never from a finger.
  if (pe.pointerType !== 'mouse') return;
  onPointerMove({ x: pe.clientX, y: pe.clientY });
  scheduler.requestRender();
});
```

### Why `pointerType`, not user-agent / media-query detection

- It tests the actual cause (input is a finger), not a proxy (OS is iOS).
- Per-event, so hybrid devices work correctly: hover when a mouse moves,
  no hover when a finger taps, on the same device, with no detection state.
- No UA sniffing — UA strings lie, get spoofed, and iPadOS reports as
  desktop Safari. `pointer: coarse` describes the device's *primary* pointer,
  not the pointer currently moving, so it mis-handles hybrids too.

### Accepted behavioral consequence

This also suppresses hover for `pointerType: 'pen'` and for a finger on a
desktop touchscreen — which is the desired behavior (neither should hover).
It is intentionally broader than "iOS and Android only."

## What does NOT change

- **Tap-to-select:** runs through orbit-controls' `onClick` (pointerup within
  4 CSS px), a separate path. Tapping a galaxy on mobile still opens the
  InfoCard.
- **Touch camera orbit/pan:** handled by `orbitControls.ts`'s own `pointermove`
  listener on `window`, untouched by this change.
- **No `requestRender` on skipped touch moves:** correct — this handler exists
  only to feed the hover-pick. A skipped touch move shouldn't wake the loop for
  a hover that resolves to nothing.

## Testing

`tests/services/engine/interaction/inputBindings.test.ts`:

- Update existing `pointermove` / `destroy` cases to fire
  `{ pointerType: 'mouse', clientX, clientY }`.
- Add: `pointermove` with `pointerType: 'touch'` does not call `onPointerMove`
  and does not call `scheduler.requestRender`.
- Add: same assertion for `pointerType: 'pen'`.

## Files touched

- `src/services/engine/interaction/inputBindings.ts` — the gate.
- `tests/services/engine/interaction/inputBindings.test.ts` — tests.
