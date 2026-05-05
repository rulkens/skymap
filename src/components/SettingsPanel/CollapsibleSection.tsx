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

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
   * persisted value wins.  Defaults to `false` (collapsed) so a fresh
   * visitor sees a tidy panel of section headers rather than an
   * 80-control wall — they expand only the sections they care about,
   * and the choice persists from there.  Override with `defaultOpen={true}`
   * for any section that should be open on first visit (e.g. Surveys,
   * which is the panel's primary affordance).
   */
  defaultOpen?: boolean;
  children: ReactNode;
  /**
   * Optional master on/off checkbox rendered between the chevron and
   * the title.  Independent of the collapse: clicking the checkbox
   * does NOT expand or collapse the section, and clicking elsewhere
   * on the header still toggles the collapse without flipping the
   * checkbox.  We achieve this by `event.stopPropagation()` on the
   * checkbox's pointer/click events so the bubble doesn't reach the
   * surrounding <button>.
   *
   * When `headerToggle` is omitted, the section renders exactly as
   * before — the checkbox slot is fully absent, no layout shift.
   * Both the value and the change callback must be provided to render
   * the checkbox; passing only one is a programming error and ignored.
   */
  headerToggle?: boolean;
  onHeaderToggleChange?: (value: boolean) => void;
  /**
   * Optional indeterminate visual state for the master checkbox —
   * rendered as a dash/dot rather than empty or checked.  Used by
   * the Surveys section when SOME but not ALL per-source toggles are
   * on, to communicate "mixed".
   *
   * Why imperative: the HTML `indeterminate` IDL attribute is *not*
   * the same as the `checked` attribute.  It's a property on the DOM
   * element, settable only via JS (`el.indeterminate = true`), with
   * no JSX-level prop and no CSS pseudo-class that maps to it on
   * its own.  We therefore set it via `useEffect` against a `ref`,
   * after the input has rendered — standard React pattern for the
   * indeterminate-checkbox case.
   */
  headerToggleIndeterminate?: boolean;
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
  defaultOpen = false,
  children,
  headerToggle,
  onHeaderToggleChange,
  headerToggleIndeterminate,
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

  // Render the master checkbox slot only when both halves of the
  // controlled-input pair are wired.  This matches the SettingsPanel-
  // wide convention: an opt-in feature requires *both* value and
  // callback to avoid half-rendered controls (state-without-handler
  // or handler-without-state).
  const hasHeaderToggle = headerToggle !== undefined && onHeaderToggleChange !== undefined;

  // Imperative `indeterminate` setup — see the docblock on the prop
  // for why this can't be expressed declaratively in JSX.  The ref
  // points at the live <input> element after mount; we sync the IDL
  // attribute on every change of either the indeterminate flag or
  // the underlying checked state (because some browsers reset
  // `indeterminate` whenever `checked` is reassigned).
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = headerToggleIndeterminate ?? false;
    }
  }, [headerToggleIndeterminate, headerToggle]);

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
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden>
          ▸
        </span>
        {/*
          Optional master toggle.  Sits between the chevron and the
          title text.  We stop propagation on every pointer event so
          the surrounding <button>'s onClick (which toggles collapse)
          does NOT fire when the user clicks the checkbox: collapse
          and master-toggle are deliberately independent affordances.

          `onClick` alone isn't quite enough — the browser fires
          `click` after `mousedown`+`mouseup` resolve on the same
          target, but synthetic React events still bubble through
          parents.  Calling `stopPropagation` on the React event is
          sufficient here because the parent handler is also a React
          synthetic listener (the <button>'s onClick).
        */}
        {hasHeaderToggle && (
          <input
            ref={checkboxRef}
            type="checkbox"
            className={styles.headerToggle}
            checked={headerToggle}
            // The change handler fires on both real user clicks and
            // programmatic toggles (e.g. spacebar when focused).
            // Either way we want to invert the parent's value.
            onChange={(e) => {
              e.stopPropagation();
              onHeaderToggleChange(e.target.checked);
            }}
            // Mouse-down/up on the checkbox MUST NOT bubble to the
            // outer button — otherwise the browser would
            // additionally fire the button's click and toggle
            // collapse on top of the checkbox flip.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            // Keep keyboard activation working too — Space/Enter on
            // the focused checkbox should toggle just the checkbox,
            // not the surrounding button.
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Toggle ${title}`}
          />
        )}
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
      <div className={styles.bodyWrapper} data-open={open} aria-hidden={!open}>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
