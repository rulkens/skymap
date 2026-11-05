# Convention sweeps report one test per source file

Six invariants in `tests/conventions/` are reported as **5,214 of the suite's
13,413 tests** (39%), because four of them call `it.each(everyMatchingFile)`.
The count tracks file count, not coverage: a refactor that creates 16 files
and writes no tests moves the headline by +64.

## Measured 2026-09-21 (branch `worktree-layer-state-restructure`, `40626d5fa`)

| file                                | tests | shape                                          |
| ----------------------------------- | ----- | ---------------------------------------------- |
| `noInlineTypes.test.ts`             | 2,445 | `it.each(files)` + `it.each(INLINE_TYPE_FILES)` |
| `typeFilesAreDeclarations.test.ts`  | 1,780 | two `describe`s, each a pair of `it.each`       |
| `filenameMatchesExport.test.ts`     | 492   | `it.each` over `src/utils/`                    |
| `oneSymbolPerFile.test.ts`          | 492   | `it.each` over the same list                    |
| `layerImportBoundary.test.ts`       | 2     | one `assertSweep`, offenders joined             |
| `staticWeslHasNoBacktick.test.ts`   | 2     | one sweep                                       |

The bottom two rows are the same kind of check reported the other way:
`assertSweep` (`layerImportBoundary.test.ts:69`) collects every offender and
joins them into a single failure message. Nothing is lost — a failure still
names each offending file — and it is 2 tests rather than 492.

## Why it matters

Real coverage changes are invisible against a five-thousand-case floor that
moves whenever a file is added or deleted. The suite was described as
"600+ files" in `CLAUDE.md` and is now 1,355; the test count has drifted the
same way for the same reason.

Not a wall-clock problem: `tests/conventions/` runs in seconds.

## What the conversion has to preserve

These are **two-way ratchets**, and the reverse direction is the easy thing to
lose. Each file pairs a forward sweep with a second `it.each` over the
allow-list asserting each row *still violates* the rule
(`typeFilesAreDeclarations.test.ts:57`, `:68`; `noInlineTypes.test.ts:49`).
That is what makes the allow-list shrink-only — drop it and the ratchet
becomes one-way and silently rots. Both directions need an `assertSweep`.

## Collision to check before picking this up

Another session owns a locked `refactor-types-leaf-dts` worktree that is
actively converting files toward `.d.ts` and editing
`TYPE_FILES_PENDING_DTS` in `typeFilesAreDeclarations.test.ts`. Rewriting that
file's structure underneath it would conflict badly. Sequence after it lands,
or scope this to the other three files first.

## Scope

Four files. No `src/` change. Suite headline drops by roughly 5,200 with zero
coverage change, so land it alone — a diff that also moves real tests would
make the number impossible to read.
