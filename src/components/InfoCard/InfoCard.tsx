/**
 * InfoCard — the routing/logic layer for the galaxy info overlay.
 *
 * ### Display logic
 *
 * The card is absent from the DOM entirely when both `hovered` and `selected`
 * are null.  When one or both are present:
 *
 *   - Only one point active → a single FullCard (with a PINNED badge if it is
 *     the selected point and the cursor has moved away).
 *   - Both hovered AND selected pointing at *different* points → two cards
 *     stacked vertically: the full pinned card on top, a compact hover card
 *     below.  This lets the user keep a reference point pinned while scanning
 *     other galaxies.
 *
 * ### Why we always render the same outer wrapper
 *
 * The wrapping `<div className={styles.infoCardStack}>` is rendered the same
 * way in both single-card and stacked-pair states.  Earlier this component
 * conditionally unwrapped the FullCard out of the stack div in the single-
 * card case — but that meant React saw a different top-level element type
 * across the single↔pair transition, which forced a full unmount/remount of
 * the FullCard.  The most user-visible consequence: the native `<details>`
 * "More details" disclosure inside FullCard lost its `open` state every
 * time the user moved the cursor onto a second galaxy.
 *
 * Keeping the wrapper stable across all renders preserves the FullCard's
 * DOM identity, so the browser's `<details>` element retains its open/
 * closed state without us needing to lift it into React state.
 *
 * ### Architecture
 *
 * This file contains only the routing component.  The three display variants
 * live in sibling files: FullCard.tsx, CompactCard.tsx, Thumbnail.tsx.
 *
 * All components are pure functions of their props — no local state is needed
 * because the engine drives all changes via callbacks up to App.tsx.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { isPoi } from '../../services/engine/isPoi';
import { FullCard } from './FullCard';
import { CompactCard } from './CompactCard';
import { CompactPoiCard } from './CompactPoiCard';
import styles from './InfoCard.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for InfoCard.
 *
 * Both fields are nullable: when neither is set the component renders nothing.
 *
 * As of Task 5 of the unify-focus-clear refactor (2026-05-19), both slots
 * accept the full `FocusableTarget` union (`GalaxyInfo | PointOfInterest`).
 * The caller (App.tsx) merges POI and galaxy state before handing them here:
 *
 *   - `selected` receives `focusedPoi ?? selected` — POI wins when both are set.
 *   - `hovered` receives `hoveredPoi ?? hovered` — same precedence.
 *
 * InfoCard then dispatches via `isPoi` into typed sub-slots at the top of the
 * function body, preserving the three-case render logic unchanged.
 */
export type InfoCardProps = {
  /**
   * The point currently under the cursor, or null when the cursor is on empty
   * sky.  Can be either a galaxy or a POI — InfoCard dispatches via `isPoi`
   * to render the appropriate hover variant.
   */
  hovered: FocusableTarget | null;
  /**
   * The pinned/selected target, or null when nothing is pinned.  Same dispatch
   * as `hovered`.  When both `hovered` and `selected` are non-null and of the
   * same kind (galaxy/galaxy or poi/poi), the stacked-pair layout applies;
   * when they're different kinds (e.g. galaxy pinned, POI hovered), both render
   * in their respective slots.
   */
  selected: FocusableTarget | null;
  /**
   * Optional callback fired when the user clicks "Focus" (galaxy) or "Fly here"
   * (POI) on the pinned card.  Forwarded to FullCard; ignored on the compact
   * hover card.  Caller routes to the unified handle method
   * (`handle.camera.focusOn(target)`).
   */
  onFocus?: (target: FocusableTarget) => void;
  /**
   * Optional callback fired when the user clicks the Close (×) button on the
   * pinned card.  Same effect as pressing Esc — clears the selection.  Caller
   * routes to `handle.selection.clear()` which (since 2026-05-19) tears down
   * both galaxy AND POI selection in one call.
   */
  onClose?: () => void;
};

// ── InfoCard ───────────────────────────────────────────────────────────────────

/**
 * Galaxy/POI info card rendered as a fixed top-right overlay.
 *
 * Returns `null` (nothing in the DOM) when both props are null — keeps the
 * accessibility tree clean and avoids an empty glass-panel flashing at startup.
 *
 * @example
 * // In App.tsx:
 * <InfoCard hovered={hoveredPoi ?? hovered} selected={focusedPoi ?? selected} />
 */
export function InfoCard({ hovered, selected, onFocus, onClose }: InfoCardProps): ReactNode {
  // Nothing to show — stay entirely out of the DOM.
  if (!hovered && !selected) return null;

  // Dispatch via isPoi into typed sub-slots.  The engine-side mutex means a
  // hover or selection is exactly one kind at a time, but the InfoCard is total
  // over the union: a galaxy in one slot + POI in the other is a legal
  // configuration (e.g. galaxy pinned + POI hovered), and both render.
  //
  // PointOfInterest is identified by a top-level `category` field; GalaxyInfo
  // carries category only at `galaxyType.category`.  See isPoi.ts for the
  // full rationale of the `'category' in target` discriminant.
  const selectedPoi = selected && isPoi(selected) ? selected : null;
  const selectedGalaxy = selected && !isPoi(selected) ? (selected as GalaxyInfo) : null;
  const hoveredPoi = hovered && isPoi(hovered) ? hovered : null;
  const hoveredGalaxy = hovered && !isPoi(hovered) ? (hovered as GalaxyInfo) : null;

  // Suppression rules for the hover previews — the cursor can hover exactly
  // ONE thing at a time, so at most one compact card renders.
  //
  // POI hover takes precedence over galaxy hover when both slots happen to be
  // non-null in the same render.  The engine's hover throttler (runFrame.ts)
  // already clears the "other" hover sink on every pick (galaxy hit →
  // hoveredPoi = null; POI hit → hoveredGalaxy = null), so both being set is a
  // transient cross-render race we don't observe in practice — but enforcing
  // precedence here is the belt-and-braces guarantee.
  //
  // POI hover is additionally suppressed when the SAME POI is already pinned
  // (showing the preview's content twice is pure noise).  Mirrors the galaxy
  // `isStacked` rule (`hovered.index !== selected.index`).
  const showPoiHover = hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;
  // Galaxy hover hides when POI hover would render — POI wins.
  const showGalaxyHover = hoveredGalaxy != null && !showPoiHover;

  // ── Routing: which info goes into the FullCard, and is there a CompactCard? ──
  //
  // Three cases:
  //   1. `selectedPoi` is non-null → POI takes priority.  The FullCard
  //      renders the POI body; a CompactCard below shows the galaxy
  //      hover preview when present (rare in practice — POI clicks
  //      typically clear any pinned galaxy at the engine level).
  //   2. Both hovered AND selected (galaxies), and they're different
  //      points → the FullCard shows the pinned (selected) galaxy and
  //      a CompactCard below it shows the hover preview.
  //   3. Otherwise → only the FullCard, fed by hovered ?? selected.
  //      The "pinned" badge appears when the FullCard is showing the
  //      selection (i.e. the cursor has moved off-canvas or onto the
  //      same galaxy).
  //
  // Crucially we ALWAYS render the same outer wrapper structure
  // regardless of which case we're in — same tag, same className, same
  // role of the FullCard child.  An earlier version returned the
  // FullCard unwrapped in the single-card case; that meant React saw a
  // different top-level element type when the user moved the cursor
  // onto a second galaxy, which forced a full unmount/remount of the
  // FullCard and lost the native `<details>` "More details" open state
  // every time.  The galaxy↔POI transition uses the same FullCard
  // outer-`<div>` shape (className `infoCardFull`), so the same
  // reasoning applies: switching between cluster anchor and galaxy
  // body preserves any DOM-owned state inside.

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <FullCard
          mode={{ kind: 'poi', poi: selectedPoi }}
          pinned
          onPoiFocus={onFocus}
          onClose={onClose}
        />
        {showGalaxyHover && <CompactCard info={hoveredGalaxy!} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  // Galaxy / hover-only branch.  `fullCardInfo` may be null when the ONLY
  // active slot is a hovered POI (no galaxy hover, no galaxy pin, no POI pin)
  // — guard the FullCard render so we don't pass null into FullCard's required
  // `info` prop.
  //
  // Stacked galaxy pair only counts when POI hover isn't suppressing it — if
  // showPoiHover is true, the galaxy hover hides entirely and the FullCard
  // falls back to the pinned selection alone (or nothing).
  const isStacked =
    showGalaxyHover && selectedGalaxy != null && hoveredGalaxy!.index !== selectedGalaxy.index;
  const fullCardInfo: GalaxyInfo | null = isStacked
    ? selectedGalaxy
    : showGalaxyHover
      ? hoveredGalaxy
      : (selectedGalaxy ?? null);
  const fullCardPinned = isStacked ? true : !showGalaxyHover;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {fullCardInfo && (
        <FullCard
          info={fullCardInfo}
          pinned={fullCardPinned}
          onFocus={fullCardPinned && onFocus ? (info) => onFocus(info) : undefined}
          onClose={fullCardPinned ? onClose : undefined}
        />
      )}
      {isStacked && <CompactCard info={hoveredGalaxy!} />}
      {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
    </div>
  );
}
