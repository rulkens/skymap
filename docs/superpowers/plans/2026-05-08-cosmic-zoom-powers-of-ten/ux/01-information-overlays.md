# UX Spec — Information Overlays

The cinematic overlay is the *only* text the user sees during the tour — the bridge from "pretty pixels" to "I know what I'm looking at." This spec describes the **React component** that paints those words on top of the canvas. The renderer-side concerns (in-scene MSDF labels, world-locked annotations) are covered in [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md); this document is the screen-space DOM layer above the WebGPU canvas.

## 1. Overlay role — narrate without dominating

The cosmic zoom is cinema, not a slide deck. Hierarchy:

1. **The universe** (the WebGPU canvas) is the subject.
2. **The overlay text** is the caption — tells you what you're looking at, then gets out of the way.
3. **All other UI chrome** (settings, info card, scale bar) is suppressed during the tour.

The overlay must be *legible against any background the renderer produces*, must *fade away once its information has been transmitted*, and must *never block a feature the user wants to look at*. The product vision's Principle 2 ("zero text below the fold") is the binding constraint: at most three sentences, each at most 20 words, all readable in <8 seconds. If a beat needs more, the [`(i)` affordance](#9-more-info-affordance) opens a side panel — strictly opt-in.

Metaphor: the overlay is the *voiceover subtitle on a documentary*, not the *menu of a video game*.

## 2. Layout — lower-third by default, centered for special moments

Cinema convention places informative chyrons in the **lower third**. The eye reads them naturally without being pulled away from the subject. We adopt this directly.

Two layout modes:

- **`lower-third`** (default for all 9 shell beats). Title and body anchored to the bottom-center, with a ~12vh safe-area bottom margin so a 16:9 video crop doesn't truncate the text. Left-aligned within a 720px max-width block.
- **`centered`** (only the framing beats: `TOUR BEGINS · 90 SECONDS` at `T+0:00` and `TOUR COMPLETE` at `T+1:36`). These are *meta* — they speak about the tour itself, not about a shell. Centering distinguishes "we are talking about the experience" from "we are talking about the universe."

Within either mode the shape is **two lines**:

```
TITLE              — caps, monospace, bold, slightly tracked (letter-spacing: 0.04em)
Body sentence(s).  — sentence case, sans-serif, regular weight
```

The rigid two-line shape gives the reader a stable rhythm across all 11 beats — the *content* changes but the *form* doesn't. Variable-shape overlays would force re-orientation on every shell.

## 3. Typography

Two typefaces, two roles:

- **Title — JetBrains Mono Bold, uppercase, ~22px (clamp 18–28px).** Monospace signals "data readout from a research instrument" — matching the visual identity in the product vision and the in-scene MSDF labels' typographic voice.
- **Body — system sans-serif stack, regular weight, ~17px (clamp 14–20px).** No webfont — copy must appear the instant the tour starts, not after a 200 ms FOIT. We accept the cross-OS aesthetic inconsistency for the latency win.

Viewport-relative sizing:

```css
font-size: clamp(0.875rem, 1.2vw + 0.5rem, 1.25rem); /* body */
font-size: clamp(1.125rem, 1.6vw + 0.6rem, 1.75rem); /* title */
```

Line-height: 1.4 body, 1.1 title. Letter-spacing: `0.04em` on the title (caps-set monospace reads too tight without it), `0` on body.

## 4. Color & contrast

Two viable approaches; both pass WCAG AA contrast for white-on-typical-cosmic-imagery:

| Approach | Pros | Cons |
|---|---|---|
| **A — Transparent background, text-shadow halo** | Maximum minimalism; lets the universe show through; reads as "label" not "panel." | Halo is fragile against bright backgrounds (CMB anisotropy red patches, X-ray glow); text can lose contrast on a frame-by-frame basis as the camera moves. |
| **B — Translucent black panel** (`rgba(0,0,0,0.4)`, `backdrop-filter: blur(8px)`) | Bulletproof contrast everywhere; the panel reads as a "subtitle bar"; the user's eye locks to a stable rectangle. | Steals canvas real estate; on Safari `backdrop-filter` performance can hitch; visually heavier. |

**Decision: Approach A by default, with a programmatic fallback to B when the renderer reports "bright background detected" for the bottom third.** The renderer samples a downscaled luminance of the lower-third region once per beat and posts a `bgLuminance` value to overlay state; above ~0.55 the overlay swaps to panel mode. We already know the offending beats (Sun close-up, X-ray glow, CMB), so this is one number per beat and a single CSS class swap.

Text color: `#ffffff` always. Text-shadow recipe (Approach A):

```css
text-shadow:
  0 1px 2px rgba(0, 0, 0, 0.9),
  0 0 8px rgba(0, 0, 0, 0.6),
  0 0 24px rgba(0, 0, 0, 0.4);
```

A classic triple subtitle halo: tight inner for edge sharpness, medium glow for separation, wide falloff for ambient legibility. One shadow is not enough.

## 5. Per-shell credit line

Each shell has data provenance: Gaia for stars, NASA/JPL for Solar System ephemerides, Planck for the CMB, Cosmicflows-4 for Laniakea. We **must** credit them — for academic honesty and because Principle 1 ("real data first") is a key differentiator.

The credit lives in the **bottom-right corner** in tiny (10–11px) muted-white (`rgba(255,255,255,0.55)`):

```
Stars: ESA / Gaia / DPAC
```

It fades in and out *with* the overlay (same opacity timing) but is anchored bottom-right, so it never collides with the lower-third block. One short line per beat — full acknowledgements live on a separate About / Data page.

## 6. Animation

Only **opacity** transitions. No slide, no scale, no rotation. Reasons: opacity is compositor-cheap, doesn't draw the eye to motion (the *real* motion is the camera), and slide/scale on text says "marketing site" while opacity-only says "broadcast subtitle." We are a broadcast subtitle.

Timing per beat:

```
fade-in:   0.5s  ease-out
hold:      0.8s  (a fast reader has finished by here)
visible:   N s   (per the narrative script's window)
fade-out:  1.0s  ease-in
```

Crossfades are fine — the previous beat can be at 30% fading out while the next is at 70% fading in. The component must therefore support **two simultaneous beats in different opacity states** (see the API section).

## 7. Component API

```ts
export type TourOverlayProps = {
  beat: ShellBeat | null;       // current beat data, or null between beats
  state: TourState;             // 'idle' | 'playing' | 'paused' | 'complete'
  bgLuminance?: number;         // 0..1, optional; renderer-supplied; toggles panel mode above ~0.55
  onMoreInfo?: () => void;      // v2 only; opens side panel; absent in v1
};

export type ShellBeat = {
  id: string;                   // 'shell-3-milky-way'
  layout: 'lower-third' | 'centered';
  title: string;                // 'THE MILKY WAY'
  body: string;                 // single string with \n if needed; component splits on sentence
  credit?: string;              // 'Disk impostor: 2MASS K-band / IPAC'
  visibleFrom: number;          // tour-time seconds, e.g. 25.0
  visibleUntil: number;         // tour-time seconds, e.g. 36.0
};

export type TourState = {
  status: 'idle' | 'playing' | 'paused' | 'complete';
  tourTimeSeconds: number;      // monotonic time since tour start; 0 when idle
  prefersReducedMotion: boolean;
};
```

The component is *purely presentational*. All sequencing, timing, and pause/resume logic lives in the **tour engine** (see [`../implementation/02-tour-engine.md`](../implementation/02-tour-engine.md)). The overlay receives a snapshot and renders it.

The one bit of internal state: **crossfade**. When `props.beat` changes, keep a `previousBeat` in component state, key the inner `<div>`s by `beat.id`, let CSS transitions handle the rest. No animation library required.

## 8. Synchronization with the tour engine

The tour engine ticks every frame, computes `tourTimeSeconds`, picks the current `ShellBeat` from the narrative script, and pushes both into a React context (`TourEngineContext`).

```tsx
const { beat, state } = useTourEngine();
return <TourOverlayPresenter beat={beat} state={state} />;
```

Context is justified because several other components need tour state too (Take the tour / Replay button, cursor-hider, corner-widget dimmer). The engine is a singleton.

CSS handles the animation; React does not re-render every frame. We re-render only when the *beat* changes (a few times per minute), not when `tourTimeSeconds` advances. Memoize the presenter on `beat.id`.

## 9. "More info" affordance

A small **(i)** icon button in the corner opposite the credit (bottom-left), tinted to match. Clicking opens a slide-in side panel with deeper context — for the Local Group beat, a paragraph on M31's blueshift, a list of dwarf members, links to related research.

**Flagged for v2; v1 ships without it.** The reason to mention it now: the layout reserves a 32×32px pad in the bottom-left, and the `TourOverlayProps.onMoreInfo` callback is in the API from day one (always `undefined` in v1). Future-proofing the contract is cheap.

When v2 ships, opening the side panel must **pause the tour engine** automatically — the user is reading, the camera should not keep flying.

## 10. Mobile considerations

Per the product vision's success criterion #4, the tour must run on mobile.

- **Copy reflows.** Max-width clamps to `min(720px, calc(100vw - 32px))`.
- **Smaller font.** Already covered by the `clamp()` ranges — on a 360px screen the body is 14px, title 18px.
- **Safe-area insets.** Bottom margin uses `max(12vh, env(safe-area-inset-bottom) + 16px)` so notch / home-indicator devices don't clip text.
- **Touch target for `(i)` (v2):** minimum 44×44px hit area even if the visible icon is smaller.
- **Centered beats** remain centered; they only appear at start and end so visual conflict with content is brief.

No "compact mode" toggle — sizing is fluid and automatic.

## 11. Accessibility

- **Semantic HTML:** root is `<aside aria-label="Tour narration">` with `role="region"`. Title is `<h2>`; body is `<p>`.
- **`aria-live="polite"`** on the body so screen readers announce each new beat without interrupting current speech.
- **`aria-atomic="true"`** so the entire body is announced as one unit, not word-by-word.
- **`prefers-reduced-motion`:** fades collapse to instant swaps. Text appears at the same wall-clock times — only the fade is removed.
- **Color contrast:** WCAG AA on representative shell backgrounds; panel mode is a guaranteed AAA pass.
- **No keyboard trap.** The overlay has no focusable elements in v1. The v2 (i) button is Tab-reachable with a visible focus ring.

## 12. Test criteria

The overlay component is testable in isolation; the tour engine is mocked.

- **Snapshot/visual:** each `ShellBeat` rendered in Storybook; verify lower-third / centered layouts, typography, credit position, panel swap.
- **Crossfade:** transition between two beats; assert previous beat reaches `opacity: 0` after 1 s, new beat reaches `opacity: 1` after 0.5 s, both are in the DOM during overlap.
- **Reduced motion:** transitions instant; text still appears on time.
- **`aria-live`:** snapshot the announcement region; assert it updates on beat change.
- **Responsive:** at 360 / 768 / 1280 / 1920px the layout doesn't overflow; safe-area insets honored.
- **Bg-luminance swap:** above 0.55, panel mode applied; below, transparent.
- **Idle/complete states:** with `'idle'` and `beat === null`, nothing renders; with `'complete'`, `TOUR COMPLETE` renders centered.

Vitest + Testing Library handles all of these without a real browser. No WebGPU canvas needed — the overlay is pure DOM.

## CSS-in-JS / Tailwind sketch

Using Tailwind utility classes (project already uses Tailwind):

```tsx
<aside
  aria-label="Tour narration"
  role="region"
  className={clsx(
    'pointer-events-none fixed inset-0 z-50 select-none',
    'transition-opacity duration-500',
    state.status === 'playing' || state.status === 'complete'
      ? 'opacity-100'
      : 'opacity-0',
  )}
>
  {/* Beat block — lower-third or centered */}
  <div
    className={clsx(
      'absolute left-1/2 -translate-x-1/2',
      'w-[min(720px,calc(100vw-32px))] text-white',
      beat?.layout === 'centered'
        ? 'top-1/2 -translate-y-1/2 text-center'
        : 'bottom-[max(12vh,calc(env(safe-area-inset-bottom)+16px))] text-left',
      panelMode
        ? 'rounded-md bg-black/40 backdrop-blur-md px-6 py-4'
        : '[text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_0_8px_rgba(0,0,0,0.6),0_0_24px_rgba(0,0,0,0.4)]',
    )}
  >
    <h2
      className="font-mono font-bold uppercase tracking-[0.04em] leading-[1.1]
                 text-[clamp(1.125rem,1.6vw+0.6rem,1.75rem)]"
    >
      {beat?.title}
    </h2>
    <p
      aria-live="polite"
      aria-atomic="true"
      className="mt-2 font-sans leading-[1.4]
                 text-[clamp(0.875rem,1.2vw+0.5rem,1.25rem)]"
    >
      {beat?.body}
    </p>
  </div>

  {/* Credit — bottom-right */}
  {beat?.credit && (
    <div className="absolute bottom-3 right-4 font-mono text-[11px] text-white/55">
      {beat.credit}
    </div>
  )}

  {/* (i) button — v2 only; reserved corner */}
  {/* <button className="absolute bottom-3 left-4 ..." /> */}
</aside>
```

Responsive breakpoints live entirely in the `clamp()` font sizes and the `min()` width — no `md:` / `lg:` classes because the overlay is fluid. Add `motion-reduce:transition-none` to honor reduced-motion preferences.

## 13. Open questions

1. **Clickable credit line?** v1 static; v2 may link to a per-source provenance page. **Recommendation:** static for v1.
2. **Title punctuation.** The script uses both em-dashes (`THE LOCAL GROUP`) and middle-dots (`TOUR BEGINS · 90 SECONDS`). **Recommendation:** allow either; titles are short enough that the mix reads as deliberate.
3. **Resize mid-beat.** Layout must reflow without re-triggering fades. **Recommendation:** key inner blocks by `beat.id`, not viewport.
4. **Disable `backdrop-filter` on Safari?** Historically expensive there. **Recommendation:** keep it; fall back to flat `rgba(0,0,0,0.55)` if profiling shows hitches.
5. **Pause indicator.** When the user hits space, do we show a `‖ PAUSED` badge? **Recommendation:** yes, top-center, 0.3 s fade. Spec'd in the controls UX doc.
6. **Localization slot.** Component accepts already-translated strings; no logic change needed when i18n lands. Confirm worst-case translations (German, Finnish) still fit 720px without ugly wraps.

Defaults are in place so implementation can start without resolving these first.
