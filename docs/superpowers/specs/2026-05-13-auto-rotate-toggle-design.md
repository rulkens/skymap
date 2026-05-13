# Auto-rotate toggle — design

A small icon-button next to the top-center search pill that toggles the
engine's `autoRotate` setting. Visible discoverable affordance for a
feature that currently lives only inside the SettingsPanel.

## Motivation

The engine has had `autoRotate` since the early prototypes, but the only
way to flip it has been the checkbox in SettingsPanel. That's three
clicks deep (open panel → scroll to camera section → tick checkbox) for
what amounts to a play/pause gesture. A persistent top-of-viewport
toggle makes it a one-click thing and creates space for related
transport controls in future work (tour playback, etc.) without
re-architecting later.

## Scope

In scope:

- One new component, `AutoRotateToggle`, rendered next to `SearchTrigger`.
- Wiring through the existing `autoRotate` state in `App.tsx` / `useEngineSettings`.
- Restructuring the top-center area into a shared flex container so the
  two pills sit side-by-side and stay coordinated when the command
  palette opens.

Out of scope (deferred):

- Tour / sequence playback features.
- Transport controls (next, previous, restart).
- A keyboard shortcut for the toggle.

## Visual & layout

### Wrapper container

A new fixed-positioned flex container, rendered in `App.tsx`, owns the
top-center area. Both the search pill and the auto-rotate toggle become
flex children. This replaces SearchTrigger's own fixed positioning.

```css
.topBar {
  position: fixed;
  top: var(--corner-offset);
  left: 50%;
  transform: translateX(-50%);
  z-index: 9; /* one notch below the palette's z=50 backdrop */
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

@media (max-width: 768px) {
  .topBar {
    left: var(--corner-offset);
    right: var(--corner-offset);
    transform: none;
  }
}
```

CSS module location: a new file colocated with App, e.g.
`src/components/App/App.module.css`. (App currently has no CSS module —
all its layout lives in `global.css` or per-child modules. A small App
module is the right home for the new wrapper rule because the rule is
about App-level layout, not about either child.)

### SearchTrigger changes

`SearchTrigger.module.css` currently owns its own fixed positioning.
That moves to the wrapper:

- Drop `position: fixed`, `top`, `left`, `transform: translateX(-50%)`,
  and `z-index` from `.trigger`.
- `.hidden` becomes `opacity: 0; transform: scale(0.92); pointer-events: none;`
  (the `translateX(-50%)` term is gone — the wrapper owns horizontal
  positioning now).
- Mobile rule changes from a fixed width to `flex: 1; min-width: 0;`
  so the pill fills the wrapper's remaining width.

The desktop visual is unchanged. The component's own placement-related
docblock comment ("Fixed top-center") should be updated to reflect that
positioning is now owned by the parent wrapper.

### AutoRotateToggle

New component at `src/components/AutoRotateToggle/`:

- `AutoRotateToggle.tsx`
- `AutoRotateToggle.module.css`

Visual:

- Circular pill, 40×40 px, `border-radius: 999px`.
- Same frosted-glass tokens as SearchTrigger: `--surface-card-soft`
  background, `--border-card` border, `--blur-card` backdrop-filter,
  `--shadow-card` box-shadow.
- Hover / focus-visible: `--surface-card-strong` background,
  `--border-hover` border, accent-coloured icon.
- `flex-shrink: 0` so it doesn't get squashed on narrow viewports.
- Hidden state matches SearchTrigger: `opacity: 0; transform: scale(0.92); pointer-events: none;`
- Same transition timings as SearchTrigger
  (`opacity 0.18s ease-out, transform 0.22s ease-out, border-color 0.15s ease-out, background-color 0.15s ease-out`).

Icons:

- Inline SVGs, matching SearchTrigger's no-icon-dep pattern.
- Play (▶): a single triangle path.
- Pause (⏸): two vertical rounded bars.
- Both use `currentColor` and inherit the button's foreground.

Props:

```ts
export type AutoRotateToggleProps = {
  /** Current autoRotate state. Drives the icon shown. */
  playing: boolean;
  /** Called when the user clicks the toggle. */
  onToggle: () => void;
  /**
   * When true, the toggle fades out and stops accepting clicks.
   * Matches SearchTrigger's `hidden` semantics for the open-palette
   * transition.
   */
  hidden?: boolean;
};
```

Accessibility:

- `<button type="button">` (it's a toggle, not a submit).
- `aria-pressed={playing}` — the canonical pattern for a binary toggle
  whose label changes meaning with state.
- `aria-label={playing ? 'Pause camera auto-rotate' : 'Start camera auto-rotate'}`.
- Wrapped in `React.memo` for the same reason `SearchTrigger` is —
  it has no per-frame props and shouldn't re-render during animation.

## Wiring

`App.tsx` already destructures `autoRotate` (line 162) and has a
`handleRef.current?.camera.setAutoRotate(v)` call wired into
`SettingsPanel` (line 452). The new toggle reuses both:

```tsx
<div className={styles.topBar}>
  <SearchTrigger onClick={openPalette} hidden={paletteOpen} />
  <AutoRotateToggle
    playing={autoRotate}
    onToggle={() => handleRef.current?.camera.setAutoRotate(!autoRotate)}
    hidden={paletteOpen}
  />
</div>
```

State is single-sourced in `useEngineSettings`. The toggle and the
SettingsPanel checkbox both reflect the same value — flipping one
updates the other.

The `onToggle` handler closure depends on `autoRotate`, so it's not
referentially stable across renders. That's acceptable: the toggle is
memoised but `autoRotate` only changes on user action, not per frame.
If we later see needless re-renders, we can hoist the toggle into a
`useCallback` keyed on `autoRotate`, but YAGNI for now.

## Testing

Component tests for `AutoRotateToggle` in `tests/components/AutoRotateToggle/`:

- Renders the play icon when `playing` is `false`.
- Renders the pause icon when `playing` is `true`.
- Click invokes `onToggle`.
- `hidden` prop applies the hidden class and sets `pointer-events: none`
  (or asserts the click handler is not invoked, depending on what's
  testable in jsdom).
- `aria-pressed` reflects `playing`.
- `aria-label` text reflects `playing` state.

No new tests for the wrapper container — its behaviour is purely
declarative CSS, and component-level tests on `SearchTrigger` /
`AutoRotateToggle` cover the moving parts.

## Risks and mitigations

- **SearchTrigger positioning regression.** Removing fixed positioning
  from SearchTrigger could break its placement if any other rule
  depended on the old transform. Mitigation: the existing
  `SearchTrigger` tests + a manual visual check (the dev server is
  always running) catch this immediately. The `.hidden` transition is
  the riskiest piece because it composed scale with the translateX —
  worked through in the spec above.
- **Mobile collision with InfoCard.** SearchTrigger's existing 768 px
  rule deliberately kept its width capped so it wouldn't underlap the
  top-right InfoCard. With the new wrapper using
  `left: var(--corner-offset); right: var(--corner-offset)`, the
  toggle now sits at the right edge of the viewport. If the InfoCard
  is pinned, they could overlap. Mitigation: the InfoCard is anchored
  at the top-right via `corner-offset`, same anchor the wrapper uses
  on mobile. Implementation step: verify on a 375 px viewport that the
  toggle does not overlap a pinned InfoCard; if it does, the InfoCard's
  z-index needs to be checked or the wrapper's right anchor adjusted.
- **State sync drift.** Two UI surfaces (this toggle + SettingsPanel
  checkbox) reflect the same `autoRotate`. No risk because both read
  from and write to the same single source via `handleRef`. Not a new
  pattern — pointSize, brightness already do the same.

## Files touched

New:
- `src/components/AutoRotateToggle/AutoRotateToggle.tsx`
- `src/components/AutoRotateToggle/AutoRotateToggle.module.css`
- `src/components/App/App.module.css`
- `tests/components/AutoRotateToggle/AutoRotateToggle.test.tsx`

Modified:
- `src/components/App/App.tsx` (import + wrapper + render the new toggle)
- `src/components/SearchTrigger/SearchTrigger.module.css` (drop fixed positioning, update `.hidden` and mobile rule)
- `src/components/SearchTrigger/SearchTrigger.tsx` (update docblock comment about positioning)
