# Extend the file-purity ratchet to `src/components/`

## The problem

`src/components/` has no per-file purity gate, so helpers and types accumulate
inside component files where nothing objects. The convention they violate is
CLAUDE.md's: one symbol per file in `utils/`, one type per `@types/` file, and
"types never live inline in implementation files (a React component's own
`Props` is the one exception)".

This surfaced when `src/components/DebugPanel/CameraStateSection.tsx` was found
carrying five module-private helpers (`num`, `deg`, `modelOf`, `copyTextOf`,
`poseSnippetOf`) and three inline types (`DofModel`, `RawRow`, `PanelModel`).
One of those helpers had been added the same week by an agent, with no check
objecting — which is the argument for a ratchet over a review note.

## Why the existing sweeps miss it

Three convention tests exist and none reaches a component file:

| sweep | covers | why it misses this |
| --- | --- | --- |
| `tests/conventions/oneSymbolPerFile.test.ts` | `src/utils/` | counts only **exported** function-shaped declarations; these helpers are module-private |
| `tests/services/engine/frame/frameFilePurity.test.ts` | `src/services/engine/frame/`, `timing/`, `passes/`, and every Layer's `passes/` | right shape — it does catch private helpers — but `src/components/` is not a sweep root |
| `typeFilesAreDeclarations` / `inlineTypeFiles` | `@types/` | types only |

`frameFilePurity.test.ts`'s own header states the rationale that applies here
verbatim: helpers inlined beside a symbol "are invisible to the rest of the
codebase and untestable alone, and agents keep re-adding them — hence a ratchet
rather than a review note."

## Verified current state (2026-09-21)

A read-only ts-morph sweep over `src/components/`, counting top-level
function-shaped declarations and type aliases whose name is neither the file's
own symbol nor its `Props`:

- **146 files scanned, 25 offenders, 46 stray symbols.**
- **14 of the 25 have exactly one stray symbol** — the tail is shallow, so over
  half the allow-list could be cleared by extraction rather than exempted.

Worst offenders:

| file | stray |
| --- | --- |
| `DebugPanel/CameraStateSection.tsx` | 5 fns + 3 types |
| `InfoCard/detailCardTable.ts` | 3 types |
| `TimeBar/DateEntryPopover/DateEntryPopover.tsx` | 3 fns |
| `common/Slider/Slider.tsx` | 3 fns |
| `containers/TimeBarContainer.tsx` | 3 fns |

(`CameraStateSection.tsx` is being cleared separately, on the search-palette-tabs
PR3a branch — re-run the sweep before seeding the allow-list.)

## The design question that must be answered first

**Not every hit is an offender**, and a sweep that does not carve these out will
generate busywork:

1. **A function's own input/output shape beside it.** `usePaletteSearch.ts`
   declaring `UsePaletteSearchInput`/`UsePaletteSearch`;
   `scoreFamousMatch.ts` declaring `ScorableEntry`;
   `scoreAliasMatch.ts` declaring `ScorableAliasEntry`. `oneSymbolPerFile`'s
   header already blesses exactly this for `src/utils/` — "co-located
   `export const` sizing constants and `export type` input shapes beside the one
   function are likewise fine." The components sweep should inherit that rule,
   not contradict it.
2. **Component-local hooks.** `useHoldRepeat` in `TimeBar.tsx`,
   `useTimeReadout` in `TimeBarContainer.tsx`. Arguably legitimate co-residents
   of their one consumer rather than helpers to evict. Needs a ruling.

## Approach

The machinery already exists — this is a new sweep root plus an allow-list, not
new infrastructure. Reuse `tests/helpers/conventions/`: `parseOnlyProject`,
`exportedDeclarations`, `isFunctionShaped`, `walkFiles`.

Follow `frameFilePurity.test.ts`'s ratchet discipline exactly: `ALLOWED` keyed
`<swept dir>/<file>`, seeded from the live tree rather than assumed, and rows
only ever go DOWN.

Local precedent for where an evicted helper goes:
`src/components/DebugPanel/loadStateColorClass.ts` — a plain colocated `.ts`
beside the components. Generic formatters belong in `src/utils/format/` instead
(check for duplicates first: `formatScalar.ts` already exists).
