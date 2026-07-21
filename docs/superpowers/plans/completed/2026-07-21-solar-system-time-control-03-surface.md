# Solar-system time control — 03 · Surface plan

> **Status.** Plan drafted 2026-07-21 against the approved spec
> `docs/superpowers/specs/2026-07-21-solar-system-time-control.md` (surface =
> spec §6, §9, §12 step 3) and the grill session
> `docs/grill-sessions/solar-system-time-control-2026-07-21.md` (Q8, Q10, Q12).
> **Worktree.** `solar-system-time-control`.
> **PR.** Executes on **one PR (#472)** as ordered commits **after** the 02-core
> commits, on the same branch. Draft PR already open from the first core task.
> **Execution.** `subagent-driven-development` — a **fresh implementer subagent
> per task**, each running spec + quality review before the commit lands.

## What this plan is (and is not)

This is the **UI surface** for the sim clock: the TimeBar instrument, exact date
entry, the `t=` URL param, InfoCard live rows, and keyboard shortcuts. It is a
thin reactive skin over machinery that **01-prep** and **02-core already landed**
on this branch. This plan writes **zero** engine/ephemeris code.

### Preconditions — assumed landed on the branch before Task 1

Read the landed code for exact symbol names; the names below are the spec's, and
02-core may have refined them. **Every task that references a 02-core symbol must
first `grep` the branch for the real export** rather than trusting this list.

- **01-prep A** — `BodyState` + `deriveBodyStates(simDays)` snapshot; all body
  consumers read the snapshot.
- **01-prep B** — `useUrlSync` generalized into a **multi-param, `&`-separated
  seam** with per-param **sources** (`focus` is the first source). Task 5 adds
  the `t` source; **the implementer reads the post-prep `useUrlSync.ts` for the
  seam's real registration API** (a source array, a `{ compose, parse }` pair per
  param, or whatever Prep B shipped — do not invent it).
- **02-core** — the time intent slice under `state/time/` (`mode`,
  `anchor{simDays,realMs}`, `rateIndex`, `direction`, `paused`) with re-anchoring
  intent actions (`setDate`, `setRate`/`stepRate`, `pause`, `resume`, `goLive`);
  `RATE_LADDER` data table (`src/data/time/rateLadder.ts`); the pure
  `deriveSimDays(intent, nowMs)` in `services/engine/time/simClock.ts`; and the
  **throttled time-status publication** (few-Hz, dedup-on-write; the
  `engineScaleChanged` idiom — see `src/state/engine/engineSlice.ts:95`) carrying
  derived `simDays`. Task 6 needs the pub to also expose the selected body's
  snapshot-derived time-dependent values — see that task's **02-core dependency**
  note.

### Conventions every task obeys

- **Components** (Tasks 2, 4): the implementer **must load the `create-component`
  skill first** — own folder, `<Name>.tsx` + `<Name>.module.css`, one component
  per file, `function Name(){}` + `export default Name`, top-level `.root` class,
  `cx` for composed `className`, shared vocabulary via `composes` (never
  `:global`), no barrels, no `src/styles/global.css` edits.
- **Store boundary** (Task 3): presentational TimeBar imports **nothing** from
  `store/`/`state/`/`services/`; a paired `TimeBarContainer` in
  `src/components/containers/` owns every `useAppSelector` + every handler as
  `useCallback(…, [dispatch])`, `export default memo(...)` — see
  `containers/AutoRotateToggleContainer.tsx` and `containers/README.md`.
- **Component tests: behavior only** — dispatch-on-click, readout formatting,
  mode-dependent visibility. **No render snapshots** (testing.md). Type every mock
  callback `vi.fn<() => void>()`, never bare `vi.fn()`. The `datetime-local` input
  carries a string `value`, so drive it with `fireEvent.change` (the checkbox
  `fireEvent.click` exception does not apply here — testing.md "React component
  test gotchas").
- **Utils**: one function per file, filename = export name, deep relative imports,
  behavior test with a **hand-computed** expected value (never a mirror of the
  implementation).

---

## Task 1 — `formatSimClock` readout formatter util

**Files:** `src/utils/time/formatSimClock.ts` (new),
`tests/utils/time/formatSimClock.test.ts` (new).

The readout renders a wall-clock instant. simDays is JD-like float64 days;
converting simDays → `Date` is 02-core's job (it already needs Date↔simDays for
`setDate` and the anchor). **Grep the branch first** for an existing
`simDaysToDate` / `dateToSimDays` (likely `services/engine/time/` or
`utils/time/`); reuse it. Only add the conversion here if 02-core shipped none —
and if so, add it as its own one-function util (`utils/time/simDaysToDate.ts`)
with an independent hand-computed round-trip test, not folded into the formatter.

**Signature:** `formatSimClock(date: Date): string`
**Behaviour:** a compact UTC date-time readout, e.g. `2026-11-03 18:00 UTC`. Fixed
UTC (matches the `t=` param's UTC encoding — Task 5); no locale/timezone drift.

- [x] Add test `formatSimClock renders a UTC date-time` — a `Date` built from a
      known UTC instant → the exact expected string (hand-written, not derived
      via the same `toISOString` call the impl uses).
- [x] Add test `formatSimClock is stable across host timezone` — same instant
      formats identically regardless of `TZ` (guards an accidental local-time
      slip).
- [x] Implement.
- [x] `npm test -- formatSimClock` green. Commit.

## Task 2 — TimeBar presentational component

**Files:** `src/components/TimeBar/TimeBar.tsx` (new),
`src/components/TimeBar/TimeBar.module.css` (new),
`src/components/TimeBar/TimeBar.test.tsx` (new). **Load `create-component` first.**

Pure presentational instrument. All state + dispatch arrive as props (Task 3
supplies them). **Zero** imports from `store/`, `state/`, `services/`, or any
engine module.

**Props (pin this contract):**

```ts
export type TimeBarProps = {
  readonly readout: string;          // preformatted, from Task 1
  readonly rateLabel: string;        // e.g. '1 day/s' (RATE_LADDER row label)
  readonly mode: 'live' | 'manual';
  readonly paused: boolean;
  readonly onSlower: () => void;     // step toward slower rate  ( [ )
  readonly onFaster: () => void;     // step toward faster rate  ( ] )
  readonly onPlayPause: () => void;  // toggle paused            ( \ )
  readonly onNow: () => void;        // goLive                   ( Shift+N )
  readonly onReadoutClick: () => void; // opens the date-entry popover (Task 4)
  readonly hidden?: boolean;         // App-layout gate, mirrors other HUD pills
};
```

**Behaviour:**
- Renders the readout (click → `onReadoutClick`), reverse-step, play/pause,
  forward-step controls, and the current `rateLabel`.
- **`now` button** renders **only when `mode === 'manual'`** (and is the lit/active
  affordance) — hidden in live mode (grill Q10).
- **Live mode collapses to the readout alone**; the step/play controls are revealed
  on hover/tap (CSS `:hover`/`:focus-within` on `.root`, controls hidden by
  default in live). Manual mode always shows controls.
- Compose the buttons from `common/PillButton` / `common/Button` where they fit;
  do not hand-roll a new button primitive.

**Placement is a [USER VISUAL GATE — deferred, user AFK] task, not CSS guesswork.**
Pick a sensible default corner (top-center or bottom-center, clear of InfoCard
top-right and ScaleBar bottom-right) and **leave a `TODO(visual-gate)` comment**
naming the open question (corner + clearances vs InfoCard/ScaleBar/NavigationPanel).
Do not tune spacing blind.

- [x] Add test `TimeBar fires onFaster/onSlower/onPlayPause on the step buttons`
      (three targeted assertions, one dispatch each; mocks typed `vi.fn<() => void>()`).
- [x] Add test `TimeBar shows the now button only in manual mode` — asserts the
      control is absent for `mode='live'`, present for `mode='manual'`.
- [x] Add test `TimeBar renders the readout and fires onReadoutClick`.
- [x] Add test `TimeBar reflects paused state on the play/pause control`
      (aria-label / pressed state flips with `paused`).
- [x] Implement `.tsx` + `.module.css` (`.root` + control classes).
- [x] `npm test -- TimeBar` green. Commit.

## Task 3 — TimeBarContainer (store boundary + live readout tick)

**Files:** `src/components/containers/TimeBarContainer.tsx` (new),
`src/components/containers/TimeBarContainer.test.tsx` (new),
`src/components/App/App.tsx` (mount it inside the `uiStack` HUD wrapper — see
`App.tsx:241-288`).

Owns all store reach for the TimeBar. Subscribes the **time intent slice
selectors** (`mode`, `paused`, `rateIndex`→label, `anchor`) and the **throttled
time-status pub** (`simDays`); maps intent actions to the prop handlers; formats
the readout via Task 1.

- **Readout ticking (spec §8/§9).** The pub updates a few Hz while playing but
  only every few seconds while live-idle. So the container runs its own **1 Hz
  interval** that re-derives the displayed instant from the slice `anchor` +
  `performance.now()` via 02-core's **pure** `deriveSimDays` (in
  `src/utils/time/deriveSimDays.ts`) → `Date` → `formatSimClock`. The time base
  MUST be `performance.now()` — `anchor.realMs` is a `performance.now()` stamp
  (02-core Task 2/3); deriving against `Date.now()` produces garbage simDays.
  Keeps the clock visibly moving without per-frame Redux.
  Put the interval + derivation in a small `useTimeReadout` hook inside this file.
- **Handler mapping** (verify real action names on the branch): `onSlower`/`onFaster`
  → `stepRate(-1)` / `stepRate(+1)` (or `setRate` against the neighbouring ladder
  index); `onPlayPause` → `paused ? resume() : pause()`; `onNow` → `goLive()`;
  `onReadoutClick` → opens the date-entry popover (Task 4 owns the open state —
  keep that local UI state in the container or a wrapping component, not the store).
- `export default memo(TimeBarContainer)`; every handler `useCallback(…, [dispatch, …])`.

- [x] Add test `TimeBarContainer dispatches goLive on now` — render with a mock
      store in `manual`, invoke the now handler, assert the `goLive` action
      dispatched. Use the store-test idiom already in `containers/*.test.tsx`.
- [x] Add test `TimeBarContainer dispatches pause/resume from the play toggle`
      (paused=false → `pause`; paused=true → `resume`).
- [x] Add test `TimeBarContainer maps rateIndex to the RATE_LADDER label`.
- [x] Implement container + `useTimeReadout`; mount in `App.tsx` HUD wrapper (behind
      the same `hidden={paletteOpen || splashVisible}` gate the sibling pills use).
- [x] `npm test -- TimeBarContainer` + `npm run typecheck` green. Commit.

## Task 4 — Exact date-entry popover

**Files:** `src/components/TimeBar/DateEntryPopover/DateEntryPopover.tsx` (new),
`.module.css` (new), `.test.tsx` (new); wire open/close + commit through the
container (Task 3). **Load `create-component` first.**

Clicking the readout opens a small popover with a **native
`<input type="datetime-local">`** (single native input covers date + time — the
codebase has **no** date-picker / popover primitive; confirmed by grep, so do not
build a calendar widget). Committing the input **re-anchors via `setDate`**,
which puts the clock in manual mode at that instant.

**Props (pin this contract):**

```ts
export type DateEntryPopoverProps = {
  readonly initial: Date;              // current sim instant, seeds the input
  readonly onCommit: (instant: Date) => void; // → container dispatches setDate
  readonly onCancel: () => void;
};
```

**Behaviour:** seed the input from `initial` (as a `datetime-local` string, UTC);
Enter / a Set button → `onCommit(parsedDate)`; Esc / click-outside → `onCancel`.
Interpret the input as UTC (consistent with the readout + `t=` param).

- [x] Add test `DateEntryPopover commits the parsed instant` — `fireEvent.change`
      the input to a known value, trigger commit, assert `onCommit` called with the
      matching `Date` (mock typed `vi.fn<(d: Date) => void>()`).
- [x] Add test `DateEntryPopover cancels on Esc`.
- [x] Implement; container dispatches `setDate` on commit and closes the popover.
- [x] `npm test -- DateEntryPopover` green. Commit.

## Task 5 — URL `t=` param source

**Files:** the post-prep `src/hooks/useUrlSync.ts` (add the `t` source to the
seam) + its test file; **read Prep B's landed seam API first** and register `t`
the way `focus` is registered — do not restructure the seam.

**Encoding (spec §6, grill Q8):**
- **Manual mode ⇒ `t=<ISO 8601 UTC>`** (e.g. `#focus=body-jupiter&t=2026-11-03T18:00Z`).
- **Live mode ⇒ param absent.** A bare URL means "now", forever.
- **Written only on anchor changes** — the compose reads manual-mode state; live
  composes to nothing. (Pause re-anchors, so "pause, then share" crystallizes the
  moment — no per-frame writer.)
- **Restore:** parsing a valid `t` lands the clock in **manual mode, paused** at
  that instant (a shared link is a specimen). End state: `mode==='manual'`,
  `paused===true`, `deriveSimDays(now) === instant`. Dispatch the branch's
  restore path — `setDate(instant)` then `pause()`, or a single core action if one
  exists; **grep before assuming**.
- **Invalid / unparseable `t` ⇒ ignored** — no dispatch, clock stays live
  (bare-URL semantics). This is the decided behaviour; test it.

Keep the interesting logic in **pure helpers** (the seam already does this so
Vitest's node env can test without a DOM — see `computeDesiredHash` in the
pre-prep `useUrlSync.ts:90`).

- [x] Add test `t compose emits t=<ISO> in manual mode` and
      `t compose emits nothing in live mode`.
- [x] Add test `t parse restores manual+paused at the instant` (assert the
      dispatched action(s) / resulting state).
- [x] Add test `invalid t is ignored and stays live` (garbage value → no time
      dispatch).
- [x] Add round-trip test `focus + t compose/parse together`, plus `focus alone`
      and `t alone` (each param independent on the `&`-seam).
- [x] Implement the `t` source; `npm test -- useUrlSync` + `npm run typecheck`
      green. Commit.

## Task 6 — InfoCard live time-dependent rows

**Files:** `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx` (the actual
row-builder — cite `BodyDetailCard.tsx:80-84`, the non-star body section that
today renders only the static **Radius** row) + a paired container for the store
reach; test file.

Today a focused solar-system body shows **only Radius** (an identity row, static).
Time-dependent rows must **re-derive from the throttled time-status publication**,
reading snapshot-derived values (never recomputed independently — spec §9, Q12).
Identity rows (label, radius, aliases, and the whole famous-star sidecar branch)
are **untouched**.

**Scope:** wire the **distance** row (a body's distance swings as it orbits) to
the pub; include **phase / apparent magnitude** rows **only where the pub actually
exposes them** ("where shown"). Do **not** invent a phase/apparent-mag derivation
here — that is ephemeris/core math. If those values aren't published, ship the
distance row and leave a one-line note; phase is then out of this surface plan.

**02-core dependency (flag, don't silently work around):** the throttled pub must
carry the **selected body's snapshot-derived distance** (and phase where shown),
not just `simDays` — otherwise a presentational card can't re-derive without
importing the snapshot/engine, which the store-boundary rule forbids. If 02-core's
pub only publishes `simDays`, **stop and surface it**: extending the pub to include
the selected body's derived values is a small 02-core change to coordinate on the
same branch, not something to hack into the card. The presentational
`BodyDetailCard` stays pure; a `BodyDetailCardContainer` (or the existing InfoCard
wiring) subscribes to the pub and passes the live values as props.

- [x] Add test `BodyDetailCard distance row updates from the time-status pub` —
      change the published value, assert the rendered distance changes; identity
      rows (Radius, label) unchanged.
- [x] Add test `identity rows do not subscribe to the pub` — a pub tick with the
      same body leaves Radius/label render output stable (targeted, not a snapshot).
- [x] Implement the minimal repoint (container subscribes pub → props; card renders
      the time-dependent row(s) from props).
- [x] `npm test -- BodyDetailCard` + `npm run typecheck` green. Commit.

## Task 7 — Keyboard shortcuts

**Files:** `src/hooks/useKeyboardShortcuts.ts` + its test file.

**Do NOT migrate to the shortcuts saga** (that is a separate backlog item) — extend
the existing hook in place, matching its current structure.

**Free-key verification (first checkbox — the actual gate, not a formality):**
re-check the live taken-key map in `useKeyboardShortcuts.ts` (currently: Cmd/Ctrl+K,
`/`, Esc, `f`/`F`, `h`/`H`, Tab, `l`, `d`/`D`). 02-core may have added keys — grep
the branch. The spec proposes `[` slower · `]` faster · `\` play/pause · `Shift+N`
now; all four were free at plan time. If any is now taken, pick an adjacent free key
and note the swap.

**Wiring:** `[` → `stepRate(-1)`; `]` → `stepRate(+1)`; `\` → play/pause (paused
toggle); `Shift+N` → `goLive`. Route through the existing dispatch (`useAppDispatch`)
and the same `time/` actions the container uses. The hook's **form-field guard**
(`useKeyboardShortcuts.ts:48-58`) already excludes typing into the date-entry input —
keep that first-return in place.

- [x] First: verify/adjust the four keys against the current taken map; record the
      final mapping in the hook's docblock.
- [x] Add test `[ and ] step the rate` (keydown → `stepRate` ∓1).
- [x] Add test `\ toggles play/pause` and `Shift+N goes live`.
- [x] Add test `time keys are ignored while a form field is focused` (guard holds).
- [x] Implement; `npm test -- useKeyboardShortcuts` + `npm run typecheck` green. Commit.

## Task 8 — Entanglement-radar review over the surface diff

**Load the `entanglement-radar` skill** and run it over the whole surface diff
(Tasks 1–7). Targets to scrutinize:
- The readout-tick derivation living in **two** places (throttled pub vs the
  container's 1 Hz `deriveSimDays` interval) — is that an essential redundancy
  (idle-tick smoothing) or an accidental second source of truth?
- The `t`-param compose/parse vs the slice's re-anchor logic — no duplicated
  ISO↔simDays conversion; both route through the one Date↔simDays util.
- TimeBar mode-visibility branching (`live` collapse, `now`-in-manual) — a table
  or a clean predicate, not scattered `mode ===` checks across component + container.
- Any time-dependent value recomputed in the card instead of read from the pub
  (the Q12/§4 single-source rule).

- [x] Run the skill; fix or explicitly justify each flagged knot in a short
      review note appended to this plan (or a follow-up commit).
- [x] Final `npm run typecheck` + full `npm test` green. Commit.

---

## Testing summary (what NOT to test — testing.md)

- No render snapshots of TimeBar / cards; targeted behavior assertions only.
- No `RATE_LADDER` table restatement; no re-blessing of the readout format string
  beyond the one hand-computed formatter test.
- No clamp-boundary tests on the rate-index step (02-core owns ladder bounds).
- Keep: the `t` param round-trip (parse∘compose), the invalid-`t` regression, the
  form-field-guard test (guards a real hijack bug), the formatter's timezone-stability
  test.
