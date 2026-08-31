---
name: comment-audit
description: Sweep every code file a branch touched and bring its comments up to the comment-budget convention. Use when the user types `/comment-audit`, asks to "audit comments", "clean up comments before the PR", or before a PR wraps. Catches the recurring AI-agent failure mode — over-commenting: what-restating comments, refactor narration, review-speak, derivations already visible in the expression.
---

# /comment-audit — comment-budget sweep

Agents narrating their own diff over-comment, one plausible-looking
line at a time, and it compounds across a codebase — see
`comments.md`'s own measurement of `main` for the scale this reaches
when nobody counts. This skill is the per-branch counter-pressure:
before a PR wraps, bring every file the branch touched back under
budget.

The convention this skill enforces —
[`docs/superpowers/conventions/comments.md`](../../../docs/superpowers/conventions/comments.md)
— is the authority. Read it before judging anything; this skill only
operationalizes it. Don't re-derive the rules from memory.

## When to invoke

- The user says `/comment-audit` or "clean up the comments" before
  opening a PR.
- Proactively, once a feature branch's implementation is otherwise
  done and about to be reviewed.

## Procedure

### 1. Derive scope

`git diff --name-only <BASE>..HEAD`, filtered to code files only
(`src/`, `tools/`, `tests/`) — exclude `docs/` and `*.md`.

BASE = the skill argument if given, else `git merge-base main HEAD`.
In a stacked or squash-merged worktree branch the merge-base can
predate reality — sanity-check the resulting file list; if it contains
files that obviously belong to unrelated prior work, prefer the
parent of the branch's own first commit instead.

### 2. Read the convention

Read `comments.md` in full before touching a single file. Its budget,
its "earns its place" / "doesn't earn its place" lists, and its
timelessness test are what you're applying — don't improvise a
stricter or looser bar.

### 3. Audit each file

Whole-file audit, priority on lines the branch added:

- Module header ≤ 10 lines.
- Total comment lines ≤ half the code lines.
- Every remaining comment passes **why-not-what**: it records a
  landmine, a unit, a derivation, or a cross-file contract — something
  a reader would otherwise rediscover the hard way.
- Every remaining comment passes **timelessness**: no "now" / "new" /
  "previously" / "moved from" / "replaces", no restating the diff, no
  restating the test name.

### 4. Fix

Default fix is **deletion**. Rewrite only when a genuine landmine,
unit, or contract is recorded but worded badly (echoing the diff,
buried under prose). Never add a comment that wasn't already there.
Never change code semantics, identifiers, or test assertions — this
pass touches comments and blank lines only.

### 5. Gates

`npm run typecheck` then full `npm test` — comment edits can still
break parsing (an unterminated block comment, a stray `//` inside a
template literal).

### 6. Commit

Its own commit, never folded into a feature commit:

```
docs(comments): comment-budget audit over <scope>

<counts: files audited, files clean, files fixed, lines deleted/rewritten>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Stage only the edited files by explicit path — never `git add -A`.

### 7. Report

- One line per **changed** file: `deleted N / rewrote M — <gist>`.
- A count of files that were already clean (no line-by-line detail
  needed for those).
- Any comment you weren't sure about: flag it for the user to
  adjudicate rather than guessing either direction.

## Anti-patterns

| Rationalization                                         | Why it doesn't hold                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "This comment might help someone."                      | The bar is rediscover-the-hard-way, not might-help. Most things might help someone.                                                           |
| "I'll fold the cleanup into my feature commit."         | Own commit, always — keeps the diff reviewable and `git blame` meaningful.                                                                    |
| "The file was already over budget before I touched it." | The audit is whole-file. Bring it under budget, or state in the report why not (byte-layout / shader-derivation exemption per `comments.md`). |
| "Deleting loses knowledge."                             | If it's genuinely load-bearing past the budget, it belongs in the spec or plan — link it, don't inline a summary that will drift.             |
| "It's a TDD-style comment naming the test case."        | Restates the test name; the test file already says that. Delete.                                                                              |
