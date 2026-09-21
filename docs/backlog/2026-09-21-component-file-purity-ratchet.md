# Extend the file-purity ratchet to `src/components/`

## The problem

A component file's **inline types** are already ratcheted (`noInlineTypes.test.ts`
+ the `INLINE_TYPE_FILES` ledger). Its **module-private helper functions** are
not gated anywhere, so they accumulate where nothing objects. The convention
they violate is CLAUDE.md's "one symbol per file… a generic helper growing
inside another file gets extracted to `utils/<area>/<fn>.ts`".

This surfaced when `src/components/DebugPanel/CameraStateSection.tsx` was found
carrying five module-private helpers (`num`, `deg`, `modelOf`, `copyTextOf`,
`poseSnippetOf`). One had been added that week by an agent with nothing
objecting — the argument for a ratchet over a review note. (Its three inline
types were on the `INLINE_TYPE_FILES` allow-list, i.e. already ledgered debt;
clearing them shrank that list, as its ratchet requires.)

## Why the existing sweeps miss it

Six convention tests exist in `tests/conventions/`. For a private helper in a
component, all six pass:

| sweep | covers | why it misses a component's private helper |
| --- | --- | --- |
| `oneSymbolPerFile.test.ts` | `src/utils/` | counts only **exported** function-shaped declarations; these are module-private, and components are not a sweep root |
| `frameFilePurity.test.ts` | `src/services/engine/frame/`, `timing/`, `passes/`, every Layer's `passes/` | exactly the right shape — it *does* catch private helpers — but `src/components/` is not a sweep root |
| `noInlineTypes.test.ts` | inline `type`/`interface` anywhere outside a types home | **types only** — this is the one that already covers components |
| `typeFilesAreDeclarations` · `filenameMatchesExport` · `layerImportBoundary` | `@types/`, filenames, Layer imports | orthogonal |

So the gap is precisely: **`frameFilePurity`'s rule, applied to
`src/components/`**. `frameFilePurity.test.ts`'s own header states the rationale
verbatim — helpers inlined beside a symbol "are invisible to the rest of the
codebase and untestable alone, and agents keep re-adding them — hence a ratchet
rather than a review note."

## Verified current state (2026-09-21, after `CameraStateSection` was cleared)

Read-only ts-morph sweep over `src/components/` (146 files), counting top-level
function-shaped declarations whose name is not the file's own symbol:

- **15 offender files, 22 stray functions.**
- **11 of the 15 have exactly one** — the tail is shallow, so most of the
  allow-list could be cleared by extraction rather than permanently exempted.

| file | stray functions |
| --- | --- |
| `TimeBar/DateEntryPopover/DateEntryPopover.tsx` | `pad2`, `toDatetimeLocalUtc`, `parseDatetimeLocalUtc` |
| `common/Slider/Slider.tsx` | `decimalsForStep`, `clamp`, `snapToStep` |
| `containers/TimeBarContainer.tsx` | `readoutInstant`, `formatReadout`, `useTimeReadout` |
| `DebugPanel/SlotRow.tsx` | `describe`, `timing` |
| 11 more | one each — `percentOf`, `deriveCosmicWebStyle`, `LabelledSlider`, `useHoldRepeat`, `earliestStartMs`, `hysteresisReadoutOf`, `formatLonLat`, `metres`, `SearchIcon`, `formatEv`, `formatMB` |

`Slider.tsx`'s `clamp` and `DebugPanel`'s `metres`/`formatLonLat`/`formatEv`/
`formatMB` are the strongest extraction candidates — generic enough that
duplicates may already exist under `src/utils/`. Check before creating siblings.

## The design question that must be answered first

**Not every hit is an offender**, and a sweep that does not carve these out will
generate busywork:

1. **Component-local hooks.** `useHoldRepeat` in `TimeBar.tsx`,
   `useTimeReadout` in `TimeBarContainer.tsx`. Arguably legitimate co-residents
   of their one consumer rather than helpers to evict — a hook is not a generic
   helper, and moving it to `utils/` would be wrong. Needs a ruling.
2. **Component-local sub-components.** `LabelledSlider` in `VolumeFieldRow.tsx`,
   `SearchIcon` in `SearchTrigger.tsx`. Function-shaped, but they are components,
   and the convention's home for a component is its own `.tsx`, not `utils/`.
   Either exempt them by shape (returns JSX) or evict them to sibling `.tsx`
   files; the sweep must not push them into `utils/`.

A sweep that ignores both would generate busywork and wrong moves, so settle
them before writing it. Note the type-side carve-out `oneSymbolPerFile`'s header
already grants — "co-located `export const` sizing constants and `export type`
input shapes beside the one function are likewise fine" — is the precedent to
reason from.

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
