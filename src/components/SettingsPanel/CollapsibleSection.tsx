/**
 * CollapsibleSection — a foldable sub-section inside the SettingsPanel.
 *
 * ### Why this exists
 *
 * The SettingsPanel grew to ~80 controls in seven loose groupings (Galaxy catalogs,
 * Density correction, Tone curve, Visual sliders, Overlays, Input,
 * Orientation).  Without internal folding, the user had to scroll a uniform
 * wall of rows to find any single slider.  Wrapping each grouping in a
 * CollapsibleSection lets the user fold the parts they don't currently
 * care about while keeping the panel a single overlay.
 *
 * ### Family resemblance to the outer Panel
 *
 * The outer Panel (`components/common/Panel`) already collapses the entire
 * SettingsPanel.  CollapsibleSection mirrors that affordance one level
 * inward: same chevron + uppercase title style, just smaller and sitting
 * inside the panel body.  Together they form a clear "panel → sections"
 * hierarchy.
 *
 * ### No localStorage persistence
 *
 * Open/closed state is session-only, defaulting to whatever `defaultOpen`
 * specifies.  An earlier version persisted each section under a per-section
 * `storageKey` so a user's section layout survived reloads, but that wired
 * SSR-safe try/catch helpers into the file and produced occasional
 * surprises (a section closed once, weeks later the user wonders where
 * a setting "moved" to).  A fresh visit always starts from the
 * `defaultOpen` baseline — predictable, no stale persisted state.
 *
 * If section-state persistence ever becomes a real need, restore it as a
 * single `persistKey` prop with one helper, not the previous mix of inline
 * functions across multiple modules.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import cx from 'classnames';
import styles from './CollapsibleSection.module.css';

export type CollapsibleSectionProps = {
  /** Header text, rendered uppercase by the stylesheet. */
  readonly title: string;
  /**
   * What to show on first mount.  Defaults to `false` (collapsed) so a
   * fresh visitor sees a tidy panel of section headers rather than an
   * 80-control wall — they expand only the sections they care about.
   * Override with `defaultOpen={true}` for sections that should be open
   * on first paint (e.g. Galaxy catalogs, the panel's primary affordance).
   */
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
  /**
   * Optional master on/off checkbox rendered between the chevron and
   * the title.  Independent of the collapse: clicking the checkbox does
   * NOT expand or collapse the section, and clicking elsewhere on the
   * header toggles the collapse without flipping the checkbox.  Achieved
   * by `event.stopPropagation()` on the checkbox events so the bubble
   * doesn't reach the surrounding <button>.
   *
   * When `headerToggle` is omitted, the section renders exactly as
   * before — the checkbox slot is fully absent, no layout shift.
   * Both the value and the change callback must be provided to render
   * the checkbox; passing only one is a programming error and ignored.
   */
  readonly headerToggle?: boolean;
  readonly onHeaderToggleChange?: (value: boolean) => void;
  /**
   * Optional indeterminate visual state for the master checkbox —
   * rendered as a dash/dot rather than empty or checked.  Used by the
   * Galaxy catalogs section when SOME but not ALL per-source toggles are on,
   * to communicate "mixed".
   *
   * Why imperative: the HTML `indeterminate` IDL attribute is not the
   * same as the `checked` attribute.  It's a property on the DOM element,
   * settable only via JS (`el.indeterminate = true`), with no JSX-level
   * prop and no CSS pseudo-class that maps to it on its own.  We set it
   * via `useEffect` against a `ref` after the input has rendered —
   * standard React pattern for the indeterminate-checkbox case.
   */
  readonly headerToggleIndeterminate?: boolean;
  /**
   * Marks the header toggle non-interactive without hiding or greying it —
   * a sighted user still sees the checkbox (so they know the feature exists),
   * a screen-reader user gets `aria-disabled` instead of silence, and both
   * get `disabledHint` as the `title` tooltip. Collapse/expand is unaffected:
   * the knobs underneath stay inspectable even when the master switch can't
   * be flipped (e.g. HDR sliders on a display that isn't HDR-capable).
   */
  readonly disabled?: boolean;
  /** Tooltip shown on the header toggle when `disabled`. */
  readonly disabledHint?: string;
};

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  headerToggle,
  onHeaderToggleChange,
  headerToggleIndeterminate,
  disabled,
  disabledHint,
}: CollapsibleSectionProps): ReactNode {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  // Render the master checkbox slot only when both halves of the
  // controlled-input pair are wired.  This matches the SettingsPanel-wide
  // convention: an opt-in feature requires *both* value and callback to
  // avoid half-rendered controls (state-without-handler or vice versa).
  const hasHeaderToggle = headerToggle !== undefined && onHeaderToggleChange !== undefined;

  // Imperative `indeterminate` setup — see the docblock on the prop for
  // why this can't be expressed declaratively in JSX.  The ref points at
  // the live <input> element after mount; we sync the IDL attribute on
  // every change of either the indeterminate flag or the underlying
  // checked state (because some browsers reset `indeterminate` whenever
  // `checked` is reassigned).
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = headerToggleIndeterminate ?? false;
    }
  }, [headerToggleIndeterminate, headerToggle]);

  return (
    <div className={styles.root}>
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
        <span className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
          ▸
        </span>
        {/*
          Optional master toggle.  Sits between the chevron and the title
          text.  We stop propagation on every pointer event so the
          surrounding <button>'s onClick (which toggles collapse) does
          NOT fire when the user clicks the checkbox: collapse and
          master-toggle are deliberately independent affordances.
        */}
        {hasHeaderToggle && (
          <input
            ref={checkboxRef}
            type="checkbox"
            className={styles.headerToggle}
            checked={headerToggle}
            aria-disabled={disabled || undefined}
            title={disabled ? disabledHint : undefined}
            onChange={(e) => {
              e.stopPropagation();
              if (disabled) {
                // React fires onChange for a checkbox click's native toggle
                // even when the click was preventDefault()'d, and the native
                // `checked` IDL has already flipped by the time either
                // handler runs — so undo it here rather than upstream. Not
                // the native `disabled` attribute: that drops the control
                // out of the tab order, which defeats announcing the hint.
                e.target.checked = headerToggle ?? false;
                return;
              }
              onHeaderToggleChange(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Toggle ${title}`}
          />
        )}
        <span className={styles.title}>{title}</span>
      </button>
      {/*
        The body always renders into the DOM — only its grid track height
        + opacity change between states.  This is what enables the
        height-from-0 animation: `display: none` and conditional rendering
        can't be transitioned, but a child of a CSS Grid whose row-template
        moves between `0fr` and `1fr` interpolates smoothly.  See the
        .bodyWrapper rule in the stylesheet for the animation mechanism.
      */}
      <div className={cx(styles.bodyWrapper, open && styles.bodyWrapperOpen)} aria-hidden={!open}>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

export default CollapsibleSection;
