# ADR 0012 — Layers Declare Visibility; Core Hands One Value

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Tags:** engine, layers, fades, visibility, focus
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [ADR 0001 — Fade ownership](0001-fade-ownership.md) (extended here) ·
  [ADR 0011 — Engine composition rows](0011-engine-composition-bundle-rows.md) ·
  spec `docs/superpowers/specs/2026-10-13-layer-declared-visibility-design.md` ·
  plan `docs/superpowers/plans/2026-10-14-layer-declared-visibility.md` (#903, #912)

## Context

ADR 0001 made fade a subsystem that renderers read rather than store. It did
not settle who declares a fade, or who combines it with the other things that
dim a pixel. Before #912 each Layer carried its own `fades` rows and bridges.
Every consumer then computed its own opacity: it read the registry, multiplied
in a clip factor, applied focus recession with its own exemptions for the
focused or selected record, and decided for itself whether to skip drawing.
Core branched on Layer ids in several places, among them the star captions,
the black-hole pick and the bodies a Layer claims. As a result the same rule (a
clip dims a label, the focused subject stays bright, picking follows what is
drawn) was written once per Layer and drifted between them. The heliosphere
shell, the next Layer, would have needed one more copy.

## Decision

**A Layer declares what it shows and labels as data. Core resolves one value
per address and hands it to the consumer. Recession is applied only by core's
`emphasisOf`.**

1. **Entries are data.** `Layer.visibility` lists show entries
   (`{ key, cluster?, items?, recession?, bodies? }`) and label entries
   (`{ label, cluster?, items?, recession?, of? }`). The only per-Layer
   differences are the values in these entries. No core code names a Layer.
2. **One handed value.** For every pass, planner, compute and label producer
   that declares a `fade` or `label` key, core resolves fade × clip (times the
   `of` entry's clip for a label that has `of`) and passes the result as the
   consumer's last argument. Core skips a consumer whose value is 0. The same
   value gates draw and pick, so a thing faded to 0 cannot be clicked.
3. **Recession is core's alone.** `emphasisOf(entry, snapshot, pickId?)`
   returns 1 for the subject the focus fade is about
   (`ReadyFrameContext.focusPickId`, latched until the blend reaches 0) and
   otherwise the entry's recession at the current blend. Core's label
   directors and the world-label path apply it per label, keyed on
   `Label2D.subjectId`, which is separate from the clickable `pickId`. Each
   non-label consumer that recedes composes `value × emphasisOf(...)` with its
   own record's pick word. No consumer computes recession itself.
4. **One scene-body sort.** Core sorts every scene body once per frame, stars
   included, and Layers read the result from `ReadyFrameContext.sceneBodies`.

Adding or widening any Layer contract member stays an explicit, per-member
decision.

## Consequences

- **A new Layer writes entries, not fade code.** It gets toggling, clip cues,
  `over` durations, pick gating and focus recession from core.
- **One rule, one place.** A change to how a clip, a toggle or the focus dims
  things is made once. The fourteen user-visible changes in #912 come from
  making the Layers agree; the spec lists them.
- **A silent failure mode remains.** A receding consumer that forgets to call
  `emphasisOf` just never recedes. Each of today's consumers is pinned by its
  own test. A new one needs the same test.
- **The frame context's focus fields are written after it is built.** `focus`,
  `focusBlend` and `focusPickId` are overwritten in place on the tick that
  advances the focus fade. Making them readonly is a backlog item.
- **Known leftovers.** The `focusedOnly` label gates still read the focus per
  Layer. The recession blend is driven only by a structure focus.
  `near0SphereBodies` stays in core until bodies move into Layers.
