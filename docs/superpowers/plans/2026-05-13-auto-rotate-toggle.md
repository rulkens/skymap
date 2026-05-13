# Auto-rotate Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a play/pause icon button next to the SearchTrigger pill that toggles the engine's autoRotate setting.

**Architecture:** New `AutoRotateToggle` React component (memoised, same frosted-glass visual identity as SearchTrigger). A new fixed-positioned flex wrapper in App.tsx owns top-center layout; SearchTrigger gives up its own fixed positioning to become a flex child. State is single-sourced from `useEngineSettings` and reflected by both the toggle and the existing SettingsPanel checkbox.

**Tech Stack:** React, TypeScript, CSS modules, Vitest + @testing-library/react.

---

## Spec ↔ codebase reconciliation (read this first)

While preparing this plan we cross-checked the spec against the live worktree. Two notes for the implementer:

1. **`src/components/App/App.module.css` already exists.** The spec says App "currently has no CSS module" — that hasn't been true since the `leftStack` / `uiStack` refactor. The file currently defines `.leftStack`, `.uiStack`, and `.uiStackHidden`. **Do not create a new module.** Instead, add the new `.topBar` rule to the existing file (Task 7), preserving the file's existing docblock and appending a fresh section.
2. **Design tokens — all confirmed present** in `src/styles/global.css`:
   - `--surface-card-soft` (line 119), `--surface-card-strong` (116)
   - `--border-card` (145), `--border-hover` (157)
   - `--blur-card` (291), `--shadow-card` (323)
   - `--space-3` (248), `--space-4` (249), `--space-5` (250)
   - `--corner-offset` (281)
   - `--color-fg-base` (70), `--color-fg-dim` (82), `--color-accent` (96)
   - `--radius-sm` (265), `--surface-badge` (134)
3. **Project test conventions** (from `tests/components/SearchTrigger/SearchTrigger.test.ts`):
   - File extension is **`.test.ts`** (not `.test.tsx`) — the test uses `createElement` from React to avoid JSX. Follow the same pattern for `AutoRotateToggle.test.ts`.
   - Top of file: `// @vitest-environment jsdom` directive.
   - Imports: `describe, it, expect, vi` from `vitest`; `render, screen` from `@testing-library/react`; `userEvent` from `@testing-library/user-event`; `createElement` from `react`.
   - `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveAttribute`) auto-register via `tests/setup/reactTestEnv.ts`.
   - Querying preference: `screen.getByRole('button', { name: /…/i })` with the aria-label as the accessible name.
   - For the `hidden=true` case, the existing SearchTrigger test asserts on `aria-hidden` rather than the CSS-modules-mangled class name. We mirror that.
4. **Vitest invocation:** `npm test -- AutoRotateToggle` runs only the matching file.
5. **Commits** must use the user's git identity (no `--author` flag). Use only the `Co-Authored-By:` trailer in the message body.

---

## Task 1: AutoRotateToggle renders a play icon when not playing

- [ ] Write a failing test asserting that with `playing={false}` the component renders a button labelled "Start camera auto-rotate" containing the play-triangle SVG path.
- [ ] Create a minimal `AutoRotateToggle.tsx` and an empty `AutoRotateToggle.module.css` to satisfy the failing test.
- [ ] Run `npm test -- AutoRotateToggle` — should fail first, then pass after the implementation.
- [ ] Commit.

### Files

**Create** `tests/components/AutoRotateToggle/AutoRotateToggle.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import AutoRotateToggle from '../../../src/components/AutoRotateToggle/AutoRotateToggle';

describe('AutoRotateToggle', () => {
  it('renders a play icon when playing=false', () => {
    render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
    const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
    expect(btn).toBeInTheDocument();
    // The play icon is identified by its data-testid; we test the
    // structural fact "play vs pause" via the testid rather than
    // SVG-path string equality so refactors to the visual stay safe.
    expect(btn.querySelector('[data-testid="play-icon"]')).not.toBeNull();
  });
});
```

**Create** `src/components/AutoRotateToggle/AutoRotateToggle.tsx`:

```tsx
/**
 * AutoRotateToggle — a 40 × 40 px frosted-glass play/pause button
 * rendered next to the SearchTrigger pill at top-center.  Toggles the
 * engine's `autoRotate` setting; one click instead of three (open
 * settings → scroll → tick checkbox).
 *
 * ### Visual identity
 *
 * Same surface vocabulary as SearchTrigger / InfoCard:
 * `--surface-card-soft`, `--border-card`, `--blur-card`,
 * `--shadow-card`.  Hover/focus shift to `--surface-card-strong` +
 * `--border-hover`, the icon tints to `--color-accent`.
 *
 * ### Why React.memo
 *
 * The toggle reads only `playing`, `onToggle`, `hidden` — none of
 * which change per frame.  Without memo, App's animation re-renders
 * would re-render the inline SVG every frame.  Same reasoning as
 * SearchTrigger.
 */

import { memo, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './AutoRotateToggle.module.css';

export type AutoRotateToggleProps = {
  /** Current autoRotate state. Drives which icon is shown. */
  playing: boolean;
  /** Called when the user clicks the toggle. */
  onToggle: () => void;
  /**
   * When true, the toggle fades out and stops accepting clicks —
   * matches SearchTrigger's `hidden` semantics during the open-
   * palette transition.
   */
  hidden?: boolean;
};

function PlayIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      data-testid="play-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 3 L13 8 L4 13 Z" fill="currentColor" />
    </svg>
  );
}

function AutoRotateToggle({ playing, onToggle, hidden = false }: AutoRotateToggleProps): ReactNode {
  const label = playing ? 'Pause camera auto-rotate' : 'Start camera auto-rotate';
  return (
    <button
      type="button"
      className={cx(styles.toggle, hidden && styles.hidden)}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={playing}
      aria-hidden={hidden || undefined}
    >
      <PlayIcon />
    </button>
  );
}

export default memo(AutoRotateToggle);
```

**Create** `src/components/AutoRotateToggle/AutoRotateToggle.module.css`:

```css
/*
 * AutoRotateToggle.module.css — minimal placeholder.
 * Full styling lands in Task 6 once the behavioural tests are in.
 */

.toggle {
  cursor: pointer;
}

.hidden {
  opacity: 0;
  pointer-events: none;
}

.icon {
  display: block;
}
```

### Commands

```bash
npm test -- AutoRotateToggle
```

### Commit

```bash
git add src/components/AutoRotateToggle/AutoRotateToggle.tsx \
        src/components/AutoRotateToggle/AutoRotateToggle.module.css \
        tests/components/AutoRotateToggle/AutoRotateToggle.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): scaffold AutoRotateToggle with play-icon render test

First red-green of the new top-bar auto-rotate toggle.  Renders the
play-triangle when `playing=false`.  Full visual styling and
pause-state come in later tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pause icon when playing=true

- [ ] Add a failing test for `playing={true}` rendering the pause icon.
- [ ] Add `PauseIcon` and switch on `playing` in the JSX.
- [ ] Run tests; commit.

### Files

**Modify** `tests/components/AutoRotateToggle/AutoRotateToggle.test.ts` — add inside the `describe` block:

```ts
it('renders a pause icon when playing=true', () => {
  render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
  const btn = screen.getByRole('button', { name: /pause camera auto-rotate/i });
  expect(btn).toBeInTheDocument();
  expect(btn.querySelector('[data-testid="pause-icon"]')).not.toBeNull();
});
```

**Modify** `src/components/AutoRotateToggle/AutoRotateToggle.tsx`:

Add a `PauseIcon` companion to `PlayIcon`:

```tsx
function PauseIcon(): ReactNode {
  return (
    <svg
      className={styles.icon}
      data-testid="pause-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {/* Two rounded vertical bars, evenly spaced about the centre. */}
      <rect x="4" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
      <rect x="9.5" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}
```

Then swap the icon site inside the component:

```tsx
{playing ? <PauseIcon /> : <PlayIcon />}
```

### Commands

```bash
npm test -- AutoRotateToggle
```

### Commit

```bash
git commit -am "$(cat <<'EOF'
feat(ui): add pause-icon variant to AutoRotateToggle

Switch on `playing` between play-triangle and pause-bars.  Both icons
use `currentColor` so hover/focus tint propagates without per-icon
state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Click invokes onToggle

- [ ] Failing test that clicks the button and asserts `onToggle` was called once.
- [ ] No new wiring needed if Task 1 already wired `onClick={onToggle}` (it did) — the test simply codifies the contract.
- [ ] Run tests; commit.

### Files

**Modify** `tests/components/AutoRotateToggle/AutoRotateToggle.test.ts` — add:

```ts
it('fires onToggle when the user clicks', async () => {
  const onToggle = vi.fn();
  const user = userEvent.setup();
  render(createElement(AutoRotateToggle, { playing: false, onToggle }));
  await user.click(screen.getByRole('button', { name: /start camera auto-rotate/i }));
  expect(onToggle).toHaveBeenCalledOnce();
});

it('fires onToggle on Enter when focused (keyboard accessibility)', async () => {
  const onToggle = vi.fn();
  const user = userEvent.setup();
  render(createElement(AutoRotateToggle, { playing: false, onToggle }));
  const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
  btn.focus();
  await user.keyboard('{Enter}');
  expect(onToggle).toHaveBeenCalledOnce();
});
```

### Commands

```bash
npm test -- AutoRotateToggle
```

### Commit

```bash
git commit -am "$(cat <<'EOF'
test(ui): assert AutoRotateToggle fires onToggle on click and Enter

Codifies the click + keyboard-Enter contract for the toggle.  Already
satisfied by the Task 1 wiring (`onClick={onToggle}` on a native
<button>), but locked in so a future refactor can't silently break
keyboard accessibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hidden state — aria-hidden + class application

- [ ] Failing test asserting the hidden state reflects via `aria-hidden="true"` and the button is unreachable to the role query without `{ hidden: true }`.
- [ ] No new wiring needed (Task 1 already sets `aria-hidden={hidden || undefined}` and applies `styles.hidden`) — the test codifies the contract.
- [ ] Run tests; commit.

### Why aria-hidden, not the class name

Mirroring the existing `SearchTrigger` test rationale: CSS-modules
mangle class names at build time, so asserting `class.includes('hidden')`
is brittle. `aria-hidden` is the stable, behavioural contract.
Computed `pointer-events: none` isn't readable from jsdom, so we can
also assert the className is present via the className attribute as a
secondary check (it'll be a hashed string, but its presence is
deterministic for the same render).

### Files

**Modify** `tests/components/AutoRotateToggle/AutoRotateToggle.test.ts` — add:

```ts
it('reflects hidden=true via aria-hidden, mirroring SearchTrigger', () => {
  render(
    createElement(AutoRotateToggle, { playing: false, onToggle: () => {}, hidden: true }),
  );
  const btn = screen.getByRole('button', { hidden: true });
  expect(btn).toHaveAttribute('aria-hidden', 'true');
});

it('omits aria-hidden when hidden is false (default)', () => {
  render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
  const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
  expect(btn).not.toHaveAttribute('aria-hidden');
});
```

### Commands

```bash
npm test -- AutoRotateToggle
```

### Commit

```bash
git commit -am "$(cat <<'EOF'
test(ui): assert AutoRotateToggle hidden state via aria-hidden

Aligns with SearchTrigger's stable-contract pattern: ARIA attributes,
not CSS-modules-mangled class strings.  Locks the hidden-when-palette-
open behaviour against future refactors.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: aria-pressed and aria-label reflect playing state

- [ ] Failing tests for `aria-pressed` and `aria-label` text in both states.
- [ ] No new wiring needed (Task 1 set both) — the tests codify the contract.
- [ ] Run tests; commit.

### Files

**Modify** `tests/components/AutoRotateToggle/AutoRotateToggle.test.ts` — add:

```ts
it('sets aria-pressed="false" when playing=false', () => {
  render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
  const btn = screen.getByRole('button', { name: /start camera auto-rotate/i });
  expect(btn).toHaveAttribute('aria-pressed', 'false');
});

it('sets aria-pressed="true" when playing=true', () => {
  render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
  const btn = screen.getByRole('button', { name: /pause camera auto-rotate/i });
  expect(btn).toHaveAttribute('aria-pressed', 'true');
});

it('uses the "Start" aria-label when not playing', () => {
  render(createElement(AutoRotateToggle, { playing: false, onToggle: () => {} }));
  expect(
    screen.getByRole('button', { name: 'Start camera auto-rotate' }),
  ).toBeInTheDocument();
});

it('uses the "Pause" aria-label when playing', () => {
  render(createElement(AutoRotateToggle, { playing: true, onToggle: () => {} }));
  expect(
    screen.getByRole('button', { name: 'Pause camera auto-rotate' }),
  ).toBeInTheDocument();
});
```

### Commands

```bash
npm test -- AutoRotateToggle
```

### Commit

```bash
git commit -am "$(cat <<'EOF'
test(ui): assert AutoRotateToggle aria-pressed + aria-label reflect state

`aria-pressed` is the canonical pattern for binary toggles whose label
changes meaning with state.  Tests lock in both attributes for both
states so the assistive-tech contract can't quietly regress.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Full styling pass

No new tests in this task — visual styling is verified by the user against the running dev server. Tests stay green; rule out regressions with a `npm test -- AutoRotateToggle` run after the edit.

- [ ] Replace the placeholder `AutoRotateToggle.module.css` with the full frosted-glass styling: 40 × 40 pill, hover/focus states, transition timings matching SearchTrigger, hidden-state transform.
- [ ] Run the full test file (no regressions expected).
- [ ] Ask the user to look at the toggle in the running dev server (visible at top-center; hovering should brighten the surface; clicking should swap the icon).
- [ ] Commit.

### Files

**Overwrite** `src/components/AutoRotateToggle/AutoRotateToggle.module.css`:

```css
/*
 * AutoRotateToggle.module.css — circular play/pause pill at the top of
 * the viewport, next to the SearchTrigger.
 *
 * Visual vocabulary deliberately matches SearchTrigger / InfoCard /
 * SettingsPanel: frosted-glass dark blue surface, the cosmic-blue
 * accent on hover/focus.  All atoms reference tokens from
 * `src/styles/global.css`.
 *
 * Positioning is owned by the `.topBar` wrapper in App.module.css —
 * this rule deliberately has no `position` / `top` / `left` because
 * the wrapper is responsible for placing the row of pills.
 */

.toggle {
  /*
   * 40 × 40 circular pill.  Padding keeps the icon centred without
   * relying on `display: flex` semantics that vary cross-browser when
   * mixed with SVG intrinsic sizing.
   */
  width: 40px;
  height: 40px;
  flex-shrink: 0; /* don't get squashed by SearchTrigger's flex-grow on mobile */

  display: flex;
  align-items: center;
  justify-content: center;

  background: var(--surface-card-soft);
  -webkit-backdrop-filter: blur(var(--blur-card));
  backdrop-filter: blur(var(--blur-card));

  border: 1px solid var(--border-card);
  border-radius: 999px;
  box-shadow: var(--shadow-card);

  color: var(--color-fg-base);
  cursor: pointer;
  padding: 0;

  /*
   * Same transition envelope as SearchTrigger so the two pills move in
   * lockstep when the palette opens/closes.
   */
  transition:
    opacity 0.18s ease-out,
    transform 0.22s ease-out,
    border-color 0.15s ease-out,
    background-color 0.15s ease-out;
  opacity: 1;
}

.toggle:hover,
.toggle:focus-visible {
  background: var(--surface-card-strong);
  border-color: var(--border-hover);
  outline: none;
}

.icon {
  flex-shrink: 0;
  color: var(--color-fg-dim);
  transition: color 0.15s ease-out;
}

.toggle:hover .icon,
.toggle:focus-visible .icon {
  color: var(--color-accent);
}

/*
 * Hidden state — palette is open; the toggle fades and shrinks toward
 * its centre.  Unlike SearchTrigger, there's no translateX(-50%) term
 * to compose with because positioning lives in the wrapper.  Just
 * `scale(0.92)`.  `pointer-events: none` makes the invisible pill
 * non-clickable even during the fade.
 */
.hidden {
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
}
```

### Commands

```bash
npm test -- AutoRotateToggle
```

Then ask the user: "Look at the running dev server. Do you see the auto-rotate play button to the right of the search pill at top-center? Does hovering it brighten the surface? Does clicking it swap the icon between play and pause?"

### Commit

```bash
git commit -am "$(cat <<'EOF'
style(ui): full frosted-glass styling for AutoRotateToggle

40x40 circular pill matching SearchTrigger's visual vocabulary.
Shared transition envelope so the two pills fade in lockstep when the
command palette opens.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Top-bar wrapper + SearchTrigger restructure + App.tsx wiring

This is the integration task. It does three coupled edits in lockstep because partial states leave SearchTrigger un-positioned. Run the full suite at the end (`npm test`) — the existing SearchTrigger tests must stay green, and the AutoRotateToggle tests must stay green. Visual verification by the user closes it out.

- [ ] **Add `.topBar` to the existing `src/components/App/App.module.css`** (the file already exists; do NOT create a new one — see the reconciliation note above).
- [ ] **Modify `SearchTrigger.module.css`** to drop fixed positioning, update `.hidden` to remove the `translateX(-50%)` term, and change the mobile rule from a width-cap to `flex: 1; min-width: 0`.
- [ ] **Update SearchTrigger.tsx's docblock comment** ("Fixed top-center" wording) to acknowledge the wrapper owns positioning now.
- [ ] **Modify App.tsx** — wrap `<SearchTrigger>` in `<div className={appStyles.topBar}>` and render the new `<AutoRotateToggle>` next to it, wired to `handleRef.current?.camera.setAutoRotate`.
- [ ] Run `npm test` (full suite). No regressions expected.
- [ ] User-visual check: search pill is still centred; new toggle sits right of it; the existing SettingsPanel auto-rotate checkbox and the new toggle reflect the same state; opening the palette fades both pills out together.
- [ ] Commit.

### Files

**Modify** `src/components/App/App.module.css` — append after the existing rules (preserve the file header and existing rules verbatim):

```css
/*
 * `.topBar` — fixed-positioned flex container for the top-center row.
 *
 * Why a wrapper instead of each pill positioning itself?  Two pills
 * sharing one anchor used to mean two copies of `position: fixed; top: …; left: 50%; translateX(-50%)`
 * with z-index juggling and a third source of truth for any future
 * companion (tour-playback transport, etc.).  A single flex container
 * owns the placement once; children just say "I'm a pill".
 *
 * z-index sits one notch below the palette's z=50 backdrop so the
 * palette overlays the pills cleanly while their fade-out runs.
 */
.topBar {
  position: fixed;
  top: var(--corner-offset);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/*
 * Mobile — pin the bar to the full width minus corner offsets so the
 * search pill can flex-grow into the available space while the
 * auto-rotate pill stays at its intrinsic 40 px.  Risk to watch on
 * narrow viewports (see spec): if a pinned InfoCard underlaps the
 * right edge, the toggle's z-index may need a one-notch bump.
 */
@media (max-width: 768px) {
  .topBar {
    left: var(--corner-offset);
    right: var(--corner-offset);
    transform: none;
  }
}
```

**Modify** `src/components/SearchTrigger/SearchTrigger.module.css`:

In the `.trigger` rule, delete these four lines:

```css
  position: fixed;
  top: var(--corner-offset);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9; /* one notch below the palette's z=50 backdrop */
```

(Both `transform: translateX(-50%)` and the `z-index` line above it; the wrapper owns both.)

Replace the `.hidden` rule:

```css
/*
 * Hidden state — palette is open; the trigger fades out and shrinks.
 * The wrapper owns horizontal centring now, so the transform only
 * needs `scale(0.92)` (no `translateX(-50%)` term to compose with).
 */
.hidden {
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
}
```

Replace the mobile rule:

```css
@media (max-width: 768px) {
  .trigger {
    /*
     * Let the wrapper's flex layout drive the width: grow into
     * available space, shrink without overflowing.  `min-width: 0`
     * is the canonical "this flex child may shrink below its
     * content-intrinsic size" escape hatch — without it the
     * placeholder text's `text-overflow: ellipsis` doesn't kick in
     * because the child refuses to shrink past its content.
     */
    flex: 1;
    min-width: 0;
    width: auto;
    max-width: 280px;
  }
}
```

**Modify** `src/components/SearchTrigger/SearchTrigger.tsx` — update the placement-related part of the docblock. Change the "Visual identity" paragraph from:

```
 * Same frosted-glass surface vocabulary as InfoCard / SettingsPanel:
 * `--surface-card-soft`, `--border-card`, `--blur-card`, the cosmic
 * blue accent.  ~280 px wide, anchored top-center of the viewport
 * (the InfoCard occupies top-right, so center keeps the two from
 * fighting on narrow viewports).  Hidden behind the palette when it's
 * open so the trigger doesn't peek out behind the modal — `hidden`
 * prop drives the display:none transition.
```

to:

```
 * Same frosted-glass surface vocabulary as InfoCard / SettingsPanel:
 * `--surface-card-soft`, `--border-card`, `--blur-card`, the cosmic
 * blue accent.  ~280 px wide on desktop; on mobile it flex-grows
 * inside the parent `.topBar` wrapper (App.module.css).  Positioning
 * is owned by that wrapper — the trigger itself no longer carries
 * `position: fixed`.  Hidden behind the palette when it's open so
 * the trigger doesn't peek out behind the modal — `hidden` prop
 * drives the opacity / scale transition.
```

**Modify** `src/components/App/App.tsx`:

Add the import alongside the existing `SearchTrigger` import (~line 66):

```tsx
import AutoRotateToggle from '../AutoRotateToggle/AutoRotateToggle';
```

Replace the existing render site (around line 714) — change from:

```tsx
        <SearchTrigger onClick={openPalette} hidden={paletteOpen} />
```

to:

```tsx
        {/*
        Top-center pill row.  SearchTrigger and AutoRotateToggle share
        a single flex wrapper so they stay coordinated when the palette
        opens (both fade together) and so the layout has a single
        source of truth for placement.  See `.topBar` in App.module.css.
      */}
        <div className={appStyles.topBar}>
          <SearchTrigger onClick={openPalette} hidden={paletteOpen} />
          <AutoRotateToggle
            playing={autoRotate}
            onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
            hidden={paletteOpen}
          />
        </div>
```

Notes for the implementer:

- `autoRotate` is already destructured at line 162 (no change needed there).
- `handleRef.current?.camera.setAutoRotate` is already the wiring used by SettingsPanel at line 452 — exact same handle path.
- `appStyles` is already imported from `./App.module.css` at line 68 (no new import alias needed).
- The `onToggle` arrow closes over `autoRotate`, so it's a fresh function each render. That's deliberate (see spec §Wiring) — `React.memo` on the toggle still pays off because `autoRotate` only changes on user action, not per frame, so the propsdiff stays stable across the animation re-renders that motivated memoising in the first place.

### Commands

```bash
npm test
```

Then ask the user: "On the running dev server, can you confirm: (1) the search pill is still centred at the top, (2) a circular play/pause button sits to its right, (3) clicking the button changes the icon and the SettingsPanel auto-rotate checkbox flips to match, (4) opening the command palette (Cmd+K) fades both pills together, and (5) on a narrow viewport (resize the window) the search pill grows to fill the row while the toggle stays a 40 px circle?"

### Commit

```bash
git add src/components/App/App.module.css \
        src/components/App/App.tsx \
        src/components/SearchTrigger/SearchTrigger.module.css \
        src/components/SearchTrigger/SearchTrigger.tsx
git commit -m "$(cat <<'EOF'
feat(ui): wire AutoRotateToggle into top-bar wrapper

- Introduce `.topBar` flex wrapper in App.module.css owning top-center
  layout for the search pill + new auto-rotate toggle.
- SearchTrigger gives up its fixed positioning, becomes a flex child;
  `.hidden` simplifies to a pure `scale(0.92)`; mobile rule switches
  from a width cap to `flex: 1; min-width: 0`.
- App.tsx renders the toggle next to SearchTrigger, wired to the
  existing `handleRef.current?.camera.setAutoRotate`.  State stays
  single-sourced through `useEngineSettings`; SettingsPanel checkbox
  and toggle reflect the same value.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Done

When all seven tasks have been committed and `npm test` passes:

- [ ] Run `npm run typecheck` to confirm both src and tools compile clean.
- [ ] Run `npm run build` to confirm the production bundle still builds.
- [ ] Visual check by the user (covered in Task 7 verification).
- [ ] Open a PR per project convention (branch + `gh pr create`, never direct-push to main).

The plan deliberately does not bundle the typecheck/build run into a commit — those are gating checks for the PR, not new artefacts.
