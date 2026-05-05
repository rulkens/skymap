/**
 * CollapsibleSection — a foldable sub-section inside the SettingsPanel.
 *
 * ### Why this exists
 *
 * The SettingsPanel grew to ~80 controls in seven loose groupings (Surveys,
 * Density correction, Tone curve, Visual sliders, Overlays, Input,
 * Orientation).  Without internal folding, the user had to scroll a
 * uniform wall of rows to find any single slider.
 *
 * Wrapping each grouping in a CollapsibleSection lets the user fold the
 * parts they don't currently care about while keeping the panel a single
 * overlay.  Each section persists its own open/closed state to
 * `localStorage` keyed by `storageKey`, so the user's chosen layout
 * survives reloads.
 *
 * ### Family resemblance to the top-level "Settings" collapse
 *
 * The SettingsPanel's outer frame has a top-level collapse — chevron + bold
 * title that folds the entire body away.  CollapsibleSection mirrors that
 * affordance one level inward: same chevron glyph, same uppercase title
 * style, just smaller and sitting *inside* the panel body rather than on
 * the panel's outer rounded frame.  The two together form a clear
 * "panel → sections" hierarchy.
 *
 * ### SSR safety
 *
 * The `useState` initializer reads `localStorage`, which doesn't exist
 * during server-side rendering.  We guard with `typeof window === 'undefined'`
 * so an SSR pass falls back to `defaultOpen` rather than crashing.  Same
 * guard in the persisting effect — though the effect doesn't run on the
 * server in practice, the guard makes the code self-documenting.
 *
 * Browsers in private-mode (Safari especially) can throw `QuotaExceededError`
 * from `localStorage.setItem` even when reading is allowed.  We swallow
 * those errors silently — the section still works, the open/closed state
 * just doesn't survive reload.
 */

import { useEffect, useState, type ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

type Props = {
  /** Header text, rendered uppercase by the stylesheet. */
  title: string;
  /**
   * Unique key under which the open/closed boolean is persisted to
   * `localStorage`.  Convention: dot-separated, hierarchical, scoped
   * to this panel — e.g. `'settings.section.surveys'`.  Two sections
   * with the same key would share state (and conflict on every render);
   * two with different keys are fully independent.
   */
  storageKey: string;
  /**
   * What to show on the *very first* visit, before any persisted value
   * exists.  After the first toggle this becomes irrelevant — the
   * persisted value wins.  Defaults to `true` because most users want
   * to see the controls until they decide to fold a section away.
   */
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Read the persisted open/closed state for a given storage key.
 *
 * Pulled out of the component so it can be unit-tested without mounting
 * React.  Returns `defaultOpen` if:
 *   - we're in a non-browser environment (SSR),
 *   - the key has never been written,
 *   - or `localStorage` access throws (Safari private mode etc.).
 *
 * The persisted format is intentionally minimal — `'1'` for open,
 * anything else for closed.  This keeps the stored payload tiny and
 * future-proof: if we ever want to add a third state (e.g. "torn off")
 * we can use `'2'` without breaking back-compat for the existing two.
 */
export function readSectionOpen(storageKey: string, defaultOpen: boolean): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  try {
    const v = window.localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === '1';
  } catch {
    return defaultOpen;
  }
}

/**
 * Write the open/closed state.  Swallows errors silently — see the
 * module-level docblock for why (private-mode quota, disabled
 * storage, etc.).
 */
export function writeSectionOpen(storageKey: string, open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, open ? '1' : '0');
  } catch {
    // Intentionally empty — see docblock.
  }
}

export function CollapsibleSection({
  title,
  storageKey,
  defaultOpen = true,
  children,
}: Props): ReactNode {
  // useState's lazy initializer pattern: pass a function so the
  // localStorage read happens exactly once at mount, not on every
  // re-render.  Cheap on its own, but the section may sit inside a
  // panel that re-renders on every slider tick — the guard matters.
  const [open, setOpen] = useState<boolean>(() => readSectionOpen(storageKey, defaultOpen));

  // Persist on every change.  Splitting writes into an effect (rather
  // than calling `writeSectionOpen` inline in the click handler) means
  // an external `setOpen(...)` would also persist — there isn't one
  // today, but the pattern is more robust to future refactors.
  useEffect(() => {
    writeSectionOpen(storageKey, open);
  }, [storageKey, open]);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/*
          Chevron is a single ▸ glyph; the `chevronOpen` modifier rotates
          it 90° via CSS transform when open.  Animating transform is
          smooth; swapping text characters can't be animated.
        */}
        <span
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          aria-hidden
        >
          ▸
        </span>
        <span className={styles.title}>{title}</span>
      </button>
      {/*
        The body always renders into the DOM — only its grid track
        height + opacity change between states.  This is what enables
        the height-from-0 animation: `display: none` / conditional
        rendering can't be transitioned, but a child of a CSS Grid
        whose row-template moves between `0fr` and `1fr` interpolates
        smoothly.  See the .bodyWrapper rule in the stylesheet for the
        animation mechanism + the modern-CSS rationale.

        `aria-hidden` mirrors the visual state for screen readers when
        closed.  `inert` would also make the contents non-focusable,
        but is React-19+ as a DOM prop; using inline `tabIndex` on
        children is impractical, so we accept that focus can technically
        land in a closed section via Tab key.  Not a big deal in
        practice — closed sections are typically opened then explored.
      */}
      <div
        className={styles.bodyWrapper}
        data-open={open}
        aria-hidden={!open}
      >
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
