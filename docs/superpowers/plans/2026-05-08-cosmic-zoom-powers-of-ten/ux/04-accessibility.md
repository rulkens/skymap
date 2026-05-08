# Accessibility — Cosmic Zoom Tour

This document is the accessibility specification for the Powers-of-Ten cosmic zoom. It is the implementation of [success criterion 5](../vision/00-product-vision.md) ("Lighthouse accessibility audit passes for the tour overlay UI"), expanded to cover everything that audit cannot mechanically check: keyboard navigation, screen-reader experience, motion sensitivity, color blindness, and cognitive load.

It deliberately does **not** attempt to make the WebGPU canvas itself accessible to a blind user. The canvas is a pixel buffer of a 3D scene; there is no DOM tree under it to expose. We will instead make the *tour controls* fully accessible and treat the canvas as a visually-spatial medium with a textual narration layer above it. A blind user will get the narration; a sighted-keyboard user will get full control parity; a vestibular-sensitive user will get a snap-cut version of the tour.

## 1. Goal

**WCAG 2.1 Level AA compliance for every interactive UI element in the tour overlay.** That means the "Take the tour" CTA, the play/pause/skip controls, the "more info" disclosure, the speed setting, and any future tour-related chrome. AA was chosen over AAA because AAA's 7:1 contrast ratio interferes with the visual identity (white text on the deep-black space backdrop already passes AA at 21:1, but AAA contrast on overlays placed *over the rendered scene* is impractical when the backdrop can vary from black void to the bright CMB sphere — see §5).

The canvas content is **not** in scope for screen-reader accessibility beyond the per-shell narration string described in §3. We are honest about this in our published statement (§11): the cosmic zoom is, by its nature, a visual artifact, and we do not pretend otherwise. The audio narration future feature (§7) is the path that closes that gap.

## 2. Keyboard navigation

Every action a mouse user can take, a keyboard user must be able to take. The full bindings:

| Action | Key | Notes |
| --- | --- | --- |
| Activate "Take the tour" CTA | `Tab` to focus, `Enter` / `Space` | First focusable element on the page after page load |
| Pause / resume tour | `Space` | Already specified in [Principle 4](../vision/00-product-vision.md); same key whether the tour is playing or paused |
| Skip to next shell | `→` or `N` | Visible-on-pause control; also reachable via Tab |
| Skip to previous shell | `←` or `P` | Same |
| Open "more info" panel | `I` or Tab + Enter on the (i) icon | Closes with `Esc` |
| Exit tour | `Esc` | Returns to free-fly mode |
| Free-fly orbit (during pause) | Arrow keys when canvas is focused | See [`../ux/02-tour-controls.md`](02-tour-controls.md) for the full mapping |

**Tab order** is set explicitly via DOM order (no `tabindex` greater than 0 anywhere — that pattern is fragile). The order on first paint is: tour CTA → settings cog → info button → canvas. During the tour, the order shifts to: pause/play → previous → next → speed slider → exit → canvas.

**Focus-visible rings** are required on every interactive element. We use `:focus-visible` (not `:focus`) so mouse clicks don't paint rings, but `Tab` always does. The ring style is a 2px white outline with a 1px black inner outline (so it reads against any backdrop, even white sections of the CMB sphere). See §5 for why the inner-outline trick is necessary.

The canvas itself is `tabindex="0"` so a keyboard user can focus it and use the orbit/pan/zoom keys during pause. When the canvas has focus, it must show *some* visible focus indicator — we use a subtle 1px inset border on the canvas wrapper, not on the canvas (you can't outline a `<canvas>` cleanly across all browsers).

## 3. Screen reader

The CTA, all tour controls, and the canvas itself need explicit `aria-label`s because their visible labels are either decorative icons (pause icon, info icon) or non-existent (the canvas).

- **"Take the tour ▶ (90 s)" button:** `aria-label="Take the 90-second guided tour of the universe, from the Sun to the cosmic microwave background"`. The visible label is the marketing copy; the aria-label is the descriptive one. Verbose by design — a screen-reader user has no preview image to set context.
- **Pause/play button:** `aria-label="Pause tour"` toggling to `"Resume tour"` based on state.
- **Skip next/previous:** `aria-label="Skip to next shell"` / `"Skip to previous shell"`.
- **Info disclosure:** `aria-label="More information about this scale"`, with `aria-expanded` reflecting state.
- **Speed slider:** native `<input type="range">` with a visible label and `aria-valuetext` reading `"0.5x speed"`, `"1x speed"`, `"2x speed"`.
- **Canvas:** `aria-label` updated per shell, e.g. `"3D rendering of the Local Group of galaxies, with the Milky Way and Andromeda visible as bright disks 2.5 million light-years apart"`. This is the only screen-reader window into the visual content. It updates when the shell changes.

**Live regions for narration.** The overlay text (the per-shell prose from [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)) lives inside an element with `aria-live="polite"` and `aria-atomic="true"`. When the copy changes between shells, the screen reader re-reads the entire new string. We use `polite` (not `assertive`) so it doesn't interrupt the user mid-sentence if they're navigating with their reader. `aria-atomic="true"` ensures it reads the full new sentence rather than diffing word-by-word, which produces unintelligible output in NVDA when the copy is restructured.

The canvas's `aria-label` updates in lockstep with the overlay copy but is *not* in a live region — we don't want it announced (that would double-announce alongside the overlay). It's available for the user to query on demand.

## 4. prefers-reduced-motion

The CSS media query `(prefers-reduced-motion: reduce)` is a hard signal from the user's OS — when set, the user has indicated that animations cause them discomfort or distract them. We respect it absolutely.

When `prefers-reduced-motion: reduce` is active:

- **Camera tweens between shells are replaced with snap cuts.** The user lands on each shell instantly, holds for the full dwell time (so they can read the copy), then snap-cuts to the next. This is a fundamentally different experience — the *scale-continuity-through-motion* magic from [Principle 3](../vision/00-product-vision.md) is lost — but it is the right call. A user with vestibular sensitivity cannot watch a continuous log-scale zoom; offering them the snap-cut version is strictly better than offering them nothing.
- **Overlay text fades are replaced with instant swaps.** The copy appears at full opacity at the start of each shell and disappears at the end with no transition.
- **Famous-galaxy thumbnail fade-ins are disabled.** They appear at full alpha as soon as their bitmap is ready.
- **Background-galaxy twinkle (if we add it) is disabled.**

We detect this via `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at tour-start, and re-check on `change` events so a user who toggles their OS setting mid-tour gets the new behavior at the next shell boundary (mid-tween changes would be jarring).

We also expose this as a manual toggle in the settings panel, separately from the OS setting, because some users want the snap-cut experience without changing their global OS preference. The label is **"Skip camera motion (hold each shell)"**.

## 5. Color contrast

All overlay text must reach WCAG AA contrast (4.5:1 for body text, 3:1 for large text ≥18pt or ≥14pt bold) **against the worst-case backdrop the user can see at the moment the text is on screen**.

The worst-case backdrop is **not** the deep-space black we usually render against. It's the **CMB sphere shell** at the end of the tour, which fills the screen with a bright blue-yellow-red mottle. Pure white text on the brightest yellow regions of a Planck CMB map drops to roughly 2.1:1 — failing AA.

Mitigation: every overlay text element is rendered on a semi-opaque dark backdrop card (`rgba(0, 0, 0, 0.55)`, with a 4px corner radius and 12px padding). The card guarantees ≥4.5:1 against white text regardless of what's behind it. This costs us a little of the "floating in space" aesthetic but is non-negotiable for AA.

**Validation matrix** — every text element in the tour UI is tested against:

| Element | Backdrop | Required ratio | Approach |
| --- | --- | --- | --- |
| "Take the tour" CTA | Solar System render or starfield | 4.5:1 | Opaque button background |
| Per-shell prose overlay | Variable (worst: CMB sphere) | 4.5:1 | Dark backdrop card |
| Distance / scale readout | Variable | 3:1 (large mono) | Same dark card |
| Pause / skip controls | Variable | 4.5:1 (icon contrast) | Opaque control bar |
| Focus rings | Any | 3:1 (UI element) | White outer + black inner (passes against both) |

A unit-style test runs each canonical text element against synthesized worst-case backdrops (pure white, pure CMB-yellow `#FFE800`, pure CMB-red `#D70022`) and asserts the contrast ratio via the WCAG formula. See §10.

## 6. Motion sickness

A continuous log-scale camera zoom can trigger vestibular symptoms in sensitive users. The dolly-out from Sun to observable universe traverses ~26 orders of magnitude in 90 seconds; that is a faster optical-flow rate than most VR experiences sustain.

Three layered mitigations:

1. **Respect `prefers-reduced-motion` (§4).** The snap-cut version eliminates the moving optical flow entirely. This is the primary mitigation.
2. **In-tour speed setting.** A slider in the tour controls offers `0.5x`, `1x`, `2x`. At `0.5x` the tour takes 3 minutes, the camera moves half as fast, the optical flow rate is halved, and most vestibular triggers are resolved without the user needing to change their OS setting.
3. **The "skip the camera motion" toggle** described in §4 is also reachable from the tour controls (not just from settings) — labeled **"Hold each scale (no motion)"**. This is the same behavior as `prefers-reduced-motion: reduce` but exposed as a discoverable in-tour control for users who didn't have the OS setting on.

We do **not** add a vignette or peripheral darkening (a common VR motion-sickness mitigation) because it conflicts with the visual identity and because the underlying solution is to offer the no-motion version, not to soften a motion the user already finds uncomfortable.

## 7. Audio narration (future, called out)

**Audio narration is the single largest accessibility win available to the cosmic zoom and we are deferring it.** This is a deliberate call, documented here so future contributors can pick it up.

A synced audio track of the per-shell prose, played with the visual tour, would:

- Give blind users the full narrative experience the canvas cannot provide.
- Give low-vision users an alternative to reading the overlay text.
- Make the experience accessible to users with reading disabilities (dyslexia, etc.).
- Improve the experience for *everyone*, the same way museum audio guides do.

V1 ships text-only because audio production (script polish, voice talent, recording, mastering, hosting, lipsync to camera waypoints, accessibility of the player itself) is a multi-week effort that would gate launch. Stub this as a future feature in the roadmap. The narration script in [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) is already structured to be readable aloud — that's a deliberate forward-compatibility choice.

When we do build it, the implementation should be: pre-recorded clips per shell (not TTS — robotic voice undermines the cinematic feel), played via a `<audio>` element with native browser controls visible behind a settings toggle, with captions from the same source script displayed under the overlay text.

## 8. Color blindness

The Cosmicflows-4 velocity flow vectors in the Laniakea shell encode direction and magnitude using a color ramp. The default scientific-visualization choice (matplotlib's `viridis` or `plasma`) is already deuteranopia- and protanopia-safe by construction. We use `viridis` for magnitude and arrow-glyph rotation for direction; we do **not** use red-green for any flow encoding.

The CMB anisotropy palette (Planck-standard blue → white → red) is also distinguishable under common color-blindness types — the lightness ramp (dark blue → light → dark red) carries the temperature information independently of hue. This is why the Planck collaboration adopted it.

X-ray hotspot overlays on Coma and Virgo are rendered in red, which is not distinguishable from the surrounding starlight for some users. Mitigation: X-ray regions also get a faint white outline so the *shape* of the hot gas region is visible even if the red fill isn't.

We test the full tour through the Chrome DevTools "Emulate vision deficiencies" panel (deuteranopia, protanopia, tritanopia, achromatopsia) before each release. Any shell that becomes ambiguous gets a shape or texture treatment added.

## 9. Cognitive load

[Principle 2](../vision/00-product-vision.md) — *zero text below the fold* — is not just a design principle, it is a cognitive accessibility win. Each shell shows at most three short sentences. There is no scrolling, no nested menus, no decisions to make. The tour plays itself.

For users with cognitive disabilities, attention disorders, or simply tired brains, the no-decisions-required structure is significantly more accessible than a typical interactive astronomy app. We name it explicitly here so future contributors don't accidentally undermine it: **"add a quick quiz"** is rejected on cognitive-accessibility grounds, not just on "non-goal" grounds.

The pause-friendly principle ([Principle 4](../vision/00-product-vision.md)) supports the same audience: a user who needs to step away, re-read the copy, or just stop and breathe can do so at any moment without losing state.

## 10. Testing

The accessibility test suite is structured in three tiers:

1. **Automated, in CI:**
   - `lighthouse` accessibility audit on the tour landing page; must score ≥95.
   - `axe-core` integration test (Vitest + Playwright) on each tour shell; zero violations.
   - Contrast-ratio unit test that asserts every text element passes AA against synthesized worst-case backdrops (§5).
   - Keyboard-only Playwright walkthrough that completes the full tour using only `Tab`, `Enter`, `Space`, arrow keys, and `Esc`.

2. **Manual, before each release:**
   - NVDA on Windows + Firefox: full tour walkthrough listening to the screen reader.
   - VoiceOver on macOS + Safari: same.
   - Chrome DevTools vision-deficiency emulation: tour walkthrough under deuteranopia, protanopia, tritanopia, achromatopsia.
   - `prefers-reduced-motion: reduce` set in the OS: full tour walkthrough confirming snap-cuts.
   - Keyboard-only mouse-disconnected walkthrough.

3. **Pre-launch, one-off:**
   - A user with vestibular sensitivity in our usability cohort runs the tour with default settings, then with reduced-motion.
   - A user who relies on a screen reader full-time tries the tour and gives us feedback. (Sourced through Fable Tech Labs or equivalent.)

The contrast-ratio test code lives in `tests/services/tour/accessibility/contrast.test.ts`; the axe-core integration in `tests/e2e/tour-accessibility.spec.ts`.

## 11. Compliance documentation

We publish a brief accessibility statement at `/accessibility` (linked from the footer) covering:

- The conformance target (WCAG 2.1 Level AA) and our self-assessed conformance level.
- The known limitation: the WebGPU canvas content is visually-spatial and not exposed to assistive tech beyond the per-shell `aria-label`. The narration text in the live region is the textual equivalent.
- The `prefers-reduced-motion` behavior and the in-tour "hold each scale" toggle.
- The audio narration roadmap item (§7) as a future improvement.
- An email address for accessibility-specific feedback (separate from general feedback so we can route it).

This statement is reviewed alongside any UI change that touches the tour.

## 12. Test criteria

The accessibility work is shippable when:

1. Lighthouse accessibility score ≥95 on the tour landing page and on each shell mid-tour.
2. Zero `axe-core` violations on any shell.
3. The full tour can be completed with keyboard only, with no traps and with visible focus at every step.
4. NVDA and VoiceOver both announce the per-shell narration when shells change, without re-announcing every frame.
5. Setting `prefers-reduced-motion: reduce` produces a snap-cut tour with no smooth camera motion and no fade transitions.
6. Every overlay text element passes AA contrast against the synthesized worst-case backdrop.
7. The tour is comprehensible under deuteranopia, protanopia, and tritanopia emulation (no information is conveyed by hue alone).
8. The accessibility statement at `/accessibility` is published and accurate.

## 13. Files touched

- `src/components/TourCTA.tsx` — CTA button with descriptive `aria-label`.
- `src/components/TourControls.tsx` — pause / skip / speed controls; `aria-label`s, `aria-expanded`, focus management.
- `src/components/TourOverlay.tsx` — per-shell narration in `aria-live="polite"` region; backdrop card for contrast.
- `src/components/AccessibilityStatement.tsx` — `/accessibility` route content.
- `src/services/tour/motionPreference.ts` — `prefers-reduced-motion` detection + manual override; emits the snap-cut signal to the camera tween system.
- `src/services/tour/tourSpeed.ts` — speed setting (0.5x / 1x / 2x), persisted to `localStorage`.
- `src/services/gpu/canvasA11y.ts` — updates the canvas `aria-label` on shell transitions.
- `src/styles/focus.css` — `:focus-visible` ring (white outer + black inner).
- `tests/services/tour/accessibility/contrast.test.ts` — contrast-ratio unit tests.
- `tests/e2e/tour-accessibility.spec.ts` — axe-core + keyboard-only Playwright walkthrough.
- `public/accessibility.html` (or React route) — the published accessibility statement.

See also:

- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — success criterion 5.
- [`../ux/01-information-overlays.md`](01-information-overlays.md) — overlay text structure that this spec makes accessible.
- [`../ux/02-tour-controls.md`](02-tour-controls.md) — control surface that this spec makes keyboard-reachable.
