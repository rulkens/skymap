/**
 * Panel — shared glassmorphic card with a collapsible header.
 *
 * ### Why this component exists
 *
 * The HUD has a family of left-stack overlays — Navigation, Settings,
 * Stats — that all wear the exact same chrome: blue-tinted glass card,
 * uppercase title row with a clickable chevron that folds the body away,
 * 300 px width.  Until this refactor, each panel re-implemented the
 * markup AND duplicated the CSS for that chrome (with a comment apologising
 * for the duplication).  Three forks of the same affordance is the point
 * at which "small duplication wins on clarity" stops being true — fixing
 * a hover-state bug or tweaking the corner radius required three identical
 * edits, and divergence was inevitable.
 *
 * Panel collapses (pun intended) the chrome into one component.  Consumers
 * pass `title`, `defaultOpen`, and `children`; the per-row styling lives in
 * the consumer's own CSS module (key/action for Navigation, label/value for
 * Stats, panelRow for Settings).  See `Panel.module.css` for the chrome
 * rules and the matching split between "shared chrome" and "per-panel rows".
 *
 * ### Collapse state — session-only, no localStorage
 *
 * Collapse is intentionally session-only.  An earlier draft persisted the
 * open/closed boolean to `localStorage` per-panel so a user's layout choice
 * survived reloads, but that wired three near-identical SSR-safe try/catch
 * blocks across the codebase and produced surprises (a user hides the Stats
 * panel once, then weeks later wonders why fps numbers stopped working).
 * A fresh visit always starts in the `defaultOpen` state — predictable,
 * cheap, no state synchronisation across tabs.
 *
 * If persistence becomes a real need, restore it as a single `persistKey`
 * prop on Panel rather than re-introducing the per-consumer helpers.
 *
 * ### Why conditional render rather than CSS hide
 *
 * The body is wrapped in `open && <div>...</div>` so a collapsed panel
 * removes its children from the DOM entirely.  This matches the existing
 * outer-collapse behaviour of SettingsPanel — for sub-sections inside the
 * panel we use a CSS height animation (see `CollapsibleSection.module.css`)
 * because those collapse/expand frequently and the visual smoothness
 * matters; at the panel level collapse is rare and the unmount cost is
 * negligible while the saved DOM weight (especially for SettingsPanel's
 * ~80 controls) is meaningful.
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
import styles from './Panel.module.css';

/** Props for Panel.  See module header for design rationale. */
export type PanelProps = {
  /**
   * Heading text rendered uppercase by the stylesheet.  Pass it the way
   * you'd want it to read in a sentence ("Settings", "STATS", "Navigation")
   * — the CSS handles the visual case.  (NavigationPanel and StatsPanel
   * historically passed already-uppercased strings; both forms work, but
   * lower- or title-case in the source reads more naturally.)
   */
  title: string;
  /**
   * Forwarded to the outer `<div>` as `aria-label`.  Optional because most
   * consumers' titles are already self-describing — supply this when the
   * panel's purpose isn't obvious from the title alone (e.g. "Render
   * statistics" disambiguates the "STATS" header for a screen reader).
   */
  ariaLabel?: string;
  /**
   * What to show on first mount.  Defaults to `true` (open) — the panels
   * are the primary affordance, and a first-time visitor should see them.
   * Pass `false` for panels that should start tucked away.
   */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Panel({ title, ariaLabel, defaultOpen = true, children }: PanelProps): ReactNode {
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
          Chevron sits LEFT of the heading like a tree-twirl.  Two glyphs
          (▾ open / ▸ closed) rather than a CSS rotation — the Panel
          intentionally doesn't animate; only the inner CollapsibleSection
          sub-sections do.  Keeping the markup minimal also matches the
          historical SettingsPanel outer collapse.
        */}
        <span className={styles.chevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className={styles.title}>{title}</span>
      </button>

      {/*
        Conditionally rendered body — see the module header for why we
        unmount rather than CSS-hide.  The `id` matches the title button's
        aria-controls so screen readers can navigate the relationship.
      */}
      {open && (
        <div id={bodyId} className={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}
