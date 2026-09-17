/**
 * CompareView — original vs adjusted, as a wipe (drag anywhere on the stage,
 * or the divider's ← → keys), side by side, or click/space-to-flip, with the
 * fitted field drawn as arrows (length ∝ |g|, opacity ∝ confidence) at each
 * arrow's own lon/lat, projected into the box the images cover.
 */
import { useRef, useState } from 'react';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds';
import type { FieldArrow } from '../api';
import type { ViewMode } from './Navigator';

// Arbitrary visualisation scale — g's physical units (per unit slope) don't
// map to screen pixels; this just keeps typical arrows legible.
const ARROW_SCALE_PX = 60;
const MAX_ARROW_PX = 40;
const ARROW_REFERENCE_PX = 512;
const WIPE_KEY_STEP = 2;

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

const HINT: Record<ViewMode, string> = {
  wipe: 'Drag the divider (or use ← →).',
  'side-by-side': 'The two images side by side.',
  flip: 'Click the image (or press space) to flip between them.',
};

export function hintFor(mode: ViewMode): string {
  return HINT[mode];
}

export function CompareView(props: CompareViewProps) {
  const [wipePct, setWipePct] = useState(50);
  const [flipShowing, setFlipShowing] = useState<'original' | 'adjusted'>('adjusted');
  const stageRef = useRef<HTMLDivElement>(null);
  const { originalUrl, adjustedUrl, viewMode, arrows, box } = props;

  if (originalUrl === undefined || adjustedUrl === undefined) {
    return <div className="bench-compare-loading">Rendering…</div>;
  }

  function pctFromClientX(clientX: number): number {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return wipePct;
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }

  if (viewMode === 'side-by-side') {
    return (
      <div className="pair">
        <figure>
          <figcaption>Original</figcaption>
          <div className="stage">
            <img src={originalUrl} alt="original" />
            <ArrowOverlay arrows={arrows} box={box} />
          </div>
        </figure>
        <figure>
          <figcaption>Adjusted</figcaption>
          <div className="stage">
            <img src={adjustedUrl} alt="adjusted" />
            <ArrowOverlay arrows={arrows} box={box} />
          </div>
        </figure>
      </div>
    );
  }

  if (viewMode === 'flip') {
    const flip = () => setFlipShowing((s) => (s === 'original' ? 'adjusted' : 'original'));
    return (
      <div
        className="stage flip-stage"
        role="button"
        tabIndex={0}
        onClick={flip}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            flip();
          }
        }}
      >
        <img src={flipShowing === 'original' ? originalUrl : adjustedUrl} alt={flipShowing} />
        <span className="tag l">{flipShowing === 'original' ? 'Original' : 'Adjusted'}</span>
        <ArrowOverlay arrows={arrows} box={box} />
      </div>
    );
  }

  // wipe: adjusted clipped over original, from the left edge to wipePct —
  // the divider (and drag anywhere on the stage) moves that boundary.
  return (
    <div
      ref={stageRef}
      className="stage"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setWipePct(pctFromClientX(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) setWipePct(pctFromClientX(e.clientX));
      }}
    >
      <img src={originalUrl} alt="original" />
      <div className="clip" style={{ clipPath: `inset(0 ${100 - wipePct}% 0 0)` }}>
        <img src={adjustedUrl} alt="adjusted" />
      </div>
      <div
        className="divider"
        style={{ left: `${wipePct}%` }}
        role="slider"
        tabIndex={0}
        aria-label="wipe position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(wipePct)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setWipePct((v) => Math.max(0, v - WIPE_KEY_STEP));
            e.preventDefault();
          }
          if (e.key === 'ArrowRight') {
            setWipePct((v) => Math.min(100, v + WIPE_KEY_STEP));
            e.preventDefault();
          }
        }}
      />
      <span className="tag l">Adjusted</span>
      <span className="tag r">Original</span>
      <ArrowOverlay arrows={arrows} box={box} />
    </div>
  );
}
