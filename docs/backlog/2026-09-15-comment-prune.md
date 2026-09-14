# Comment prune to the 5-line header budget

> **Backlog item** · `ready` · area: Docs & process
> **Promote to:** a plan in `docs/superpowers/plans/` when picked up.
> **Runs after** the test-suite prune.

## The root fact

The module-header budget dropped 10 → 5 lines and cross-file line-number
citations are now banned
([`comments.md`](../superpowers/conventions/comments.md)), so a large part of the
tree is over budget by the current rule. The `/comment-audit` tool works well;
the problem was that it stacked onto every feature PR. Running it once, scoped by
a script, takes that cost out of the per-feature process.

This is the deliberate one-off exception to comments.md's "opportunistically,
never as a sweep" — scoped by a generated file list, not a free-hand pass over
the tree.

## Approach

1. **Script the list** — emit the files whose module header exceeds 5 lines, whose
   comment lines exceed half their code lines, or that carry a cross-file
   `file.ts:NN-MM` citation. That list is the whole scope.
2. **Agents trim only listed files.** No file outside the list is touched, and no
   behaviour changes ride along.
3. **Protected set — do not trim:** the content that landmine memories name, and
   [`RENDERER.md`](../RENDERER.md)'s hard-won WebGPU notes wherever they are
   mirrored in code. Byte-layout/wire-format headers and shader derivations keep
   their documented over-budget exemption.
4. **Every removed block longer than 3 lines is listed in the PR body**, with the
   file and what it said, so the user can veto individual removals.

## Done when

The script's list is empty or every remaining entry has a one-line justification,
and the PR body carries the removed-block list.
