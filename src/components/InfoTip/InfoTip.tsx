/**
 * InfoTip — a reusable hover/focus tooltip for explaining astronomy
 * jargon and unit conventions inline.
 *
 * The InfoCard surfaces a lot of dense numbers (parsecs, magnitudes,
 * redshifts, sexagesimal coords) that are second nature to astronomers
 * and total noise to everyone else.  Rather than padding every row
 * with a paragraph of explanation, we let casual readers dig in by
 * hovering or focusing the value: a small panel pops out with a one-
 * sentence definition and, optionally, a follow-up line giving the
 * intuition or formula.  The panel disappears the moment the user
 * looks elsewhere.
 *
 * ### Why hover *and* focus *and* tap
 *
 *   - Hover lets pointer users discover by accident — the dotted
 *     underline is the only persistent affordance, so the panel must
 *     surface itself promptly the moment the cursor lingers.
 *   - Focus support means keyboard-only users (Tab through the card)
 *     get the same content.  `tabIndex={0}` on the trigger is what
 *     actually wires this up; `:focus-within` on the wrapper handles
 *     the visual reveal.
 *   - On touch devices, neither of the above fires.  We rely on the
 *     browser's "tap to focus" behaviour for keyboardless users — a
 *     short tap on the dotted text focuses it (because tabIndex is
 *     present), which triggers `:focus-within` and shows the tip.  No
 *     dedicated tap handler needed.
 *
 * ### Why CSS anchor positioning
 *
 * Anchor positioning (Baseline 2026: Chrome 125+, Firefox 147+,
 * Safari 26) lets us declare "place this tip above the trigger; if it
 * would overflow the viewport, flip below or to the side" entirely in
 * CSS.  No JS sizing observers, no portal, no Popper.  Older browsers
 * fall back to classic `position: absolute` with `bottom: 100%` —
 * acceptable degradation: the tip still appears, just doesn't auto-
 * flip near viewport edges.
 *
 * Each instance gets a unique anchor name derived from `useId()` so
 * tips never accidentally bind to a different trigger when several
 * InfoTips coexist on the page (e.g. one per InfoCard row).
 *
 * ### Why @starting-style for the fade-in
 *
 * Hover-shown elements feel snappier with a 100-150 ms fade rather
 * than appearing instantly.  But the panel is `display: none` in its
 * resting state — and traditionally CSS transitions don't run from
 * `display: none → block`.  `@starting-style` (Baseline since
 * mid-2024) gives us a one-frame "starting" snapshot; combined with
 * `transition-behavior: allow-discrete` on `display`, the browser
 * keeps the element painted during the entire fade.  Pure CSS, no JS
 * timer or setTimeout(0) hack.
 *
 * ### Two shapes from one atom: teaching card vs compact label
 *
 * With a `body` the tip is a roomy teaching card — a title, a divider,
 * and an explanatory paragraph (the InfoCard jargon rows).  Without a
 * `body` it collapses to a compact label: just the title in a small
 * frosted box, no divider, no wide reading measure.  That label shape
 * is what the HUD's icon-only controls need — a terse "what does this
 * glyph do" hint — so `body` is optional and the label case is the
 * whole content.  One atom, one show/hide + anchor mechanism, two
 * looks; the toolbar pills and the TimeBar transport both ride it.
 */

import { useId } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import cx from 'classnames';
import styles from './InfoTip.module.css';

export type InfoTipProps = {
  /** Short heading rendered as the tip's title. Plain text only. */
  title: string;
  /**
   * The teaching-card body — accepts JSX so callers can include line
   * breaks, formulas, italics, etc.  Omit it for the compact
   * label-only shape (title alone, no divider): the look the HUD's
   * icon-only controls use for their hover hint.
   */
  body?: ReactNode;
  /**
   * The trigger content (the value or label that the user hovers).
   * Optional only because React's `createElement` signature can pass
   * children as a separate argument; in JSX usage children are always
   * supplied between the opening and closing tags.
   */
  children?: ReactNode;
  /**
   * When `true`, the trigger span doesn't claim its own keyboard
   * focus or `aria-describedby` — we assume the children include a
   * focusable element (button, link) that is the user's intended tab
   * stop.  The wrapper's `:focus-within` still catches that
   * descendant's focus, so the tip still reveals on Tab.  Use this to
   * wrap cards or links; leave it off (default) when the trigger is
   * a passive value or label that should itself be the focus target.
   */
  interactive?: boolean;
  /**
   * Restrict where the tip is allowed to appear relative to the
   * trigger on the block axis.
   *
   *   - `'auto'` (default) — try above, fall back to below if there's
   *     no room.  The right behaviour for a value in flowing text:
   *     if the viewport is tight, you'd rather see the tip below than
   *     have it clip.
   *   - `'top'` — top-only fallbacks.  Use when there's reliable space
   *     above the trigger (e.g. a footer-anchored bar where above is
   *     always free).
   *   - `'bottom'` — bottom-only fallbacks.  Use when there's reliable
   *     space below the trigger.  The featured-galaxy grid uses this
   *     because the cards live at the top of the palette panel and
   *     have empty list area / panel space below them — placing tips
   *     above would land on the search input or clip the viewport top.
   *
   * Horizontal `span-left` / `span-right` shifts are always allowed so
   * the tip stays on-screen near viewport edges.
   */
  placement?: 'auto' | 'top' | 'bottom';
};

export function InfoTip({
  title,
  body,
  children,
  interactive = false,
  placement = 'auto',
}: InfoTipProps): ReactNode {
  // useId returns a stable ID like ":r0:" — strip the colons so the
  // value is a valid CSS dashed-ident character set.  We don't need
  // it to be globally meaningful, only unique among co-rendered tips.
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9]/g, '');
  const anchorName = `--tip-${safeId}`;
  const tipDomId = `tip-${safeId}`;

  // React's CSSProperties typings include the modern anchor-positioning
  // declarations as of @types/react 19, but to keep the project portable
  // across older toolchains we cast through `Record<string, string>`.
  const triggerStyle: CSSProperties = { anchorName } as CSSProperties &
    Record<string, string>;
  const tipStyle: CSSProperties = { positionAnchor: anchorName } as CSSProperties &
    Record<string, string>;

  return (
    <span className={styles.wrapper}>
      <span
        // Interactive triggers carry no class — the focusable child
        // is already the visual affordance, so the trigger span is a
        // pure pass-through (default inline display, no dotted
        // underline, no cursor:help).  Inline `style={{ anchorName }}`
        // still resolves because an inline span has a principal box.
        className={interactive ? undefined : styles.trigger}
        // Passive triggers carry their own tabIndex + aria-describedby.
        // Interactive triggers leave focus to the focusable child (e.g.
        // a <button>), and the wrapper's :focus-within catches the
        // descendant focus so the tip still reveals on Tab.
        tabIndex={interactive ? undefined : 0}
        aria-describedby={interactive ? undefined : tipDomId}
        style={triggerStyle}
      >
        {children}
      </span>
      <span
        id={tipDomId}
        role="tooltip"
        className={cx(
          styles.tip,
          // No body → the compact label shape (no divider, tight box).
          body == null && styles.tipLabel,
          placement === 'top' && styles.tipTopOnly,
          placement === 'bottom' && styles.tipBottomOnly,
        )}
        style={tipStyle}
      >
        <span className={styles.tipTitle}>{title}</span>
        {body != null && <span className={styles.tipBody}>{body}</span>}
      </span>
    </span>
  );
}
