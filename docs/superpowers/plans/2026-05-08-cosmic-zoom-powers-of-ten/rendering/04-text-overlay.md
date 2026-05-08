# Text Overlay — Rendering Spec

**Status:** Draft (2026-05-08)
**Owner:** @rulkens
**Depends on:** [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md), [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md), [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md)
**Sibling specs:** [`00-scale-architecture.md`](00-scale-architecture.md)

## 1. Goal

Text in the cosmic zoom exists to **serve the narrative**, not to compete with the visuals. Every textual element — a star's name, a shell's headline, a sub-paragraph of prose — is there because the user, in that moment, needs a word to *anchor* what they are seeing. The ROSAT halo around Virgo is "a red glow" until the overlay says *intracluster gas, 30 million degrees*; only then does it become a fact.

The overlay system is therefore evaluated by two questions:

1. **Does the text appear at the moment the visual reveal needs naming?** A label that fades in 800 ms after M87 dominates the frame is right; one that fades in five seconds late is meaningless.
2. **Does the text get out of the way the rest of the time?** The user came for the universe, not a HUD. Static UI chrome (panels, buttons, scale bar) is dimmed to ~50% during the tour (per [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)); the cinematic overlay itself uses opacity-only animation (no slide, no zoom) so the eye is not pulled away from the canvas.

This spec is the design for *how text shows up* during the cosmic zoom. It does **not** redesign the underlying MSDF label renderer — that already exists, per [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md). It only describes how the cosmic-zoom feature *uses* it, and how the second (DOM) text layer co-exists with it.

## 2. Two-layer model: MSDF (world) + DOM (cinematic)

Two text systems are used in the cosmic zoom, with strict separation of duties:

| Concern | MSDF (world-anchored) | DOM (cinematic overlay) |
|---|---|---|
| Lives in | `<canvas>` (WebGPU) | `<div>` over the canvas |
| Anchored to | A 3D world position | Viewport (CSS) |
| Typical content | `M87`, `Sun`, `Virgo`, `★ Sirius` | *"OUR SOLAR SYSTEM — Eight planets around one star..."* |
| Length | 1–3 tokens, monospace | One short headline + 1–2 sentences |
| Typography | JetBrains Mono (atlas-baked) | System sans stack, regular weight |
| Animates with | Camera (parallax, zoom-clamp) | CSS opacity transitions only |
| Z-order | Inside the WebGPU pass stack, before tonemap | Above the canvas in the React tree |

**Why two systems and not one?** Because their requirements *diverge cleanly*:

- World-anchored labels must reproject every frame as the camera moves — they live and die by their parallax. They *must* be in the same coordinate system as the geometry they annotate, which means they *must* be GPU-side. They're also short, ASCII-tight tokens for which an MSDF atlas is a perfect fit.
- Cinematic overlays are multi-line prose with mixed weights, a headline, body copy, and (eventually) a corner mark like *"PRESS SPACE TO PAUSE"*. Reproducing rich CSS typography (line-height, ligatures, kerning, accessibility, text selection) inside an MSDF atlas would be a three-month detour for zero visual upside. They also never need to track a 3D position — they're always somewhere on screen, with the canvas as their backdrop. Plain DOM is the obviously-right tool.

We keep the two layers fully independent. They share only the **timing source** (the tour clock — see [`02-camera-choreography.md`](02-camera-choreography.md)) and the **visual style guide** (color palette, fade durations). Neither layer knows the other exists.

## 3. World-anchored MSDF labels

The renderer is the existing `LabelRenderer` (per [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md)). The cosmic zoom's contribution is a **per-shell label set** and a **shell-driven gating function**.

### Per-shell label sets

Each shell declares its own `Label[]` in a single file `src/services/tour/shellLabels.ts`. The labels are flat arrays of the existing `Label` type from the labels spec. For example:

```ts
// src/services/tour/shellLabels.ts
export type ShellLabelSet = {
  shell: ShellId;
  labels: Label[];
};

export const shellLabelSets: ShellLabelSet[] = [
  {
    shell: 'solar-system',
    labels: [
      { id: 'sun', worldPos: [0, 0, 0], text: 'Sun', pixelSize: 18, ... },
      { id: 'earth', worldPos: [...], text: 'Earth', pixelSize: 14, ... },
      // ...
    ],
  },
  {
    shell: 'stellar-neighborhood',
    labels: [
      { id: 'sirius', worldPos: [...], text: '★ Sirius', pixelSize: 16, ... },
      { id: 'procyon', worldPos: [...], text: '★ Procyon', pixelSize: 16, ... },
      // ...
    ],
  },
  // ... one entry per shell
];
```

The label data is small enough (~100 labels total across all shells) to live in source rather than a fetched JSON. Keeping it in TS gives compile-time sanity: typos in `text`, missing `worldPos`, etc. are caught before runtime.

### Fade gates by camera distance

A label like "M87" should *not* appear during the Cosmic Web shell — at that camera distance M87 is sub-pixel and the label would just be visual clutter. Each label gets `fadeNearMpc` and `fadeFarMpc` set to match the shell's outer-boundary distances from [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md). The existing distance-fade machinery in `labelRenderer.ts` (the fragment-shader `fadeAlpha = smoothstep(...)`) already does this work — we just have to fill in the values.

For labels that should be visible *only* in shell N, the natural pattern is:

```ts
fadeNearMpc: shellNearBoundary(shell),
fadeFarMpc:  shellFarBoundary(shell),
```

with a small overlap band so two adjacent shells' labels crossfade smoothly across the boundary rather than popping. The overlap matches the same crossfade band defined in [`01-shell-transitions.md`](01-shell-transitions.md).

### Active-set publishing

The engine's per-frame setup picks the **current shell** from camera distance (per [`00-scale-architecture.md`](00-scale-architecture.md)) and the **adjacent shells** (one inside, one outside), unions their label sets, and calls `labelRenderer.setLabels(union)` whenever the active shell or its neighbors change. Within a shell the active set is *stable* — `setLabels` is not called per frame, only when the camera crosses a shell boundary. Per the labels spec, `setLabels` rebuilds the vertex buffer, so calling it per frame would be wasteful; calling it once per shell crossing is fine.

The actual fade math (alpha 0 → 1 → 0 across a label's `fadeNear`/`fadeFar` window) happens in the fragment shader against the camera position uniform, so labels visibly appear and disappear *continuously* as the camera moves, even though the label *array* on the CPU is changing only at boundaries.

## 4. Cinematic overlay — React component design

The cinematic overlay is a single React component, `<TourOverlay />`, mounted once in the App component tree (alongside the `<Canvas />`) and active only while the tour is running. It owns no canvas access; it only reads from the shared tour state.

### Component shape

```tsx
// src/components/TourOverlay/TourOverlay.tsx
export type TourOverlayProps = {
  beat: ShellBeat | null;   // null = no overlay should render
  visible: boolean;          // tour is active and beat copy should be shown
  position: 'lower-third' | 'centered'; // see "positioning rules" below
};

export function TourOverlay({ beat, visible, position }: TourOverlayProps) {
  // ...
}
```

The component:

1. Renders a fixed-position `<div>` overlay above the canvas.
2. Reads `beat.headline` and `beat.body` (strings from `tour/script.ts`).
3. Toggles a CSS class for visibility — the actual fade happens via a CSS `transition: opacity 0.8s ease-out`, with `opacity: 0` and `opacity: 1` driven by the `visible` prop.
4. Sets `aria-live="polite"` on the body container so screen readers get the new copy without it interrupting other speech.

The component is *intentionally* dumb. All the timing logic lives upstream — the tour state machine (covered in [`02-camera-choreography.md`](02-camera-choreography.md)) decides which `beat` is current and whether `visible` should be true. The overlay component is a pure render of those props.

### CSS transitions

Keep them simple and short:

```css
/* src/components/TourOverlay/TourOverlay.module.css */
.overlay {
  position: fixed;
  pointer-events: none; /* never blocks canvas drag/scroll */
  opacity: 0;
  transition: opacity 0.8s ease-out;
}
.overlay.visible {
  opacity: 1;
}
.overlay.lowerThird {
  bottom: 8vh;
  left: 6vw;
  right: 6vw;
}
.overlay.centered {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.headline { /* ... */ }
.body { /* ... */ }
```

No `transform: translateY(...)`, no scale, no slide-in. Opacity only. Per Principle 9 (Animation feel) below, we want the text to *be there* rather than to *call attention to itself*.

### Positioning rules

Two positions only:

- **Lower-third (default).** Used for every shell narration beat (Shells 1–9). Text sits in the lower-left third of the viewport, leaving the upper two-thirds — where the visual reveal lives — completely unobstructed. The visual content of every shell is composed assuming the lower-third may have a panel of text over it.
- **Centered.** Used only for the framing beats: `TOUR BEGINS` and `TOUR COMPLETE`. These are not about the visuals; they are conversational moments — the tour acknowledging itself. Center positioning matches their ceremonial role.

Position is a property of the beat in `tour/script.ts`, so the script author makes the call rather than the component guessing.

## 5. Typography

Two type stacks, mapped one-to-one with the two layers:

- **MSDF / world labels: JetBrains Mono.** Already specified by [`../../../specs/2026-05-07-msdf-labels-design.md`](../../../specs/2026-05-07-msdf-labels-design.md). Monospace conveys "data readout" — the right voice for `M87`, `★ Sirius`, `4.6 Gyr`. Font is baked into the MSDF atlas at build time; not a CSS choice.

- **DOM / cinematic prose: a system sans-serif stack.** Specifically:

  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
               "Helvetica Neue", Arial, sans-serif;
  ```

  Why system sans? Because (a) the cinematic copy is *prose*, and serif/mono both read worse than sans for prose at this size; (b) system fonts incur zero network cost — they're already on the user's device, no FOIT or layout shift; (c) the cosmic zoom is platform-agnostic, and the system stack gracefully adapts to whatever the user's OS thinks "good UI text" looks like.

  Sizes:

  ```css
  .headline {
    font-size: clamp(1.4rem, 2.4vw, 2.2rem);
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .body {
    font-size: clamp(1.0rem, 1.4vw, 1.4rem);
    font-weight: 400;
    line-height: 1.4;
    max-width: 60ch;
  }
  ```

  `clamp()` so the overlay scales sensibly from a phone-shaped viewport to a 4K desktop without conditional logic.

The two stacks intentionally *contrast*. The user perceives "data" (mono, atlas) and "prose" (sans, DOM) as different categories, which reinforces the spec's two-layer model at the visual level.

## 6. Per-shell overlay copy management

Copy is the single most-edited piece of the cosmic zoom. The script will be rewritten dozens of times during refinement. So we keep it in **one file**, owned by the script author, with no JSON indirection or fetch:

```ts
// src/services/tour/script.ts
export type ShellBeat = {
  id: ShellId;
  startSec: number;
  endSec: number;
  headline: string;
  body: string;
  position: 'lower-third' | 'centered';
  fadeInSec: number;   // typically 0.8
  holdUntilSec: number; // beat copy is visible from fadeInSec until holdUntilSec
};

export const tourScript: ShellBeat[] = [
  {
    id: 'tour-begins',
    startSec: 0.0, endSec: 5.0,
    headline: 'TOUR BEGINS · 90 SECONDS',
    body: 'Press space to pause · esc to exit',
    position: 'centered',
    fadeInSec: 1.0, holdUntilSec: 4.0,
  },
  // ...one entry per beat from the narrative script
];
```

The `<TourOverlay />` consumes this array indirectly: a small `useTourBeat(currentSec)` hook returns the current `ShellBeat` (or null between beats). Hook is pure, easy to unit-test, and decouples the React tree from the tour clock.

Copy edits are pure source edits — no rebuild step, no asset pipeline, no CMS. This matches the spirit of how `famous.json` evolves in skymap today: human-readable, source-of-truth in the repo.

## 7. Timing

Per the narrative script ([`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)), each shell's overlay obeys the same timing pattern:

- Camera enters shell at `T_enter`.
- Overlay begins fading **in** at `T_enter + 0.5s` to `T_enter + 1.0s` — the eye should land on the visual reveal *before* the text appears, so the visual is the first impression and the text is the explanation.
- Overlay holds at `opacity: 1` for the bulk of the shell.
- Overlay begins fading **out** at `T_exit - 1.0s`, so it has fully cleared by the time the next shell's transition begins.

The fade-in delay is what gives the tour its cinematic quality. Without it, the user reads the text first and the visual feels like an illustration of the words. With it, the user sees the visual, recognizes it, then reads the text and feels *confirmed*.

Fade duration is **0.8 s** for both in and out — slow enough to feel intentional, fast enough not to drag. This matches the CSS transition above. Outside transitions, opacity is held flat (no breathing, no pulse — see Principle 9).

## 8. Accessibility

Cinematic overlays are **real DOM**, with semantic structure (`<h2>` for headline, `<p>` for body) and appropriate `aria-live="polite"` so screen readers announce new beat copy when it appears, without interrupting any speech in progress. This is the largest concrete benefit of keeping cinematic text in DOM rather than the canvas.

MSDF world-labels are *not* in the DOM and *cannot* be announced by a screen reader. This is acceptable because:

- The information they carry (proper nouns of celestial bodies) is repeated in the cinematic overlay copy or the InfoCard ("OUR SOLAR SYSTEM — eight planets around one star").
- Fully accessible labels would require a parallel offscreen DOM mirror, which is non-trivial scope and not blocking the cosmic zoom feature.
- A future "label inspector" panel (a list of currently-visible labels, with `aria-live` updates) is the cleanest accessibility extension; out of scope here.

For users with reduced-motion preferences (`prefers-reduced-motion: reduce`), we **shorten** the fade transitions to 0.1s rather than disabling them. A hard pop is more jarring than an 800 ms fade; a 100 ms fade is essentially imperceptible while still smoothing the on/off.

```css
@media (prefers-reduced-motion: reduce) {
  .overlay { transition-duration: 0.1s; }
}
```

## 9. Animation feel

The overlay is **opacity-only**. No slide-in, no zoom, no scale, no blur, no fancy character-by-character typewriter reveal. The text just **is there**.

This is a deliberate aesthetic choice. Sliding text says *"look at the text!"*; opacity-fading text says *"there is some text now."* The cosmic zoom's premise is that the user is looking at the universe; the text is a quiet voice naming what they see. The voice should not perform.

The same principle applies to the MSDF labels: they fade with distance via the existing `fadeAlpha`, but they don't bounce, they don't grow on hover, they don't flash on initial visibility. They appear, they hold, they leave.

The explicit non-goals here are worth listing:

- No typewriter reveal (it competes with the cinematic and is slow).
- No drop shadow on the cinematic copy. (A subtle text shadow `0 1px 2px rgba(0,0,0,0.6)` is allowed for legibility against bright backgrounds — see open question.)
- No gradient text or other "neon UI" treatments.
- No pulsing on the headline.

## 10. Coordination with the MSDF labels architecture

This spec **does not modify** the labels spec. It assumes the labels spec is implemented as written and consumes it as a black box via these touchpoints:

- `LabelRenderer` is constructed once by the engine at init.
- The cosmic zoom's per-shell controller calls `labelRenderer.setLabels(union)` whenever the active label union changes (shell boundary crossing, tour start/stop).
- Distance fades on individual labels are configured via `fadeNearMpc` / `fadeFarMpc` per the labels spec; the cosmic zoom adds shell-aware values, not new fade machinery.
- The labels' coordinate frame is the **shell-relative frame** of the shell that owns them — this requires the cosmic zoom's scale architecture (see [`00-scale-architecture.md`](00-scale-architecture.md)) to translate `worldPos` from the shell's native unit into the renderer's expected Mpc-relative coordinate before calling `setLabels`. The translation lives in the per-shell controller, not in the label renderer.

If, during implementation, we discover the labels spec needs an extension (e.g., per-shell sublayers, or batched fade groups), that change goes back into the labels spec itself, not here.

## 11. Coordination with the React UI shell

The `<TourOverlay />` mounts inside `src/components/App/App.tsx`, sibling to the existing `<InfoCard />`, `<SettingsPanel />`, `<ScaleBar />`, `<StatusBar />`, etc. While the tour is active:

- The existing UI components fade to ~50% opacity (a class toggle on the App root, driven by `tourState.isActive`).
- `<TourOverlay />` mounts at z-index above the canvas but below modal dialogs (e.g., the `<CommandPalette />`), so the user can still hit `cmd-k` and have it float above the overlay.
- The overlay component does not import `engine.ts` or any GPU code; it only reads the tour clock and the script. Engine/overlay coupling is one-way: engine drives clock, overlay reads clock. This keeps the React render tree free of WebGPU concerns.

When the tour ends (or is exited via `esc`), the overlay's `visible` prop goes false, the standard fade-out plays, the component unmounts after the transition completes (using a `setTimeout` cleanup), and the UI components return to full opacity.

## 12. Test criteria

- **Pure-logic tests** (vitest, deterministic):
  - `useTourBeat(currentSec)` returns the correct `ShellBeat` for every t in `[0, tourEnd]`, and `null` between beats.
  - Per-shell label union math: given a current shell + adjacent neighbors, the union has no duplicate `id`s and is stable under repeated calls.
  - Distance-fade gating: a label with `fadeFarMpc = 5` has `fadeAlpha ≈ 0` at `dist = 5.5`, `≈ 1` at `dist = 0.5`, smooth transition in between.
- **Component tests** (vitest + React Testing Library):
  - `<TourOverlay visible beat={...} />` renders headline + body strings.
  - `aria-live="polite"` is present on the body container.
  - `prefers-reduced-motion: reduce` shortens the CSS transition (snapshot the computed style or assert the class).
- **Integration smoke test** (manual, dev server):
  - Start the tour. Watch a full 90 seconds. Confirm: each beat fades in ~0.8 s after the camera enters its shell; the overlay never overlaps the heroic visual element of any shell; screen-reader (VoiceOver) announces each new beat.
  - With reduced-motion enabled, confirm the overlay still appears — just faster.
  - During Shell 6 (Virgo), confirm the `M87` MSDF label is visible at world position; during Shell 8 (Cosmic Web), confirm `M87` has faded out (no point-cloud-distance label spam).

## 13. Files touched

New:

```
src/components/TourOverlay/TourOverlay.tsx
src/components/TourOverlay/TourOverlay.module.css
src/services/tour/script.ts
src/services/tour/shellLabels.ts
src/services/tour/useTourBeat.ts
tests/services/tour/script.test.ts
tests/services/tour/shellLabels.test.ts
tests/services/tour/useTourBeat.test.ts
tests/components/TourOverlay/TourOverlay.test.tsx
```

Modified:

```
src/components/App/App.tsx              (mount <TourOverlay />, dim chrome while tour active)
src/components/App/App.module.css       (add .tourActive dim class for chrome)
src/services/engine/engine.ts           (per-shell controller calls labelRenderer.setLabels on shell boundary)
src/@types/                              (add ShellBeat, ShellLabelSet, ShellId types)
```

Untouched (read-only consumers):

```
src/services/gpu/labelRenderer.ts        (used as-is via existing setLabels/render API)
src/services/gpu/shaders/labels.wgsl     (no changes — fade math already supports our needs)
public/fonts/jetbrains-mono.{png,json}   (atlas already covers the glyphs we need)
```

## Open questions

1. **Text shadow on cinematic copy.** Some shell backgrounds (the bright Sun in Shell 1, the white-hot Laniakea node) may wash out white body text. A subtle `text-shadow: 0 1px 2px rgba(0,0,0,0.6)` improves legibility everywhere with no perceptual cost — but it's a small departure from the "the text just is" aesthetic. **Recommendation:** ship with the shadow; revisit if it looks too "OS-toast" in playtesting.
2. **Should the lower-third overlay sit left-aligned or be a full-width block?** Left-aligned reads more cinematic; full-width centers nicely on phones. **Recommendation:** left-aligned at desktop widths, automatically centered below ~600 px viewport width via media query.
3. **Tour-paused state — what does the overlay do?** Current design holds the current beat at full opacity until unpaused. Alternative: dim the cinematic and surface a small "PAUSED" badge. **Recommendation:** dim cinematic to 40% and add the badge — pausing should feel like *the world has stopped*, and frozen-bright text undercuts that.
