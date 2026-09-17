/**
 * CompareView — original vs adjusted, as a wipe, side by side, or flip, with
 * the fitted field drawn as arrows (length ∝ |g|, opacity ∝ confidence) at
 * each arrow's own lon/lat, projected into the box the images cover.
 */
import { useState } from 'react';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds';
import type { FieldArrow } from '../api';
import type { ViewMode } from './Navigator';

// Arbitrary visualisation scale — g's physical units (per unit slope) don't
// map to screen pixels; this just keeps typical arrows legible.
const ARROW_SCALE_PX = 60;
const MAX_ARROW_PX = 40;
const ARROW_REFERENCE_PX = 512;

function ArrowOverlay(props: { arrows: readonly FieldArrow[]; box: LonLatBounds }) {
  const { arrows, box } = props;
  const spanLon = box.east - box.west;
  const spanLat = box.north - box.south;
  if (spanLon <= 0 || spanLat <= 0 || arrows.length === 0) return null;
  return (
    <svg className="bench-arrows" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <marker
          id="bench-arrow-head"
          markerWidth="4"
          markerHeight="4"
          refX="2"
          refY="2"
          orient="auto"
        >
          <path d="M0,0 L4,2 L0,4 Z" fill="var(--bench-arrow)" />
        </marker>
      </defs>
      {arrows.map((a, i) => {
        const mag = Math.hypot(a.gx, a.gy);
        if (mag < 1e-6) return null;
        const x = ((a.lon - box.west) / spanLon) * 100;
        const y = ((box.north - a.lat) / spanLat) * 100;
        const lenPx = Math.min(MAX_ARROW_PX, mag * ARROW_SCALE_PX);
        // +gy is north, which is UP the screen — the opposite of +y.
        const dx = ((a.gx / mag) * lenPx * 100) / ARROW_REFERENCE_PX;
        const dy = ((-a.gy / mag) * lenPx * 100) / ARROW_REFERENCE_PX;
        return (
          <line
            key={i}
            x1={x}
            y1={y}
            x2={x + dx}
            y2={y + dy}
            stroke="var(--bench-arrow)"
            strokeWidth="0.3"
            opacity={Math.max(0, Math.min(1, a.confidence))}
            markerEnd="url(#bench-arrow-head)"
          />
        );
      })}
    </svg>
  );
}

export type CompareViewProps = {
  originalUrl: string | undefined;
  adjustedUrl: string | undefined;
  viewMode: ViewMode;
  arrows: readonly FieldArrow[];
  box: LonLatBounds;
};

export function CompareView(props: CompareViewProps) {
  const [wipePct, setWipePct] = useState(50);
  const [flipShowing, setFlipShowing] = useState<'original' | 'adjusted'>('adjusted');
  const { originalUrl, adjustedUrl, viewMode, arrows, box } = props;

  if (originalUrl === undefined || adjustedUrl === undefined) {
    return <div className="bench-compare bench-compare-loading">Rendering…</div>;
  }

  if (viewMode === 'side-by-side') {
    return (
      <div className="bench-compare bench-compare-side-by-side">
        <div className="bench-pane">
          <img src={originalUrl} alt="original" />
          <ArrowOverlay arrows={arrows} box={box} />
        </div>
        <div className="bench-pane">
          <img src={adjustedUrl} alt="adjusted" />
          <ArrowOverlay arrows={arrows} box={box} />
        </div>
      </div>
    );
  }

  if (viewMode === 'flip') {
    return (
      <div className="bench-compare bench-compare-flip">
        <button onClick={() => setFlipShowing((s) => (s === 'original' ? 'adjusted' : 'original'))}>
          showing {flipShowing} — click to flip
        </button>
        <div className="bench-pane">
          <img src={flipShowing === 'original' ? originalUrl : adjustedUrl} alt={flipShowing} />
          <ArrowOverlay arrows={arrows} box={box} />
        </div>
      </div>
    );
  }

  // wipe: adjusted stacked on top of original, clipped to the slider.
  return (
    <div className="bench-compare bench-compare-wipe">
      <div className="bench-pane bench-wipe-stack">
        <img src={originalUrl} alt="original" />
        <div className="bench-wipe-clip" style={{ clipPath: `inset(0 ${100 - wipePct}% 0 0)` }}>
          <img src={adjustedUrl} alt="adjusted" />
        </div>
        <ArrowOverlay arrows={arrows} box={box} />
      </div>
      <input
        aria-label="wipe position"
        type="range"
        min="0"
        max="100"
        value={wipePct}
        onChange={(e) => setWipePct(Number(e.target.value))}
      />
    </div>
  );
}
