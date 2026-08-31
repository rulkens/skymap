Dispatch blocks for the deletion-audit skill — compose in this order, fill
`{...}` placeholders. See SKILL.md for when/how.

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
> ranked candidate list; realistic net LOC removable, src and tests split;
> do-NOT-remove traps you noticed (with why).
