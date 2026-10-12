/**
 * Panel — shared glassmorphic card with a collapsible header.
 *
 * ### Why this component exists
 *
 * The HUD has a family of left-stack overlays — Navigation, Settings —
 * that all wear the exact same chrome: blue-tinted glass card,
 * uppercase title row with a clickable chevron that folds the body away,
 * 300 px width.  Until this refactor, each panel re-implemented the
 * markup AND duplicated the CSS for that chrome (with a comment apologising
 * for the duplication).  Multiple forks of the same affordance is the point
 * at which "small duplication wins on clarity" stops being true — fixing
 * a hover-state bug or tweaking the corner radius required the same edit
 * in every fork, and divergence was inevitable.
 *
 * Panel collapses (pun intended) the chrome into one component.  Consumers
 * pass `title`, `defaultOpen`, and `children`; the per-row styling lives in
 * the consumer's own CSS module (key/action for Navigation, panelRow for
 * Settings).  See `Panel.module.css` for the chrome rules and the matching
 * split between "shared chrome" and "per-panel rows".
 *
 * ### Collapse state — session-only, no localStorage
 *
 * Collapse is intentionally session-only.  An earlier draft persisted the
 * open/closed boolean to `localStorage` per-panel so a user's layout choice
 * survived reloads, but that wired near-identical SSR-safe try/catch
 * blocks across the codebase and produced surprises (a user collapses a
 * panel once, then weeks later wonders why a control went missing).
 * A fresh visit always starts in the `defaultOpen` state — predictable,
 * cheap, no state synchronisation across tabs.
 *
 * If persistence becomes a real need, restore it as a single `persistKey`
 * prop on Panel rather than re-introducing the per-consumer helpers.
 *
 * ### Animated open/close — grid-template-rows trick
 *
 * The body wears the same `grid-template-rows: 0fr → 1fr` animation that
 * the inner CollapsibleSection uses, so the whole panel family (outer
 * panel + inner sub-sections) collapse with the same visual rhythm.  The
 * body stays mounted — collapsed = grid-row collapses to height 0 +
 * opacity 0 + content clipped via `overflow: hidden` on the inner body
 * div + min-height: 0 on the grid item (without that, grid items default
 * to a min-height of `auto` and refuse to collapse).
 *
 * An earlier draft conditionally unmounted the children to save DOM
 * weight on collapse (especially for SettingsPanel's ~80 controls), but
 * the abrupt show/hide read as jarring next to the smoothly-animating
 * inner sections.  Keeping the body mounted is the consistency win;
 * the DOM-weight cost is negligible at this catalog size.
 *
 * ### Aria wiring
 *
 * `useId` produces a stable, unique id for the body wrapper so
 * `aria-controls` on the title button can point at a real element without
 * the consumer having to invent a string.  Screen readers announce
 * "expanded" / "collapsed" via `aria-expanded`; the body's `aria-hidden`
 * stays in sync via being absent (when closed) or present (when open).
 */

import { useId, useState, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './Panel.module.css';

/** Props for Panel.  See module header for design rationale. */
export type PanelProps = {
  /**
   * Heading text rendered uppercase by the stylesheet.  Pass it the way
   * you'd want it to read in a sentence ("Settings", "Navigation") — the
   * CSS handles the visual case.  Already-uppercased strings work too, but
   * lower- or title-case in the source reads more naturally.
   */
  title: string;
  /**
   * Forwarded to the outer `<div>` as `aria-label`.  Optional because most
   * consumers' titles are already self-describing — supply this when the
   * panel's purpose isn't obvious from the title alone for a screen reader.
   */
  ariaLabel?: string;
  /**
   * What to show on first mount.  Defaults to `true` (open) — the panels
   * are the primary affordance, and a first-time visitor should see them.
   * Pass `false` for panels that should start tucked away.
   */
  defaultOpen?: boolean;
  /**
   * Optional inline element rendered in the title row, after the title
   * text.  Originally added so SettingsPanel could host a compact "Tier:
   * medium ▾" chip inline with the panel's name (per the 2026-05-19 UX
   * audit, Q13/the converged structure) — letting the most consequential
   * always-visible decision share the header strip rather than eat a
   * full panel-body row.
   *
   * Click events on the extra slot are stopped from bubbling so they
   * don't toggle the panel's collapse state.  That's done by the
   * consumer; this prop is purely a placement slot.
   */
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function Panel({
  title,
  ariaLabel,
  defaultOpen = true,
  headerExtra,
  children,
}: PanelProps): ReactNode {
  // Local UI state — no engine implications, no echo callback needed.
  // Session-only by design (see module header for the rationale behind
  // dropping localStorage persistence).
  const [open, setOpen] = useState<boolean>(defaultOpen);

  // Stable unique id for aria-controls — `useId` gives us one that's
  // unique per Panel instance without requiring the consumer to invent
  // a string.  The "body" suffix is purely for grep-friendliness; the
  // id itself is opaque.
  const bodyId = `${useId()}-body`;

  return (
    <div className={styles.panel} aria-label={ariaLabel}>
      {/*
        Title strip — a flex row holding the collapse-affordance <button>
        (chevron + title) and, optionally, a `headerExtra` slot for
        peer-level controls like the Settings panel's Tier chip.

        Why the extra slot sits OUTSIDE the <button>: nesting interactive
        elements inside a <button> is invalid HTML (no `button-in-button`,
        no `select` inside a button click target) and would either swallow
        the inner control's clicks or make screen-reader semantics
        ambiguous.  The flex container puts the title button and the
        extra slot side-by-side so each one owns its own click target.
        The title button still spans most of the row's width via
        `flex: 1`, so a click anywhere except the explicit extra-slot
        region still toggles the collapse.
      */}
      <div className={styles.titleRow}>
        {/*
          Title row doubles as the click target for collapse/expand.  Real
          <button> rather than a styled <div> so keyboard focus + Enter/Space
          activation + aria-expanded come for free.  CSS strips default
          button chrome so the row still reads as a plain heading until the
          cursor lands on it.
        */}
        <button
          type="button"
          className={styles.titleButton}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          {/*
            Chevron is a single ▸ glyph rotated 90° via CSS transform when
            open.  Animating transform is smooth; swapping text characters
            can't be animated.  Same affordance as the inner
            CollapsibleSection sub-sections, so the open/close gesture
            reads as one consistent "fold" at every nesting level.
          */}
          <span className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
            ▸
          </span>
          <span className={styles.title}>{title}</span>
        </button>
        {/*
          Optional inline slot (currently used by SettingsPanel for the
          Tier chip).  Rendered only when the consumer passes a node so
          panels without an extra control don't pay any layout cost.
        */}
        {headerExtra !== undefined && <div className={styles.headerExtra}>{headerExtra}</div>}
      </div>

      {/*
        Always-mounted body wrapper.  See the module header for the
        grid-template-rows animation — collapsed = `0fr` (row collapses
        to height 0), open = `1fr` (row grows to fit content).  Browsers
        interpolate between the two smoothly, which `height: auto`
        wouldn't.  The inner `.body` div has `min-height: 0` (so the
        grid CAN collapse it) and `overflow: hidden` (so content visibly
        clips during the transition).  Same mechanism as
        CollapsibleSection — see that file for the full physics.
      */}
      <div
        id={bodyId}
        className={cx(styles.bodyWrapper, open && styles.bodyWrapperOpen)}
        aria-hidden={!open}
      >
        {/*
          Two-level inner structure:
          - .body is the grid item.  Its only job is to be collapsible
            (min-height: 0, overflow: hidden, opacity).  No padding —
            padding here would add to the outer height even when grid
            forces the row to 0fr, leaving a stub of empty space below
            the title button on collapse.
          - .bodyContent owns the actual padding around the children.
            When the grid track collapses to 0, the padding goes with
            it because it's painted INSIDE .body's clipped overflow.
        */}
        <div className={styles.body}>
          <div className={styles.bodyContent}>{children}</div>
        </div>
      </div>
    </div>
  );
}
