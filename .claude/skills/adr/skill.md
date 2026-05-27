---
name: adr
description: Scaffold a new Architecture Decision Record under docs/adrs/ with the project's template, auto-numbered. Use when the user types `/adr` or asks to "create an ADR", "write an ADR for X", or wants to document an architectural decision. Use proactively when the assistant is about to make a non-obvious architectural choice — codify the decision before the code lands so future readers (humans and agents) can reconstruct the why.
---

# /adr — Architecture Decision Record scaffolder

Architecture Decision Records capture **one decision** — its context, the
choice made, and the consequences — at the moment the decision was made.
They're immutable once accepted; if we change our minds, we write a new
ADR that supersedes the old one. This is Michael Nygard's 2011 format,
kept deliberately lightweight.

ADRs live in `docs/adrs/NNNN-kebab-case-title.md`, numbered from 0001.
The numbering is monotonic and never re-used, even for superseded
records.

## When to write one

- Cross-cutting subsystem ownership questions ("who owns the GPU
  resources for X?" — see ADR 0001).
- Public-API boundary decisions that are easy to slip into without
  noticing ("should the renderer take a context bag or positional
  args?").
- Trade-offs where the rejected alternative will look reasonable to a
  future reader, so the rejection rationale matters.

## When NOT to write one

- Implementation details inside one module — the code's comments are
  the right home.
- Reversible style choices (formatter rules, file naming) — those
  belong in CLAUDE.md or the linter config.
- Pure feature plans — those go in `docs/superpowers/plans/`. ADRs
  document the *why* a plan looks the way it does, not the plan
  itself.

## Steps

1. **Pick the next number.** List `docs/adrs/*.md`, find the highest
   `NNNN` prefix, increment. If the directory doesn't exist yet,
   start at `0001`.

2. **Pick the title.** A short, declarative sentence in present tense
   — "Fade is a Subsystem; Renderers Consume It, They Don't Store
   It." Filename: kebab-case of the noun-phrase portion
   (`0001-fade-ownership.md`).

3. **Write the file with the template below.** Fill in Status, Date
   (today, `YYYY-MM-DD`), Context, Decision, Consequences. Leave
   References at the bottom even if empty.

4. **Status starts as `Proposed` if the user has not yet agreed**,
   `Accepted` if they have. Don't write `Accepted` on the user's
   behalf — confirm first.

5. **Cross-link.** If this ADR will be executed by a plan in
   `docs/superpowers/plans/`, add a forward reference. If it relates
   to an entry in `docs/superpowers/conventions/`, link both ways.

6. **Don't commit yet.** Stop and let the user review. ADRs are
   weighty; a misframed Context or muddled Decision is much harder
   to fix once it's the official record. Wait for explicit go-ahead.

## Template

```markdown
# ADR NNNN — <Title in present tense>

- **Status:** Proposed | Accepted | Superseded by ADR NNNN
- **Date:** YYYY-MM-DD
- **Decision-makers:** <names or roles>
- **Supersedes:** — | ADR NNNN
- **Superseded by:** —
- **Related:** <plan paths, convention paths, sibling ADRs>

## Context

<The forces in play. What was the situation? What constraints
existed? What pattern had already calcified, accidentally or
otherwise? Be specific — name files, cite commit hashes if the
history is part of the story. Several paragraphs is normal; a
one-liner is a smell.>

## Decision

<The single decision being recorded. State the principle in one
sentence, then unpack what it means concretely. Include "what we
are explicitly NOT deciding here" to ward off scope creep — a
future reader should know the ADR's boundaries.>

## Consequences

### Positive
- <Concrete effects, ideally measurable.>

### Negative
- <The trade-offs accepted.>

### Neutral / forward-looking
- <Things that change shape but aren't strictly better or worse;
  things this ADR enables for future decisions.>

## Implementation notes (non-binding)

<Optional. The shape you had in mind while writing the ADR. The
plan that executes this is free to revise, but the notes give the
implementer a starting point.>

## References

- <Commits, related ADRs, external links — Nygard's essay, the
  Cockburn hexagonal-architecture paper, whatever you cited.>
```

## Anti-patterns

- **Don't** write an ADR for a decision that hasn't been made. If
  you're still weighing options, that's design discussion — capture
  it in the conversation or a scratch doc, then write the ADR once
  the call is made.
- **Don't** edit an accepted ADR in place to reflect a new direction.
  Write a new ADR that supersedes it; update the old one's
  `Superseded by` line and nothing else.
- **Don't** include implementation diffs. ADRs are about *why*, not
  *how*. Plans and code are the right home for the *how*.
- **Don't** write more than one decision per ADR. If the doc is
  about both "fade ownership" and "selection ownership," split it
  into two — they'll be referenced independently in the future.
- **Don't** number out of sequence. Even if you abandon a draft
  (e.g. ADR 0003 never lands), keep the gap; don't recycle the
  number.
