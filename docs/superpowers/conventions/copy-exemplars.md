# Copy exemplars

The owner's taste in copy, taken from his own marks: lines he kept, rewrote or cut, with his reason where he gave one.
The `copy` skill (`.claude/skills/copy/SKILL.md`) feeds 3 to 5 of these to the writer as examples to aim at, not rules.
Every owner pick or "none, because…" from a copy round is appended under **Picks**, newest first.

Sources: the website review overlay's marks in `.superpowers/site/review/*.json` (main checkout, gitignored), harvested
2026-11-10. "Why" in quotes is the owner's own text; "why (inferred)" is ours, from a mark he left without a reason.

## Kept (and why)

1. **About page, opening paragraph** (`about.json`)
   > Skymap is a free, open-source web app that draws the mapped universe in three dimensions at true scale. Catalogued
   > stars, galaxies and quasars sit where published surveys put them. You fly the camera from a park in Copenhagen to
   > the edge of the observable universe in one continuous scene. It runs in a current browser, with no account and
   > nothing to install. The sources are named, and the site says which parts are measured, which are derived and which
   > are drawn.

   Why (inferred): plain declaratives, one fact per sentence, one real place (a park in Copenhagen), the claim backed by
   where it comes from. No adjective does the selling.

2. **Classroom page, intro** (`classroom.json`), kept with a note
   > Distances in space are hard to feel from a page. In Skymap your pupils fly across them, from the Moon to the
   > galaxies, at true scale.

   Why: "should be a one line". The idea is right; two sentences are one too many.

## Rewritten (before → his version, why)

3. **Classroom lesson question** (`classroom.json`)
   - Before: "Nobody has taken this picture. How could we know the shape of a galaxy we are inside?"
   - His version: **"Nobody has ever taken a picture of the milky way. How do we know its shape?"**

   Why (inferred): names the object instead of "this picture"; drops the clever clause ("a galaxy we are inside");
   asks the plain question a pupil would ask. A real question is fine; a rhetorical one is not.

## Cut (why)

Cut by the owner himself:

4. "The first needs no preparation." (`classroom.json`). Why (inferred): a side remark; nobody needs it to act.
5. "The planets’ orbits from above" (`classroom.json`, a lesson title over its picture). Why (inferred): restates the
   picture; the question under it ("How many times wider is Neptune’s?") carries the lesson.
6. "Each link opens what its line says." (`docs-guide-sharing.json`). Why (inferred): talks about the text itself.
7. The whole "Worked examples" block on the sharing page (`docs-guide-sharing.json`): eight sample links with a line
   each. Why (inferred): a list of examples where the reader wanted the rule; the reference page already has the links.
8. "Skymap is a free, open-source web app that draws the mapped universe in three dimensions at true scale. These pages
   document what it does, the data it is built from and how it draws that data." (`docs.json`). Why (inferred): the
   first sentence repeats the about page; the second announces the pages instead of being them.
9. "Tour controls / next, previous, pause and leave, by button or by key" (`features.json`, a term and its line).
   Why (inferred): interface mechanics on a page about what you can see.
10. "Captions / a heading and a sentence or two at each step" (`features.json`). Why (inferred): the same, a format
    detail nobody chooses the app for.

Proposed by a review agent on `/docs/start/scene/` and left marked "cut" by the owner (`docs-start-scene.json`; the
reason is the agent's, so weigh these below his own marks):

11. "Everything skymap draws, from a park in Copenhagen to the edge of the observable universe, nearest first, and
    whether it is measured, derived or drawn." Why: announces the page; the title and the table already say it.
12. "The last column gives the main class. Most things combine the three, and each section says which part is which."
    Why: explains how to read the page; the page shows it.
13. "The search has 18 places on Earth; see Finding things." Why: a count that goes stale, plus a pointer elsewhere.
14. "The Moon orbits Earth at an average of 384,400 km, which light covers in about 1.3 seconds." Why: a true fact
    that answers a question the page did not ask.
15. "…less accurately than a planet’s: the Moon follows an average orbit, while the planets are corrected against
    NASA’s positions". Why: method detail; "Derived: its position" already answers the question.
16. "…, which is Solar System Scope’s, like the planets’". Why: a credit; it belongs with the credits.
17. "Up to 12.9 million load, depending on the data size. The app names 118 of them." Why: two counts that go stale.
18. "Andromeda (M31) is about 2.5 million light-years away (761 kiloparsecs, plus or minus 11 kiloparsecs)." Why: one
    object's distance on a page about what is drawn; error bars are precision theatre in running text.
19. "Laniakea is the supercluster of galaxies that contains the Milky Way, defined by the flow of galaxies towards its
    centre." Why: a definition; that is the glossary's and the card's job.
20. "by the Monte Carlo Physarum Machine". Why: names the algorithm where "computed from the positions of SDSS
    galaxies" is enough.
21. "That is a present-day distance in a flat Lambda-CDM model, the standard model of cosmology, with Planck 2018
    parameters, which is why it exceeds the age of the universe in years." Why: the model behind the number, stacked
    into one sentence.
22. The whole "What is not here" section. Why: it lists what is absent; the reader asked about what they see.

## His words on copy

- "plain english. really. i cant say this enough." (2026-09-21)
- "no LLM-style metaphors" (the Literal-and-short ruling in `ui-ux.md` § Copy)
- On feature lines: "You are being too pedantic… show some leniency when it comes to app features" and "Just use what I
  said" (2026-10-23). Science and data claims stay strictly true.

## Picks

Newest first. One entry per line the owner chose from, in this shape:

```
- YYYY-MM-DD · <surface: exhibit/palette/site> · <line id>
  - Picked: "<text>" (register: <name>)
  - Passed over: "<text>", "<text>"
  - Why: "<his words, or none given>"
```

A "none, because…" answer goes in the same shape with `Picked: none` and his reason under Why.

- 2026-11-10 · exhibit · cosmicFlows lede
  - Picked: "These ribbons show which way galaxies fall once the expansion of space is taken away. The Milky Way is falling too." (register: on screen)
  - Passed over: "Space carries the galaxies apart as it expands. With that expansion removed, each ribbon shows which way the galaxies near it are falling.", "The Milky Way is on one of these ribbons. Each one shows where galaxies fall once the expansion of space is removed."
  - Why: none given
- 2026-11-10 · exhibit · cosmicFlows what you're seeing
  - Picked: "The colour of a ribbon is its speed. Blue is the slow flow, and near-white is 1,200 km/s or faster. The ribbons run out of emptier regions and into crowded ones." (register: on screen)
  - Passed over: "The Milky Way is on one of these ribbons and moves at about 600 km/s. At that speed you would cross from Earth to the Moon in about eleven minutes." (the judge's top pick), "Each ribbon shows which way matter is falling at every point along it. The ribbons start in emptier regions and end where galaxies crowd together."
  - Why: none given
- 2026-11-10 · exhibit · cosmicFlows how it was made
  - Picked: "Nobody can see a galaxy move in a lifetime. So how do we know it moves? Its redshift, the stretching of its light, disagrees with its distance, and the difference is its own speed towards or away from us." (register: visitor's question)
  - Passed over: the plain and how-we-know options (copy-options run)
  - Why: none given
- 2026-11-10 · exhibit · cosmicFlows Laniakea
  - Picked: "In 2014 Brent Tully’s team mapped where galaxies, ours included, fall towards the Great Attractor. They named the region Laniakea, Hawaiian for “immense heaven”. It is 520 million light-years across." (register: how we know)
  - Passed over: the you-are-here and plain options
  - Why: none given
- 2026-11-10 · exhibit · cosmicWeb lede
  - Picked: "Every galaxy, ours included, sits somewhere in this web. Its strands and knots surround nearly empty voids." (register: you are here)
  - Passed over: the on-screen and plain options
  - Why: none given
- 2026-11-10 · exhibit · cosmicWeb what you're seeing
  - Picked: "The colour is density. Black is a void, almost empty. Pink is a filament, and pale yellow is a knot, where filaments cross and clusters of galaxies form." (register: on screen)
  - Passed over: the you-are-here and plain options
  - Why: none given
- 2026-11-10 · exhibit · cosmicWeb how it was made
  - Picked: "A slime mould, Physarum polycephalum, grows a network of tubes between pieces of food. In 2020 astronomers first used a simulated one to trace the cosmic web, with galaxies as the food. Here it grew from about 325,000 Sloan galaxies and a second survey of the sky near us." (register: how we know, story)
  - Passed over: the two-surveys and people options
  - Why: none given
- Pattern so far: the owner picked "on screen" for every What-you're-seeing line and the lede that names what is visible; story/people registers won the how-we-know sections.
