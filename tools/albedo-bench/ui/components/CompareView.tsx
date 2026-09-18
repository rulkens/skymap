/**
 * CompareView — original vs adjusted, as a wipe (drag anywhere but the
 * divider to pan, wheel to zoom about the cursor, the divider itself and
 * its ← → keys to wipe), side by side, or click/space-to-flip. Both images
 * always share `box`, so panning/zooming one view moves both together.
 * While a gesture is live (or its render is still catching up), the
 * currently-loaded images are CSS-transformed to approximate the live box
 * for instant feedback — see `previewTransform`; the arrow overlay is left
 * showing its last fit (design says either is fine, and refitting live at
 * large spans is the expensive path this avoids).
 */
import { useEffect, useRef, useState } from 'react';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds';
import type { FieldArrow } from '../api';
import { MAX_SPAN_DEG, MIN_SPAN_DEG, clampLat, wrapLon, type ViewState } from '../viewPresets';
import type { ViewMode } from './Navigator';

// Arbitrary visualisation scale — g's physical units (per unit slope) don't
// map to screen pixels; this just keeps typical arrows legible.
const ARROW_SCALE_PX = 60;
const MAX_ARROW_PX = 40;
const ARROW_REFERENCE_PX = 512;
const WIPE_KEY_STEP = 2;
// exp(deltaY * this): ~1.16x span per typical 100-unit wheel notch.
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
// Below this on-screen move, a flip-mode pointerup is a click, not a drag.
const CLICK_DRAG_TOLERANCE_PX = 4;

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

// CSS transform that maps the already-loaded `rendered` box's image onto an
// approximation of the live `box`, so a pan/zoom shows instantly instead of
// waiting on the network. Identity once the real render for `box` lands.
// `scale()`/`translate()` both anchor on the element's own centre (the
// default transform-origin), so the offset has to be centre-to-centre, not
// edge-to-edge — using edges here scales the offset up right along with the
// zoom and flings the preview off-stage.
function previewTransform(rendered: LonLatBounds, box: LonLatBounds): string {
  const rSpanLon = rendered.east - rendered.west;
  const rSpanLat = rendered.north - rendered.south;
  const spanLon = box.east - box.west;
  const spanLat = box.north - box.south;
  if (rSpanLon <= 0 || rSpanLat <= 0 || spanLon <= 0 || spanLat <= 0) return 'none';
  const scaleX = rSpanLon / spanLon;
  const scaleY = rSpanLat / spanLat;
  const centerRenderedLon = (rendered.west + rendered.east) / 2;
  const centerLon = (box.west + box.east) / 2;
  const centerRenderedLat = (rendered.south + rendered.north) / 2;
  const centerLat = (box.south + box.north) / 2;
  const txPct = ((centerRenderedLon - centerLon) / spanLon) * 100;
  const tyPct = ((centerLat - centerRenderedLat) / spanLat) * 100;
  return `translate(${txPct}%, ${tyPct}%) scale(${scaleX}, ${scaleY})`;
}

export type CompareViewProps = {
  originalUrl: string | undefined;
  adjustedUrl: string | undefined;
  viewMode: ViewMode;
  arrows: readonly FieldArrow[];
  box: LonLatBounds;
  view: ViewState;
  onView: (view: ViewState) => void;
  renderedBox: LonLatBounds | undefined;
  pending: boolean;
};

const HINT: Record<ViewMode, string> = {
  wipe: 'Drag to pan, wheel to zoom, drag the divider (or use ← →) to wipe.',
  'side-by-side': 'The two images side by side. Drag to pan, wheel to zoom.',
  flip: 'Click the image (or press space) to flip between them. Drag to pan, wheel to zoom.',
};

export function hintFor(mode: ViewMode): string {
  return HINT[mode];
}

type DragAnchor = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLon: number;
  startLat: number;
  movedPx: number;
};

export function CompareView(props: CompareViewProps) {
  const [wipePct, setWipePct] = useState(50);
  const [flipShowing, setFlipShowing] = useState<'original' | 'adjusted'>('adjusted');
  const dragRef = useRef<DragAnchor | null>(null);
  // A drag-to-pan gesture ends with a click event too; onPanPointerUp clears
  // dragRef before onClick runs, so this survives long enough to say "that
  // pointerup was the end of a drag, not a click" for the one tick it's needed.
  const suppressNextClickRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { originalUrl, adjustedUrl, viewMode, arrows, box, view, onView, renderedBox, pending } =
    props;

  // React's onWheel is attached passively (can't preventDefault, so the page
  // would scroll under the zoom); a native listener can opt out. The ref
  // keeps it reading the latest box/view/onView without re-attaching.
  const latestRef = useRef({ box, view, onView });
  latestRef.current = { box, view, onView };
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function handleWheel(e: WheelEvent) {
      const stageEl = (e.target as Element).closest('.stage');
      if (stageEl === null) return;
      e.preventDefault();
      const rect = stageEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const { box, view, onView } = latestRef.current;
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      const spanLon = box.east - box.west;
      const spanLat = box.north - box.south;
      const cursorLon = box.west + u * spanLon;
      const cursorLat = box.north - v * spanLat;
      const factor = Math.exp(e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const newSpan = Math.min(MAX_SPAN_DEG, Math.max(MIN_SPAN_DEG, view.spanDeg * factor));
      onView({
        lon: wrapLon(cursorLon + newSpan * (0.5 - u)),
        lat: clampLat(cursorLat + newSpan * (v - 0.5)),
        spanDeg: newSpan,
      });
    }
    root.addEventListener('wheel', handleWheel, { passive: false });
    return () => root.removeEventListener('wheel', handleWheel);
  }, []);

  // While the divider holds pointer capture its move/up events retarget to
  // it (spec'd) but still bubble to this ancestor, so checking `target`
  // here is what actually keeps a wipe drag from also panning the view.
  function isDividerEvent(e: React.PointerEvent<HTMLDivElement>): boolean {
    return (e.target as Element).closest('.divider') !== null;
  }

  function onPanPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isDividerEvent(e)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLon: view.lon,
      startLat: view.lat,
      movedPx: 0,
    };
  }

  function onPanPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isDividerEvent(e)) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    drag.movedPx = Math.max(drag.movedPx, Math.hypot(dxPx, dyPx));
    const spanLon = box.east - box.west;
    const spanLat = box.north - box.south;
    onView({
      lon: wrapLon(drag.startLon - (dxPx / rect.width) * spanLon),
      lat: clampLat(drag.startLat + (dyPx / rect.height) * spanLat),
      spanDeg: view.spanDeg,
    });
  }

  function onPanPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isDividerEvent(e)) return;
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  const xform = previewTransform(renderedBox ?? box, box);
  const panHandlers = {
    onPointerDown: onPanPointerDown,
    onPointerMove: onPanPointerMove,
    onPointerUp: onPanPointerUp,
  };
  const pendingBadge = pending ? <span className="pending-badge">Rendering…</span> : null;

  // The wheel listener is native (see above) and attaches to `rootRef`, so
  // that element has to be on every path — loading included — or a mount
  // that starts in the loading state never gets the listener attached.
  let content;
  if (originalUrl === undefined || adjustedUrl === undefined) {
    content = <div className="bench-compare-loading">Rendering…</div>;
  } else if (viewMode === 'side-by-side') {
    content = (
      <div className="pair">
        <figure>
          <figcaption>Original</figcaption>
          <div className="stage" {...panHandlers}>
            <img src={originalUrl} alt="original" draggable={false} style={{ transform: xform }} />
            {pendingBadge}
            <ArrowOverlay arrows={arrows} box={box} />
          </div>
        </figure>
        <figure>
          <figcaption>Adjusted</figcaption>
          <div className="stage" {...panHandlers}>
            <img src={adjustedUrl} alt="adjusted" draggable={false} style={{ transform: xform }} />
            {pendingBadge}
            <ArrowOverlay arrows={arrows} box={box} />
          </div>
        </figure>
      </div>
    );
  } else if (viewMode === 'flip') {
    const flip = () => setFlipShowing((s) => (s === 'original' ? 'adjusted' : 'original'));
    content = (
      <div
        className="stage flip-stage"
        role="button"
        tabIndex={0}
        {...panHandlers}
        onClick={() => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          flip();
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          suppressNextClickRef.current =
            drag !== null &&
            drag.pointerId === e.pointerId &&
            drag.movedPx > CLICK_DRAG_TOLERANCE_PX;
          onPanPointerUp(e);
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            flip();
          }
        }}
      >
        <img
          src={flipShowing === 'original' ? originalUrl : adjustedUrl}
          alt={flipShowing}
          draggable={false}
          style={{ transform: xform }}
        />
        <span className="tag l">{flipShowing === 'original' ? 'Original' : 'Adjusted'}</span>
        {pendingBadge}
        <ArrowOverlay arrows={arrows} box={box} />
      </div>
    );
  } else {
    // wipe: adjusted clipped over original, from the left edge to wipePct —
    // the divider (and drag anywhere else on the stage) moves that
    // boundary; panning owns the rest of the stage.
    content = (
      <div className="stage" {...panHandlers}>
        <img src={originalUrl} alt="original" draggable={false} style={{ transform: xform }} />
        <div
          className="clip"
          style={{ clipPath: `inset(0 ${100 - wipePct}% 0 0)`, transform: xform }}
        >
          <img src={adjustedUrl} alt="adjusted" draggable={false} />
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
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
            setWipePct(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              setWipePct((p) => Math.max(0, p - WIPE_KEY_STEP));
              e.preventDefault();
            }
            if (e.key === 'ArrowRight') {
              setWipePct((p) => Math.min(100, p + WIPE_KEY_STEP));
              e.preventDefault();
            }
          }}
        />
        <span className="tag l">Adjusted</span>
        <span className="tag r">Original</span>
        {pendingBadge}
        <ArrowOverlay arrows={arrows} box={box} />
      </div>
    );
  }

  return (
    <div className="compare-root" ref={rootRef}>
      {content}
    </div>
  );
}
