# Focusability is declared twice on the same discriminant

**Area:** engine / selection · **Readiness:** needs-design

`src/services/engine/helpers/rowFocusable.ts`'s `ROW_FOCUSABLE` (an
exhaustive `Record<SelectionRow['type'], boolean>`) and
`src/services/engine/camera/focusFraming.ts:122-123`'s `zoneOfAvoidance` arm
(a `throw new Error(...)` defended by a multi-line "unreachable by
construction" comment) both encode the same fact — "this row kind carries no
world position to frame a camera on" — and nothing checks the two against
each other. Flip one without the other and the result is either a crash
inside `focusFraming` (if `ROW_FOCUSABLE` is loosened but the throw stays)
or a silently-ignored focus request (if the throw is softened but
`ROW_FOCUSABLE` still filters it out first).

The root cause is that `SelectionRow` has no type-level way to say "carries
no `x`/`y`/`z`" — every consumer that needs to know re-derives the answer by
hand. At least seven do: `ROW_FOCUSABLE`, `focusFraming`, `focusIdOf`
(`src/services/url/focusIdOf.ts`), `urlHashFor`
(`src/services/url/urlHashFor.ts`), `selectionHaloTable`
(`src/services/engine/frame/passes/selectionRingLayer.ts` and
`near0SelectionRingLayer.ts`), `detailCardTable`'s omitted `onFocus` arm, and
`focusRecession` (`src/services/engine/presentation/focusRecession.ts`).

Severity is bounded: every one of the seven sites is an exhaustive `Record`
or exhaustive `switch`, so the compiler forces a visit on every new
`SelectionRow` variant — you can answer the "is this focusable" question
inconsistently across sites, but you cannot forget to answer it anywhere.
This is the residual double-encoding left after funnelling all focus
requests through one saga (`watchFocusTweenSaga`); that funnel is not being
re-litigated here.

## Options

- Make `focusFraming` return `FocusFraming | null` instead of throwing, and
  derive `ROW_FOCUSABLE` from that function (`row => focusFraming(row) !==
null`, or equivalent) rather than as an independently hand-maintained
  table. Collapses two encodings into one, at the cost of every caller of
  `focusFraming` now handling `null`.
- Split `SelectionRow`'s union on positioned vs. unpositioned rows at the
  type level (e.g. a `PositionedSelectionRow` sub-union `galaxyCatalog |
structure | milkyWay | body | star`), so a function that only accepts
  positioned rows can say so in its parameter type instead of re-checking at
  runtime. Larger change; would let `ROW_FOCUSABLE` disappear entirely for
  callers that can be typed against the narrower union, at the cost of
  threading a second row type through the seven consumer sites.
