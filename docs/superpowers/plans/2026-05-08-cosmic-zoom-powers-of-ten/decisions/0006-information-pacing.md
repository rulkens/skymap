# ADR 0006 — Information pacing for tour overlays

**Status:** Accepted
**Date:** 2026-05-08
**Deciders:** Alexander Rulkens (project lead), with input from the cosmic-zoom plan working group

## Context

Each shell of the Powers-of-Ten tour shows a soft-fade text overlay that names the shell and gives the viewer one or two facts that anchor it. The narrative script ([`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)) drafts copy for nine shells plus a prelude and a coda. The product vision ([`../vision/00-product-vision.md`](../vision/00-product-vision.md)) declares Principle 2 — *"Zero text below the fold"* — but does not nail down the operational meaning. Engineers writing the overlay renderer, copywriters drafting per-shell text, and the tour engine timing the fades all need a shared rule for **how much text, for how long, with what fade timing**.

This ADR is that rule. It exists because the brainstorm [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) raised information pacing as an unresolved trade-off, and because the per-beat overlay timings in [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §2 (the `appearAt`/`disappearAt` fields on `ShellBeat.overlay`) need a constraint to be authored against. Without that constraint, the script will inevitably drift toward "the kind of overlay text Wikipedia would write" — which is exactly what kills the cinematic feel.

The decision interacts with three forces: the user's reading speed (~250 wpm sustained, ~180 wpm under the cognitive load of also watching a moving image), the tour's total budget (~103 s of wall clock — see the runtime table in [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)), and the overlay renderer's animation cost (each fade is a tweened opacity write — cheap, but each appearance/disappearance is also a `requestRender()` event, so spurious fades wake the render-on-demand loop).

## Decision

**The pacing rule for every per-shell overlay is:**

1. **At most three sentences** of body copy per overlay (plus the bold one-line title). A "sentence" here means a self-contained statement that ends with a period, a question mark, or an em-dash; it is *not* a clause. The script's draft copy ([`../vision/01-narrative-script.md`](../vision/01-narrative-script.md)) already obeys this — every overlay is a title plus 1–3 sentences.
2. **Each sentence is at most 20 words** and avoids embedded subordinate clauses that demand re-reading. Numbers are spelled with their unit attached (`100 billion stars`, not `1×10¹¹ stellar objects`).
3. **Maximum on-screen visible time per overlay is 8 seconds.** This includes the steady-hold portion only — fade-in and fade-out are additive on top. After 8 s the overlay must be *gone* (alpha fully zero), regardless of what the camera is doing. Long shells (Milky Way at 11 s, Virgo at 10 s, Laniakea at 11 s) have copy that ends well before the beat does, leaving the user looking at the visual without text competing for attention.
4. **Fade timing per overlay is fixed:** 1 s ease-in, ≤6 s steady hold, 1 s ease-out. Total appearance duration is therefore at most 8 s (1 + 6 + 1), and 8 s is the upper bound the tour engine enforces. Shorter overlays (e.g., the prelude's "TOUR BEGINS · 90 SECONDS" stub at the start) use 1 s in, 2 s hold, 1 s out = 4 s total. The timing is per-beat and lives on the `ShellBeat.overlay` `appearAt`/`disappearAt` fields ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §2).
5. **No progressive reveal.** The overlay is opaque-or-fading-in-or-fading-out as a whole. Sentences do not appear one at a time; words do not type out. The whole block is a single faded layer.
6. **No overlap between two beats' overlays.** When beat N's overlay is fading out, beat N+1's overlay does not start fading in until beat N's is fully invisible. This is enforced by the tour engine: it queues overlay events per beat, and the next-beat's `appearAt` is rejected (with a console warning at script-load time) if it would visually overlap.

The "more info" affordance — a side-panel that opens with deeper context per shell — is **explicitly v2** and not part of this pacing rule. v1 ships with overlay-only and a "Learn more" link in the post-tour state that opens a static page. The point of the v1 deferral is to keep the v1 implementation surface tiny; the more-info panel needs its own design pass for content density, scroll behaviour, and how it interacts with pause.

## Alternatives considered

**(a) Longer prose, no upper time bound.** Let each shell's overlay be however long the copy needs, and hold it on-screen for as long as the beat lasts. **Rejected** because it directly violates Principle 2 from the product vision, and because the longest beats (11 s) would force the eye to either re-read the same sentence or stop reading and miss whatever was reaching the bottom of the block. Either failure mode breaks the cinematic — the overlay is supposed to *augment* the visual, not compete with it.

**(b) Progressive sentence reveal.** Sentences appear one at a time, paced to the beat's internal motion (e.g., sentence 2 appears as the camera completes its push, sentence 3 as it begins to pull back). Used effectively in some kinetic typography work; could create a "voice-over without sound" feeling. **Rejected** because it foregrounds the text mechanic — the user starts watching the overlay system instead of watching the universe. It also turns every beat's authoring into a per-sentence timing exercise, which is exactly the per-leg-tuning burden ADR 0004 rejected for camera orientation. The same minimal-feature reasoning applies here.

**(c) Audio narration.** The overlay is replaced (or backed up) by a recorded voice. Most "scale of the universe" projects do this; the Eames film *Powers of Ten* depends on it. **Rejected** for v1 because it is explicitly a non-goal in [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — narration triples the production effort (script, voice-actor, mix, accessibility captions, multi-language) and gates ship on a non-engineering deliverable. The product-vision note observes that the current ~25-sentence ~200-word total copy would fit in ~60 s of speech, which means a future narration pass is possible without re-pacing the tour. The decision is "not in v1," not "never."

**(d) Short prose with full-beat hold.** Three-sentence cap, but the overlay stays visible until the beat ends (i.e., for 6–11 seconds depending on the shell). Almost the chosen design, but with no `disappearAt` ceiling. **Rejected** because the longest beats would still hold text for 10+ seconds, and after a few seconds of staring at the same three sentences the user either re-reads them (annoying) or learns to mentally tune them out (defeats the purpose). The 8-second ceiling is what makes the overlay feel like a beat of information rather than a wall of text.

**(e) Short prose with bounded hold (chosen).** Three-sentence cap, 8-second ceiling, fixed fade timing. Combines the briefest copy with the cleanest stage directions. The user reads, absorbs, and then has 0–3 seconds of text-free time at the tail of the longer beats to *just look*. That trailing silence is the part the brainstorm and the product vision both implicitly want — the cosmic zoom is supposed to make people *feel* the scale, not be told about it.

## Consequences

**Copywriting:**
- The narrative script is the canonical copy. Editing the script edits the tour. Copy changes that grow a sentence past 20 words, or push the body past three sentences, are caught by a script-load lint (a small validator in `src/services/engine/tour/script.cosmicZoom.ts`) that throws at app boot.
- The "more info" panel is the v2 escape valve. Anything an author wants to say that doesn't fit in three sentences goes into the planned per-shell deep-dive page, *not* into the overlay. This keeps the constraint productive — it doesn't suppress information, it routes it elsewhere.
- Reader-friendly units (light-years, light-minutes, "1,800 times further than Pluto") stay in the overlay. Render-time units (Mpc, AU, kpc — see ADR 0005) never appear in copy. The two unit systems are decoupled.

**Engine + renderer:**
- The overlay subsystem ([`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md)) is given two fields per overlay event: `appearAt` and `disappearAt`, both relative to the beat's local t=0. Fade-in starts at `appearAt`, holds at `appearAt + 1 s`, fade-out starts at `disappearAt − 1 s`, fully gone at `disappearAt`.
- The tour engine emits `onOverlayShow`/`onOverlayHide` events around those moments. The React shell subscribes; the actual DOM-or-canvas overlay element listens and animates. Render-on-demand wakes the loop only during the 1-second fade transitions, not during the steady hold (the overlay is a CSS opacity transition with an ease-in-out cubic curve — the GPU loop can sleep through it).
- The overlay renderer enforces the 8-second ceiling by clamping `disappearAt − appearAt` at script-load time. A console warning fires if any beat's overlay exceeds the ceiling; the engine clips to 8 s rather than honouring the longer value.
- Pause behaviour ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §8) freezes the overlay at whatever opacity it had at the moment of pause. If the user pauses mid-fade-in, the overlay sits at, say, 60% alpha until they resume; on resume the fade continues from that 60%. This keeps the overlay system honest — it has no "is the tour paused?" branch, only "advance the alpha tween by `dt`."

**Testing:**
- A unit test on the script validator asserts: every `ShellBeat.overlay.body` is at most three sentences; every sentence is at most 20 words; `disappearAt − appearAt ≤ 8 s`; no two adjacent beats' overlay windows overlap.
- A snapshot test on the parsed default script catches accidental copy edits in code review by failing CI when overlay text changes (with an explicit "regenerate snapshot" instruction in the test failure message — copy edits should be deliberate).
- The overlay renderer has a visual-regression test (or, at minimum, a screenshot taken in `webapp-testing` mode) for the steady-hold state of a representative overlay, to catch styling regressions.

**Trade-offs accepted:**
- Some scientific nuance is sacrificed. "We don't know exactly where Laniakea ends" (Principle 5 — Honest about what we don't know) gets compressed to a single sentence; the longer story lives in the deferred more-info panel. This is a real loss, and it is the price of the cinematic.
- The longest beats (Milky Way, Virgo, Laniakea) have several seconds of text-free dwell at the tail. Some will read this as "wasted" airtime; we read it as the cinematic *breath* that lets the visual land. If usability testing finds users tuning out during the silent tail, the rule is to add an `internalMotion` flourish in the renderer ([`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) §6 — orbit/pushPull/arc), not to extend the overlay. Visual content fills visual time; text is a separate channel.

## References

- [`../vision/00-product-vision.md`](../vision/00-product-vision.md) — Principle 2 ("Zero text below the fold"), Principle 5 ("Honest about what we don't know"), and the v1 non-goals list (no audio narration, no branching tours)
- [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) — the canonical overlay copy, already drafted within the rules this ADR codifies
- [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) — `ShellBeat.overlay` field, §2; pause/resume semantics, §8
- [`../rendering/04-text-overlay.md`](../rendering/04-text-overlay.md) — overlay subsystem, fade implementation, render-on-demand integration
- [`./0005-units-and-scale.md`](./0005-units-and-scale.md) — reader-friendly units in copy stay decoupled from render-time units
- [`../../../specs/2026-05-07-tour-animation-design.md`](../../../specs/2026-05-07-tour-animation-design.md) — the brainstorm where information pacing was raised; superseded by [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md) and this ADR
