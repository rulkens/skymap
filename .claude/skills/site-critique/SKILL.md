---
name: site-critique
description: Critique a section screenshot of the Skymap website along fixed dimensions (hierarchy, composition, type, colour and contrast, affordance, density, the owner's rulings) and name the single weakest thing with its fix. Use in the site-restyle round trip (step 4.3) on every pass, and whenever asked how a site page or section looks.
---

# Site critique

Reads one section's shots (1440 and 400, from `npm run site:sections`) and returns a ranked list of
findings plus the one thing to fix next. The rules and numbers it judges against live in
`site-composition` and `docs/superpowers/conventions/ui-ux.md`; this skill is the procedure.

## Before judging

- **Look at this pass's shots** with the Read tool, both widths. Never judge from the code or from
  memory of an earlier pass.
- **Write the section's job in one line:** what the reader takes away, and the one thing it asks them
  to do (open a view, read on, go to a page). Every finding is a problem for that job, not for taste.
- **Squint first.** Read the full-page shot at its smallest: the groups, the entry point and the
  rhythm between sections must show before any word is read.

## The dimensions

Ask each question. A finding is **Observation** (what is on the shot) → **Problem** (what it costs the
job) → **Fix** (a concrete change naming the token, class or component). Rate it with ui-ux's scale:
cosmetic, minor, major, blocking.

**1. Hierarchy: entry point, eye path, emphasis**
- Where does the eye land first? Is that the section's point (usually the render or the heading)?
- Is there exactly one emphasis? Two things competing at the same weight means neither leads.
- Does the path run heading → line → picture → link and end at the action? Look for dead ends and a
  link reached before the reader knows what it opens.
- Do adjacent levels differ clearly? A near-miss in size or weight reads as a mistake.
- Is anything decorative louder than the content it serves?

**2. Composition and alignment**
- Run site-restyle's alignment list (shared edges, one left edge, gaps from the scale, captions
  lined up). Measure with `getBoundingClientRect` when the eye is unsure.
- Balance: is a heavy render offset by type? Is a crowded band sitting beside an empty one?
- Proximity: is a heading closer to its own content than to the section above, and a caption closer
  to its picture than to the next one?
- Containers: is a border, panel or card doing work that space alone could do? More than two nested
  boxes is a finding.
- Rhythm: do two neighbouring sections share the same layout, so they read as one long section?
- Do edges sit on the `.grid` column lines that the sections above and below use? A grid break must
  be single, obvious and worth it.

**3. Type**
- Only the site's seven sizes; any in-between size is a finding.
- Prose at `--measure`, a lead at `--measure-lead`, captions shorter; no third width.
- The display face is never under 20 px; Jost 300 only at `--text-body` and up.
- Is a centred heading sitting over left-aligned text without a reason?
- One-word last lines in headings or leads (`text-wrap: balance` on headings, `pretty` on prose).

**4. Colour and contrast**
- Text over a render: is it 4.5:1 against the brightest pixel behind it? Sample the shot, don't guess.
- Is text hierarchy carried by the `--site-text*` tokens rather than raw values or opacity?
- Is the accent kept for links and the one emphasis, or is it spent on decoration?
- Is it legible without colour? A state shown only by hue is a finding (ui-ux Interaction 12).

**5. Affordance**
- Do links look like links and static text not? Do all view links read as one set?
- Is there one primary action per section, with the rest quieter?
- Hover and press states, and a visible focus ring on black and over pictures.
- On the phone shot: 44 px targets (`--tap`), nothing reachable only by hover.

**6. Density**
- Can the section's point be read in about five seconds? Count what competes for it.
- Is secondary text (labels, credits, metadata) visibly subordinate?
- More than five items in a row is a finding; group them or cut some.

**7. The owner's rulings**
- Every picture of the sky is a real render or film.
- The copy and headings are unchanged.
- Each decoration can be justified in one sentence. If you can't say what it adds, it goes.
- No templated tells: check `docs/research/2026-09-17-companion-website/06-exemplar-sites.md`
  section D, `12-taste-and-structure.md` §1.8 (alternating image-left/image-right rows, a serif
  word over a full-bleed hero, uniform everything) and the frontend-design skill's list of defaults.

**The phone shot** gets its own read: does the emphasis survive stacking, does the render still show
its subject at 400 px, and is the order right when read top to bottom?

## Output

```
Section: <name>   Job: <one line>
P1 (blocking/major) …   P2 (minor) …   P3 (cosmetic) …
  - <dimension>: <observation> → <problem> → <fix>
Weakest thing: <one finding>   Fix: <one change>
```

Only the weakest thing goes into the next fix; the rest wait for later passes. Keep the list in the
pass notes so the next pass can confirm each one is gone or still there. Stop the round trip when no
dimension has a major or blocking finding at either width.

## Credit

Adapted from MC Dean's Designer Skills Pack (github.com/Owl-Listener/designer-skills):
`visual-critique/skills/critique-*` (all seven), `visual-critique/commands/critique-screen.md`,
`prototyping-testing/skills/heuristic-evaluation`, `design-ops/skills/design-qa-checklist`.
Copyright (c) 2026 MC Dean, MIT License; full text in `.claude/skills/LICENSE-designer-skills.txt`.
