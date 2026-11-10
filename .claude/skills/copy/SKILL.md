---
name: copy
description: Write or rewrite short user-facing copy in Skymap (exhibit ledes and sections, palette blurbs, website sections, tour captions) as options the owner picks from. Use when asked to write, rewrite, improve or "fix the copy" of a lede, blurb, label, caption or site paragraph.
---

# Copy

Two self-directed rewrite passes of the exhibit copy were rejected, and the owner named no lines. Rules were never
short; what was missing was his verdict on concrete options. So this skill never sends one draft: it sends 2 to 3
judged options per line and records what he picks. Background: the research behind it is summarised in
`docs/superpowers/conventions/copy-exemplars.md` (his marks) and `ui-ux.md` § Copy (his rulings).

## Voice (current experiment)

- **Exhibits: warmer, story-led** (owner, 2026-11-10: "let's test this on the exhibits, and then see what works
  best"). A story is the order of true facts: who measured it, where we are in it, what the visitor sees move. Warmth
  comes from people, places and "we", never from adjectives or metaphors.
- **Everything else** (site, palette, UI): literal and short, per `ui-ux.md` § Copy.
- **Science and data claims stay strictly true** everywhere. App-feature lines go in as the owner typed them.
- The product is `Skymap` in running text.

## Inputs to load first

1. `docs/superpowers/conventions/copy-exemplars.md`: pick 3 to 5 entries that differ from each other (one kept, one
   rewrite, one or two cuts, plus any **Picks** for the same surface).
2. Website work only: the marks in `.superpowers/site/review/*.json` (main checkout) for the page. Copy any new
   owner marks (`reason: "owner"`) into the exemplar file first.
3. The current text of every line in scope, and the sources it cites (the exhibit's `sourcesKind`, the facts
   section, code comments with derivations).

## Procedure

1. **Questions and anchors** (you). Per line, write the visitor's question at that moment and what is on screen
   (ribbons, a colour ramp, a label, a toggle, the camera move). A line with no question gets cut, not rewritten.
2. **Facts sheet** (you or a subagent). One row per fact: the claim, its number, where it is checked (file, paper,
   facts row), a human-scale version, and whether it is on screen. Pick **one fact per section**. Never add a
   number or claim that is not on the sheet. Flag any current claim, and any citation, that its source doesn't
   support (the first run found a wrong author list and a survey left uncredited).
3. **Writer** (you or a fresh agent). Brief: the 3 to 5 exemplars in `<example>` tags, the voice note, the question,
   the fact, the budget, and this paragraph: "Metaphors drag in connotations the writer did not choose. When a
   literal phrase is available, use it." Ask for **5 options per line, one per register** (below). No ban list in
   the brief; the bans are checked in step 4.
4. **Lint, then judge** (a fresh agent that did not write the options). Lint first, mechanically: word counts,
   reading grade, `rg '—'`, the tell list. Then score each option against the rubric, cut every option failing a
   **must**, and keep the best **2 to 3 per line**, each with the checks it passed narrowly.
5. **Owner picks** in ONE dash `ask_user` set: one `choice` question per line (`header` = the line's id, `context` =
   the current text, `options` = the survivors, `recommended` = the judge's top). He can always type his own answer;
   say in `context` that "none, because…" is the most useful answer. One line per question, never a whole label.
6. **Record**: append every pick and every "none, because…" to **Picks** in the exemplar file, in its format, in
   the same change that edits the copy. Then edit the copy file.

## Registers

| Register | What it does |
|---|---|
| plain | One literal statement of what the thing is |
| on screen | Starts from something the visitor sees right now |
| human scale | One big number with one comparison the body can feel |
| how we know | The measurement or the people who made it, in story order |
| you are here | The visitor's own place in it (the Milky Way, Earth, "we") |

## Rubric (for the judge)

A line ships only if every **must** passes.

| # | Check | Test | Level |
|---|---|---|---|
| 1 | Answers the question | Write the question it answers; if you can't, cut it | must |
| 2 | Points at the screen | Lede and first section name something visible | must |
| 3 | One idea | One per sentence, one per section; the first sentence stands alone | must |
| 4 | Only here | A noun or number no other exhibit or page could print unchanged | must |
| 5 | Literal | Every verb and noun is true to a scientist ("watershed", "piled up", "dance" fail) | must |
| 6 | Checkable | Every number is on the facts sheet; no count that goes stale unless computed | must |
| 7 | Budget | Lede ≤ 25 words, section ≤ 50, first sentence ≤ 16, Flesch-Kincaid grade ≤ 8 | must |
| 8 | No tells | No em dash, "not X but Y", colon reveal, tricolon, -ing tail, significance claim, hedge | must |
| 9 | Gloss | Jargon glossed in the same breath ("redshift, the stretching of its light") | must |
| 10 | No meta | Nothing about the text, the page or the act of looking | must |
| 11 | Human scale | A big number gets one comparison, never two | should |
| 12 | Variety | No opener shape repeated across sections or exhibits; sentence lengths vary | should |
| 13 | Read aloud | Any stumble when read aloud fails | should |

Grade: compute Flesch-Kincaid (0.39 × words/sentence + 11.8 × syllables/word − 15.59) with a vowel-group syllable
count; don't estimate it by eye. A proper noun the visitor reads on screen (Laniakea, Sloan) may push one line over.

## Don't

- Send one draft, or a rewrite without options. A choice costs the owner a second; a critique costs him minutes.
- Put the ban list in the writer's brief. Naming a phrase primes it; the judge checks it instead.
- Ask for a whole exhibit or page as one question (memory: checks per section).
