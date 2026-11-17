---
name: site-motion
description: Design motion for the Skymap website - whether a thing should move at all, easing and timing in the site's tokens, staggers, scroll-linked reveals, ambient loops and the reduced-motion branch. Use in site-restyle before writing the CSS or script for any section that adds or changes motion (scroll reveals, hover and press, pinned sequences, loops).
---

# Site motion

Extends the Motion section of `docs/superpowers/conventions/ui-ux.md` (job, ≤ 500 ms, `transform`
and `opacity` only, a reduced-motion branch), which still applies in full. site-restyle's ruling
holds: motion mostly answers scroll or the pointer, and no new runtime dependencies.

## Should it move?

- Name the motion's job in one line: it answers the pointer (hover, press), answers scroll (a
  reveal, a pin, a scrub), shows where something came from, or shows that a render is live (a film
  loop). If there's no line to write, nothing moves.
- Say what stays still. Headings and prose do not drift once they have appeared, and nothing loops at
  the edge of a paragraph the reader is reading.
- Ambient motion (allowed when tasteful and quiet): at most one per view, slow, low in contrast, and
  pausable if it runs past 5 s. Never inside `OpenApp` (ruled).
- A fade-up on every block as it scrolls in is the generic default, and the owner rejects generic.
  Reveal only what gains from arriving: a render coming into view, the steps of a pinned sequence.

## Easing

| Use | Curve |
| --- | --- |
| Something entering | decelerate: `cubic-bezier(0, 0, 0.2, 1)` |
| Something leaving (faster than it entered) | accelerate: `cubic-bezier(0.4, 0, 1, 1)` |
| Moving between two states | `--ease-standard` |
| Loops, scroll-scrubbed progress | `linear` |

Overshoot and bounce read as playful and work against the calm of the renders; use one only with a
reason you can state. A new curve or duration becomes a token in `site.css`, not a literal in a
module.

## Timing

- Hover and press: `--duration-fast` (120 ms). A small state change: `--duration-base` (200 ms).
- A reveal on scroll: 300–500 ms, never longer.
- Staggered items: 30–50 ms apart, the most important first, the whole sequence within 500 ms, and
  every related item moving in the same direction.
- Travel is short: a fraction of the element's own size, never across the screen.

## Scroll

- Prefer CSS scroll-driven animation (`animation-timeline: view()`, `scroll()`) with a static
  fallback, then `IntersectionObserver`. No scroll-jacking: the page never changes scroll speed while
  there's text to read.
- Content is readable without the motion having played: nothing waits on script to become visible,
  so no-JS, reduced motion and the `site:sections` shot all show the finished state.
- A reveal plays once. Scrolling back up doesn't replay it.
- Hover motion uses transitions (interruptible), not keyframes, and sits behind `@media (hover: hover)`.

## Reduced motion and less data

- CSS: a `prefers-reduced-motion: reduce` block removes movement. An opacity fade may stay, and a
  loop stops on its poster frame, which is a real render.
- Script: read `lessWanted()` (`packages/website/src/utils/lessWanted.ts`). It also reports
  Save-Data, which should skip a film for its poster.

## Checking it

- A section shot shows only the end state. Judge the motion itself in a browser: step it with
  Playwright, or record it, both with `page.emulateMedia({ reducedMotion: 'reduce' })` and without.
- Try it on the phone width and under CPU throttling. Motion that stutters is worse than none.
- Put it through the removal step: switch the motion off and look again. If nothing is lost, it
  stays off.

## Credit

Adapted from MC Dean's Designer Skills Pack (github.com/Owl-Listener/designer-skills):
`design-systems/skills/motion-system`, `interaction-design/skills/animation-principles`,
`interaction-design/skills/micro-interaction-spec`, `interaction-design/skills/interfaces-that-feel`
(its motion section), `interaction-design/skills/doherty-threshold`.
Copyright (c) 2026 MC Dean, MIT License; full text in `.claude/skills/LICENSE-designer-skills.txt`.
