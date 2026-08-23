# Deletion audit — the leanness seat

A standing counter-bias against under-deletion. Correctness reviewers must treat
every line as potentially load-bearing — exactly the wrong stance for finding
surplus, which is why thorough task reviews pass over hundreds of removable lines.
This skill dispatches a dedicated read-only auditor whose burden of proof is
inverted: surplus is presumed until a line proves itself.

Calibration (13-audit experiment, 2026-08-23, PRs #623 and #570):

- **Model capability dominates.** On the identical diff and prompt, sonnet returned
  a false "clean PR" verdict (~0–25 LOC found, plus affirmative "no bloat" claims
  contradicted by every other auditor) while opus found 255–430 LOC. **Always run
  this on an opus-class model.** A cheap seat is worse than no seat — its clean
  bill reads as evidence.
- **Adversarial framing multiplies capable models without recklessness.** Framed
  audits questioned whether subsystems should exist at all; their do-not-remove
  trap lists stayed as sharp as neutral runs'.
- Framing results: **legacy time-shift** won volume on both PRs (~330 LOC on a
  6-times-pre-audited branch; ~550 risk-free on fresh ground) — its stance matches
  how cruft actually forms (scaffolding outliving its purpose). **Evidence-only**
  found less but proof-backed every claim (coverage runs, importer greps).
  **Greenfield** found the least but justified what stays and caught a spec/code
  divergence no other framing saw.

## When to run

1. **Mid-implementation** — after a fix wave (bug-fix asks add lines without
   re-thinking the task) or every handful of SDD tasks. Scope: the diff since the
   last audit, so runs stay cheap.
2. **At /feature-done** — whole branch, before the DoD verdict (feature-done's
   audit list includes this step).
3. **On demand** — "anything to delete in this PR/module?"

## How to run one

1. Generate the diff package: the SDD `review-package` script, or
   `git diff BASE..HEAD > <workspace>/audit-<range>.diff`. For merged squash
   commits, `git show <sha> > file` and audit the live tree.
2. Dispatch ONE background agent, opus-class, with the template below. Default
   framing: LEGACY. `--verified` swaps in EVIDENCE (use when findings will be
   applied with minimal human review — every claim arrives proof-backed).
   `--justify` swaps in GREENFIELD (use at /feature-done on spec-bearing features;
   its product is validation of what stays, not maximal deletion).
3. Triage and apply findings per
   [`docs/superpowers/conventions/leanness.md`](../../../docs/superpowers/conventions/leanness.md).

## Prompt template

Compose the dispatch from these blocks, in order. Fill `{...}` placeholders.

**Read-only contract (always):**

> You are a STRICTLY READ-ONLY deletion auditor on the skymap repo. No edits, no
> staging, no commits, no pushes, no subagents; scratch scripts only in {scratchpad
> dir}. You MAY run npx vitest run (targeted), npm run typecheck, and read-only
> git. Never touch the dev server. Working directory: {worktree path — stay inside}.

**Framing (pick one):**

LEGACY (default):

> Adopt this stance throughout: treat the code under audit as FIVE-YEAR-OLD LEGACY.
> The engineers who wrote it are long gone; the investigations it served are closed
> tickets nobody can reopen; every "we might need this" has had five years to come
> true and did not. Nobody's feelings are at stake and no author will defend a
> line. Your job is the classic legacy sweep: find what the intervening years have
> orphaned — instrumentation for concluded investigations, guards for callers that
> never materialized, state nobody reads, tests that pin rewritten internals,
> comments narrating dead context. The one discipline of a legacy sweep still
> binds: verify current reachability yourself (grep/tests), because legacy code's
> docs lie in both directions.

EVIDENCE (`--verified`):

> Your rule of evidence, which overrides all instinct: A CONSTRUCT SURVIVES ONLY IF
> YOU CAN NAME THE CONCRETE THING THAT FAILS WITHOUT IT — a specific test that goes
> red, a production caller that breaks, a user-visible behavior that changes. Prose
> justifications ("defensive", "for clarity", "might be needed") count for NOTHING.
> Comments are judged the same way: a comment survives only if it records something
> whose loss would cause a future editor to break something. For each construct you
> KEEP that looked removable, name the concrete failing thing that saved it — that
> list is your trap section.

GREENFIELD (`--justify`):

> STRICT ORDER. Phase 1 (before opening the diff or any implementation file): read
> the spec at {spec path}; from the spec ALONE write the minimal implementation YOU
> would design (names, signatures, where state lives, rough LOC) to a scratch file.
> Phase 2: only now read the diff; every element present in the actual but absent
> from your sketch must justify itself (name the real requirement or landmine your
> sketch missed) or become a deletion candidate. Report where your sketch was naive
> and the actual is right — honesty in both directions.

**Task context:** one paragraph — PR/range, what the change does, and the diff
file path. Add the project's ruling philosophy line: code is liability; deletion
beats addition; speculative generality, extra knobs/constants, parallel paths, and
unjustified comments are findings.

**Hunt categories (always):** dead/unreachable code · speculative generality
(callers that don't exist) · redundant/derivable state · duplicated logic (but no
merges that braid independently-varying concerns) · collapsible constants/knobs ·
tests that can never fail on a real bug no other check catches (mirror / clamp /
restatement per `docs/superpowers/conventions/testing.md`) · comments over budget
(header ≤10 lines, ≤half code) that restate rather than record landmines/units/
contracts · debug/UI surface without a story.

**Scope fencing (always, fill in):** list settled rulings, ledgered deferred
minors, deliberate comment-guarded oddities, and user-requested scaffolding —
"question rows, not the panel". Without fencing the audit re-litigates history.

**Output contract (always):**

> For each candidate: file:line, what to delete, LOC saved, why safe (who you
> verified does NOT depend on it), risk. Rank by LOC-saved × confidence. Be honest
> when the answer is "little to remove" — do not manufacture findings. Return:
> ranked candidate list; one-line realistic net LOC removable; do-NOT-remove traps
> you noticed (with why).

## Anti-patterns

- **Running it on a cheap model.** Sonnet's false clean bill is the measured
  failure mode; it actively misleads.
- **Quota framing** ("cut at least N lines"). Manufactures tail findings; the
  honest-null clause exists for a reason.
- **Letting the implementer self-audit.** The surplus is invisible from inside the
  context that wrote it (same blindness refactor-ground's greenfield cross-check
  exists for).
- **Auto-applying the report.** The audit finds; application follows the triage in
  `leanness.md` — behavior changes and debug surface are the user's rulings.
- **Skipping the fencing block.** An unfenced audit spends its tokens re-arguing
  settled design decisions.
