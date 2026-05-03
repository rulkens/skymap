/**
 * InfoCard — the glassmorphism overlay that shows galaxy data on hover/select.
 *
 * ### Display logic
 *
 * The card is hidden when both `hovered` and `selected` are null. When either
 * is non-null we show it:
 *
 *   - A hovered point takes priority over the selection (live hover).
 *   - When the cursor moves off a galaxy (hovered === null) but a point is
 *     still selected, the card remains visible with a PINNED badge.
 *
 * This mirrors the imperative logic in the old `refreshCard()` function in
 * `main.ts`, now expressed as pure React props → JSX.
 *
 * ### CSS dependency
 *
 * Uses `id="info-card"` and the `.card-*` class names declared in `index.html`.
 * The `data-pinned` attribute on the outer div triggers the CSS rule:
 *
 *   #info-card[data-pinned] #pinned-badge { display: inline; }
 *
 * We pass it as `data-pinned=""` (empty string) when pinned, or omit the
 * attribute entirely when not. React treats `undefined` attribute values as
 * "omit this attribute", so the conditional is just:
 *
 *   data-pinned={isPinned ? '' : undefined}
 *
 * ### Formatting
 *
 * Numbers are formatted with the same decimal-place counts as the old code:
 *   RA / Dec:  4 dp  (e.g. "123.4567")
 *   Redshift:  4 dp  (e.g. "0.1234")
 *   Distance:  1 dp  (e.g. "542.3")  — shown with Mpc suffix in JSX
 *   Magnitude: 2 dp  (e.g. "18.45")
 *   Color:     3 dp  (e.g. "0.432")
 */

import type { ReactNode } from 'react';
import type { PointInfo } from '../engine';

/** Props for InfoCard. */
type InfoCardProps = {
  /** The point currently under the cursor, or null. */
  hovered:  PointInfo | null;
  /** The pinned/selected point, or null. */
  selected: PointInfo | null;
};

/**
 * Renders the galaxy info card.
 *
 * Returns `null` (renders nothing) when both props are null, so the card is
 * completely absent from the DOM rather than hidden — a small optimisation that
 * also keeps the accessibility tree clean when no data is available.
 *
 * @example
 * // In App.tsx:
 * <InfoCard hovered={hovered} selected={selected} />
 */
export function InfoCard({ hovered, selected }: InfoCardProps): ReactNode {
  // If there's nothing to show, render nothing at all.
  if (hovered === null && selected === null) return null;

  // Hover wins over selection for the displayed data.
  // isPinned is true only when we're falling back to the selected point with no
  // active hover — this triggers the PINNED badge.
  const point = hovered ?? selected!;
  const isPinned = hovered === null && selected !== null;

  return (
    // data-pinned attribute is present (empty string) when pinned, absent when
    // not. The CSS rule #info-card[data-pinned] #pinned-badge handles the badge.
    <div
      id="info-card"
      role="status"
      aria-live="polite"
      data-pinned={isPinned ? '' : undefined}
    >
      {/* Title row: "Object" label on the left, optional "PINNED" badge on the right */}
      <div className="card-title">
        <span>Object</span>
        <span id="pinned-badge">Pinned</span>
      </div>

      <CardRow label="Index"      value={String(point.index)} />
      <CardRow label="RA"         value={<>{point.ra.toFixed(4)}&deg;</>} />
      <CardRow label="Dec"        value={<>{point.dec.toFixed(4)}&deg;</>} />
      <CardRow label="Redshift z" value={point.redshift.toFixed(4)} />
      <CardRow label="Distance"   value={<>{point.distanceMpc.toFixed(1)} Mpc</>} />
      <CardRow label="Magnitude"  value={point.magnitude.toFixed(2)} />
      <CardRow label="Color (u−g)" value={point.colorIndex.toFixed(3)} />
    </div>
  );
}

// ── CardRow ───────────────────────────────────────────────────────────────────

/** Props for a single key-value row in the info card. */
type CardRowProps = {
  /** The field label (left side). */
  label: string;
  /** The field value — either a plain string or JSX with inline elements (° symbols, units). */
  value: ReactNode;
};

/**
 * A single label/value row inside the info card.
 *
 * Extracted as its own component to keep `InfoCard`'s JSX readable and to
 * avoid repeating the `.card-row` / `.card-label` / `.card-value` class names
 * seven times.
 *
 * Note: `React.ReactNode` as the value type lets callers pass a plain string
 * or a JSX fragment (e.g. `<>{value}&deg;</>`) without extra wrappers.
 */
function CardRow({ label, value }: CardRowProps): ReactNode {
  return (
    <div className="card-row">
      <span className="card-label">{label}</span>
      <span className="card-value">{value}</span>
    </div>
  );
}
