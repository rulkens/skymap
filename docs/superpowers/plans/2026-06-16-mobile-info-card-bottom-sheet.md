# Mobile info-card bottom sheet — implementation plan

**Spec:** `docs/superpowers/specs/2026-06-07-mobile-info-card-bottom-sheet-design.md`
**Date:** 2026-06-16
**Status:** Ready to execute

REQUIRED SUB-SKILL: superpowers:subagent-driven-development

---

## Goal

On mobile (< 768 px) the selected-target info card becomes a **bottom sheet** so
the galaxy/structure it describes stays visible in the centre of the canvas. The
sheet has two scroll-snap states — a ~2-line **peek** (headline + survey badge +
one distance line) and an **expanded** state (~75 vh) showing the full existing
detail-card body scrolling internally. Desktop (≥ 768 px) is byte-for-byte
unchanged. The scale bar lifts above the peek while a selection is present.

## Architecture

Three deliberately un-braided choices from the spec, which the implementer MUST
preserve (do not re-complect them):

1. **The peek is the top slice of the *same* detail card** — NOT a second
   component or a copy of the headline. `MobileSheet` wraps the existing
   `GalaxyDetailCard` / `StructureDetailCard` / `MilkyWayDetailCard` (whichever
   `DETAIL_CARD[selected.type].Detail` renders) and reveals only its top via the
   collapsed snap. There is no peek-specific markup to keep in sync with the
   detail body.
2. **The gesture is pure CSS scroll-snap.** A `position: fixed; inset: 0`
   scroll container with `scroll-snap-type: y mandatory` and two snap children
   (a transparent spacer = peek snap, and the sheet = expanded snap) owns the
   drag, momentum, and snapping. JS touches the gesture in exactly two places:
   the scroll-reset `useEffect` (keyed on the selected target identity), and the
   `hasSelection` class on the UI-stack root. Nothing else.
3. **Peek height is ONE CSS token** (`--mobile-sheet-peek`) consumed by both the
   snap geometry and the scale-bar lift. Never two literals.

JS reads the breakpoint via a new `useIsMobile()` `matchMedia` hook (see the
"useIsMobile vs CSS" judgement note below) only for: (a) choosing the
mobile render branch in `InfoCard`, and (b) emitting the `hasSelection` class in
`App`. All *layout* is CSS media queries — no JS `isMobile` branch where a media
query suffices.

### Hover on mobile

Touch has no hover. On mobile the sheet renders **only `selected`** and ignores
`hovered` (no `CompactCard` / stacked pair). `InfoCard` already returns `null`
when nothing is selected; the mobile branch returns `null` when `selected` is
`null` regardless of `hovered`.

### Judgement calls (flagged for review)

- **useIsMobile vs CSS — chose a JS `matchMedia` hook.** Rationale: the render
  *branch* genuinely cannot be a media query — `InfoCard` must mount a different
  React subtree (`MobileSheet` wrapping one card vs. today's stack), and the
  `hasSelection` class is React-driven. `App`'s existing `initialMobile`
  (`App.tsx:331`) is a one-shot `useState` sampled at mount and is intentionally
  NOT reactive to resize/rotate; reusing it would leave the sheet stale if the
  device rotates across the breakpoint. A small live `useIsMobile()` hook keyed
  on `matchMedia('(max-width: 768px)')` is the minimal reactive read. We do NOT
  touch `initialMobile` (its consumers — `NavigationPanel`/`SettingsPanel`
  default-open — keep the one-shot semantics the spec preserves). Layout stays
  pure CSS; the hook gates only the two things CSS can't express.
- **Milky Way arm.** `selected` can be a `MilkyWayInfo` (the third
  `DETAIL_CARD` arm). The spec only specifies peek content for galaxy and
  structure, but because choice (1) makes the peek "the top slice of the same
  card," `MobileSheet` is card-agnostic and the Milky Way card gets a peek for
  free from its own natural top. `MilkyWayDetailCard` uses its OWN module
  (`MilkyWayDetailCard.module.css`, `.topRow`/`.glyph` shape) rather than the
  shared `DetailCard.module.css` headline — so the peek-clamp CSS must live at
  the **sheet** level (clamp the scroll container's collapsed snap), not be
  authored per-card-class. This is consistent with the spec's `DetailCard.module.css`
  mobile block (which restyles the shared galaxy/structure card top inside the
  sheet) while the Milky Way card simply rides the sheet's snap geometry.
- **Breakpoint = 768 px**, reused from `App.tsx:331` and the `App.module.css`
  `@media (max-width: 768px)` block (`App.module.css:115`). Do not invent a new
  breakpoint.

## Tech stack

React + TypeScript + CSS modules. Tests: Vitest + `@testing-library/react` in
jsdom, mocking `window.matchMedia`. No engine/data/WGSL changes.

---

## Files

| File | Create / modify | Single responsibility |
| --- | --- | --- |
| `src/hooks/useIsMobile.ts` | **create** | Reactive `boolean` — true below 768 px, via `matchMedia`. |
| `src/components/InfoCard/MobileSheet/MobileSheet.tsx` | **create** | Scroll-snap bottom-sheet container + spacer + grab handle + scroll-reset effect; wraps an arbitrary detail-card child. Knows nothing about *which* card. |
| `src/components/InfoCard/MobileSheet/MobileSheet.module.css` | **create** | Sheet geometry: fixed scroll container, snap children, peek clamp (consumes `--mobile-sheet-peek`), spacer `pointer-events: none`, sheet `pointer-events: auto`. |
| `src/components/InfoCard/InfoCard.tsx` | modify | Add the mobile branch (`useIsMobile()` → render `MobileSheet` wrapping the single `selected` detail card, `hovered` ignored). Desktop branch untouched. |
| `src/components/InfoCard/DetailCard.module.css` | modify | Mobile-only media block: inside the sheet, restyle the shared galaxy/structure card top so headline + one compact distance line form the peek and the rest flows below. No desktop rule changes. |
| `src/styles/global.css` | modify | Add `--mobile-sheet-peek` token (in the layout-tokens group near `--corner-offset`, `global.css:286-291`). |
| `src/components/App/App.tsx` | modify | Apply `hasSelection` class to the UI-stack root when `selected != null` AND mobile. |
| `src/components/App/App.module.css` | modify | Mobile-only rule: when the UI-stack root carries `hasSelection`, lift the scale bar's `bottom` by `--mobile-sheet-peek`. |
| `tests/hooks/useIsMobile.test.ts` | **create** | matchMedia mock → asserts true/false + change reactivity. |
| `tests/components/InfoCard/MobileSheet.test.tsx` | **create** | Sheet renders its child; scroll-reset `scrollTo` spy fires on target-identity change. |
| `tests/components/InfoCard/InfoCard.mobile.test.tsx` | **create** | Mobile: only `selected` renders, `hovered` ignored; peek content present; "More details" rows in DOM. Desktop: today's stack. |

Conventions to honour throughout: `type` aliases never `interface`; one type per
file in `src/@types/`; one function per file in `src/utils/`; React component =
own folder, `<Name>.tsx` + `<Name>.module.css`, `function Name() {}` +
`export default Name`, top-level `.root` class, NO barrel/index re-exports, deep
relative imports, didactic multi-paragraph module-header comment (match the
`InfoCard.tsx` / `DetailCard.module.css` comment density). Comments timeless and
terse — no dates/PR-refs/history. Prefer immutability / pure functions. Tests
mirror `src/` under `tests/`.

> **Note on the existing `InfoCard` default-export rule.** `InfoCard.tsx`
> currently uses a *named* export (`export function InfoCard`), not the
> default-export component convention. Do NOT change that signature — `App.tsx`
> and the existing tests import it by name and desktop parity forbids churn.
> Apply the default-export convention only to the *new* `MobileSheet` component.

---

## Task 1 — `useIsMobile()` reactive breakpoint hook

**Files:** `src/hooks/useIsMobile.ts` (create), `tests/hooks/useIsMobile.test.ts` (create)

**Signature:** `useIsMobile(): boolean`
**Behaviour:** returns `true` when `matchMedia('(max-width: 768px)')` matches;
updates on the MediaQueryList `change` event; SSR-safe (returns `false` when
`window`/`matchMedia` is undefined). Breakpoint literal `768` lives once here.

Mirror the mount/cleanup shape of `useFamousMeta` (`src/hooks/useFamousMeta.ts`):
`useState` initial from the current match, `useEffect` subscribing to
`addEventListener('change', …)` and cleaning up.

- [x] `tests/hooks/useIsMobile.test.ts`: mock `window.matchMedia` to a fake
  `MediaQueryList` with controllable `matches` + `addEventListener`/`removeEventListener`.
  - [x] `returns true when the query matches` — `matches: true` → hook returns `true`.
  - [x] `returns false when the query does not match` — `matches: false` → `false`.
  - [x] `updates when the media query change event fires` — flip `matches` and
    dispatch the stored `change` listener → re-rendered value flips.
  - [x] `returns false when matchMedia is unavailable` — delete `window.matchMedia`
    → `false` (SSR/jsdom-fallback guard).
- [x] Run `npm test -- useIsMobile` → all fail (no impl).
- [x] Implement the hook.
- [x] Run `npm test -- useIsMobile` → green.
- [x] Commit.

## Task 2 — `--mobile-sheet-peek` token (single source of truth)

**Files:** `src/styles/global.css` (modify)

The one token both the snap geometry (Task 3) and the scale-bar lift (Task 7)
consume. Add it to the layout-tokens group beside `--corner-offset`
(`global.css:286-291`).

Before / after (just the added line, in context):

```css
  /** Distance from the viewport edge for fixed corner overlays. */
  --corner-offset: 16px;

  /** Collapsed-peek height of the mobile info-card bottom sheet.
   *  Single source for the sheet's peek snap AND the scale-bar lift. */
  --mobile-sheet-peek: 96px;
```

(`96px` ≈ grab handle + two text lines + padding; tune visually in Task 8.)

- [x] Add the token with a didactic comment naming both consumers.
- [x] `npm run typecheck` (CSS-only change; no test). Commit.

## Task 3 — `MobileSheet` component + module (scroll-snap container)

**Files:** `src/components/InfoCard/MobileSheet/MobileSheet.tsx` (create),
`src/components/InfoCard/MobileSheet/MobileSheet.module.css` (create),
`tests/components/InfoCard/MobileSheet.test.tsx` (create)

**Signature:**

```ts
export type MobileSheetProps = {
  /** Identity of the selected target; changing it resets the scroll to the peek snap. */
  resetKey: string;
  children: ReactNode;
};
function MobileSheet(props: MobileSheetProps): ReactNode;
export default MobileSheet;
```

**Why `resetKey: string` and not the target itself:** the reset effect only
needs *identity*, not the object. The caller (`InfoCard`) derives a stable string
from the selected target (galaxy `index`/`objID`, structure `id`, milkyWay tag —
see existing `targetEq` at `src/services/engine/helpers/targetEq.ts` for the
identity fields). Passing a primitive keeps `MobileSheet` card-agnostic and the
effect dependency array trivially correct. **Do not** pass `FocusableTarget`.

**DOM shape (contract):**
- `.root` — `position: fixed; inset: 0; z-index: 10`, `overflow-y: scroll`,
  `scroll-snap-type: y mandatory`, `pointer-events: none` (so the spacer area
  passes touches to the canvas).
- `.spacer` — first snap child (`scroll-snap-align: start`), transparent, height
  `calc(100% - var(--mobile-sheet-peek))`, `pointer-events: none`. This is the
  peek snap position: scrolling to top leaves only the peek visible.
- `.sheet` — second snap child (`scroll-snap-align: start`), `pointer-events:
  auto`, holds `children`. Min-height tall enough that snapping to it fills to
  ~75 vh; internal `overflow-y: auto` for the long card body. Grab handle is a
  `::before` pill (or a small `<div className={styles.handle} aria-hidden>`).
- The scroll container ref + a `useEffect([resetKey])` calling
  `ref.current?.scrollTo({ top: 0 })` (top = peek snap). Guard `ref.current`.

**Tests** (jsdom; the snap/momentum is browser-native and NOT asserted — assert
content presence + the reset spy, matching `InfoCard.structureHover.test.ts`):
- [x] `renders its child content` — render `MobileSheet` with a `<p>marker</p>`
  child → `getByText('marker')` present.
- [x] `scrolls to the peek on mount` — spy on `HTMLElement.prototype.scrollTo`
  → called with `{ top: 0 }` after mount.
- [x] `scrolls back to the peek when resetKey changes` — rerender with a new
  `resetKey` → `scrollTo` called again; rerender with the SAME `resetKey` → not
  called again (effect-dep correctness).
- [x] `does not throw when the container ref is detached` — sanity guard.
- [x] Run `npm test -- MobileSheet` → fail, implement, → green. Commit.

## Task 4 — `DetailCard.module.css` mobile peek block

**Files:** `src/components/InfoCard/DetailCard.module.css` (modify)

Inside the sheet, the shared galaxy/structure card's top must read as the peek:
headline (`.cardHeadline`) + source badge (`.sourceBadge`) on line 1, then a
single compact distance line, with the thumbnail / cosmology / catalogues / "More
details" fold all flowing **below** the expanded-snap line. The peek content is
NOT new markup — it is the natural top of the existing card; this block only
restyles spacing/visibility so the top slice fits `--mobile-sheet-peek`.

There is already a precedent for a sheet-context override: the
`:global(.infoCardStack) .infoCardFull` rule at `DetailCard.module.css:78`
neutralises the card's standalone fixed positioning inside the desktop stack. Add
an analogous **mobile, in-sheet** scope. Scope the override so desktop is
untouched:

```css
@media (max-width: 768px) {
  :global(.mobileSheet) .infoCardFull {
    /* flow inside the sheet; drop the standalone fixed corner + max-width cap */
    position: static;
    max-width: none;
    width: 100%;
  }
  /* peek line styling lives here if the existing cardDistLine/headlineRow
     spacing needs tightening to fit --mobile-sheet-peek; keep it minimal */
}
```

(`.mobileSheet` is `MobileSheet`'s `.sheet`/`.root` global hook — pick one and
keep it consistent with Task 3; reference it via `:global(...)` exactly as the
existing `:global(.infoCardStack)` rule does.)

- [x] No desktop rule edited; verify the existing `:global(.infoCardStack)` rule
  and all standalone `.infoCardFull` rules are unchanged (desktop parity).
- [x] Add the `@media (max-width: 768px)` in-sheet block.
- [x] `npm run typecheck`. Commit. (Visual peek-fit is validated in Task 8.)

## Task 5 — `InfoCard` mobile branch

**Files:** `src/components/InfoCard/InfoCard.tsx` (modify),
`tests/components/InfoCard/InfoCard.mobile.test.tsx` (create)

Add a mobile branch using `useIsMobile()`:
- Mobile: if `selected == null` return `null` (ignore `hovered` entirely); else
  render `<MobileSheet resetKey={…}>{ DETAIL_CARD[selected.type].Detail({ target: selected, pinned: true, selectedMemberCount, onFocus, onClose }) }</MobileSheet>`.
  Reuse the SAME `DETAIL_CARD[...].Detail(...)` call the desktop branch uses — do
  not fork the card. `resetKey` = a stable identity string for `selected`.
- Desktop: the existing body (`InfoCard.tsx:68-90`) **unchanged**.

Keep `InfoCardProps` unchanged. Keep the named `export function InfoCard`.

**Tests** (mock `window.matchMedia`; reuse the `virgo`/`galaxyStub` fixtures from
`InfoCard.structureHover.test.ts`):
- [x] `renders only the selected card on mobile and ignores hovered` —
  matchMedia matches; `hovered: virgo, selected: coma` → `getByText('Coma Cluster')`
  present, `queryByText('Virgo Cluster')` absent (hover suppressed). Exactly one
  "Structure" eyebrow / no "Hover".
- [x] `renders nothing on mobile when nothing is selected even if hovered` —
  matches; `hovered: virgo, selected: null` → `queryByText('Virgo Cluster')` absent
  (mobile ignores hover; container empty).
- [x] `shows the peek content for a selected structure on mobile` —
  `selected: virgo` → name "Virgo Cluster", category badge label, and the
  distance line all present in the DOM.
- [x] `keeps the full detail body in the DOM on mobile (reveal is CSS)` —
  selected galaxy stub → assert a "More details" / below-fold reference row
  (e.g. "RA" or "Orientation") is in the DOM (presence, not position).
- [x] `renders today's stack on desktop` — matchMedia does NOT match;
  `hovered: virgo, selected: coma` → both names present (parity with the desktop
  stacking behaviour).
- [x] Run `npm test -- InfoCard.mobile` → fail, implement, → green.
- [x] Run `npm test -- InfoCard` → **all existing InfoCard tests still green**
  (desktop parity gate). Commit.

## Task 6 — `App` `hasSelection` class on the UI-stack root

**Files:** `src/components/App/App.tsx` (modify)

The UI-stack root (`appStyles.uiStack` wrapper, `App.tsx:401-406`) carries a
`hasSelection` class when `selected != null` AND mobile (`useIsMobile()`), via the
existing `cx(...)` call. The class is the CSS hook Task 7 reads to lift the scale
bar. No new React state — derived from existing `selected` + the hook.

Use a global class name (not a CSS-module class) so `App.module.css` can target
it with `:global` cleanly, OR add the class to `App.module.css` and apply via
`appStyles` — pick the approach consistent with how `App.module.css` already
references the scale bar (the scale bar is `ScaleBar`'s own module, so a `:global`
hook on the wrapper read by `App.module.css` is the natural seam; see Task 7).

- [x] Apply `hasSelection` to the wrapper `cx(...)` guarded by `selected != null && isMobile`.
- [x] No new InfoCard/App test asserts the class directly (it's a styling hook;
  the lift is visual). Add a lightweight render assertion ONLY if it is cheap and
  stable; otherwise rely on Task 8 visual check. Prefer not asserting CSS-module
  class fragments (matches the testing philosophy).
- [x] `npm run typecheck`; `npm test -- App` (if an App test suite exists) green.
  Commit.

## Task 7 — Scale-bar lift (mobile, when a selection is present)

**Files:** `src/components/App/App.module.css` (modify)

When the UI-stack root carries `hasSelection` on mobile, raise the scale bar's
`bottom` so it sits above the collapsed peek. The scale bar's own positioning
lives in `ScaleBar.module.css:11-16` (`bottom: var(--corner-offset)`,
`pointer-events: none`). Override from `App.module.css` using the `hasSelection`
hook + a `:global` reference to the scale-bar class, scoped to mobile, consuming
the SAME `--mobile-sheet-peek` token (no second literal):

```css
@media (max-width: 768px) {
  .uiStack.hasSelection :global(.scaleBar),
  :global(.hasSelection) :global(.scaleBar) {
    bottom: calc(var(--corner-offset) + var(--mobile-sheet-peek));
  }
}
```

(Use whichever single selector matches the class-application choice from Task 6;
do not keep both — pick one and delete the other. `ScaleBar` needs a stable
`:global(.scaleBar)` hook — if its module class isn't already globally
addressable, add a plain global class alongside the module class on the
`ScaleBar` root, mirroring how `InfoCard` carries both `styles.infoCardStack` and
the global `'infoCardStack'`, `InfoCard.tsx:78`.)

- [x] Add the mobile lift rule consuming `--mobile-sheet-peek`.
- [x] Ensure desktop (`> 768px`) scale-bar position is unchanged.
- [x] `npm run typecheck`. Commit. (Visual confirmation in Task 8.)

## Task 8 — Visual verification at phone width (manual)

**Files:** none (dev-server check).

The gesture, snap, momentum, and `pointer-events` passthrough are
browser-native and not unit-testable. Verify on the running dev server at a
phone viewport (e.g. 390 px). This closes the spec's three risk items.

- [ ] **Peek-height single token (risk 2):** confirm the scale bar sits exactly
  above the collapsed peek with no gap/overlap — proving both consumers read
  `--mobile-sheet-peek`. Tune the token value once if needed; both move together.
- [ ] **pointer-events passthrough (risk 1):** drag on the sky *above* the sheet
  → camera orbits (spacer is `pointer-events: none`); drag *on* the sheet → it
  scrolls/snaps (sheet is `pointer-events: auto`). Confirm against the canvas'
  `touch-action: none`.
- [ ] **useIsMobile vs CSS (risk 3):** confirm desktop is byte-for-byte
  unchanged (top-right stack, hover preview, panels) and that rotating across
  768 px swaps the presentation live (the reactive hook, vs. the one-shot
  `initialMobile`). Confirm peek → expanded reveals the full card body scrolling
  internally, capped so the sky still peeks at the top (~75 vh).
- [ ] Ask the user to look (do not kill the dev server). Note any token tweak.

## Task 9 — Entanglement-radar pass over the full diff

**Files:** none (review).

- [ ] Run the `entanglement-radar` skill over the complete diff for this plan.
- [ ] Verify the three un-braided choices held: (a) peek is the top slice of the
  same card, no duplicate headline component; (b) gesture is pure CSS, JS only
  for scroll-reset + `hasSelection`; (c) `--mobile-sheet-peek` is the single
  source for both the snap and the scale-bar lift (grep for any stray peek-height
  literal — there must be none).
- [ ] Confirm `useIsMobile` is used ONLY for the render branch + `hasSelection`,
  never as a layout substitute for a media query.
- [ ] Fix anything flagged; re-run `npm test` + `npm run typecheck` → green.
  Commit.

---

## Definition of done

- [ ] All new tests green; **all pre-existing `InfoCard` tests green unchanged**
  (desktop parity).
- [ ] `npm run typecheck` clean (src + tools).
- [ ] No new state introduced beyond `useIsMobile`'s internal `useState`.
- [ ] Peek height is one token; no duplicate literal anywhere.
- [ ] `GalaxyInfo` / `galaxyInfoBuilder` / engine / data paths untouched.
- [ ] Settings/Stats/Navigation mobile launcher NOT touched (out of scope).
- [ ] Entanglement-radar pass complete with no outstanding flags.
