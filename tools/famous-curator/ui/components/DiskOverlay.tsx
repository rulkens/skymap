/**
 * DiskOverlay — SVG layer that sits on top of the source image in the
 * crop frame, showing a galaxy disk ellipse and three draggable handles.
 *
 * Coordinate system:
 *   All geometry is in SOURCE-image pixels (not CSS px, not screen px).
 *   The SVG viewBox matches the source dimensions so disk.centerPx,
 *   disk.radiusPx, etc. map directly into SVG user units with no scaling
 *   arithmetic inside this component.
 *
 * Overlay alignment:
 *   The parent .curator-crop-frame is an inline-block that shrink-wraps
 *   its contents.  The <img className="curator-crop-source"> inside it
 *   renders at its natural (preview) size — display:block, no max-width.
 *   We position the SVG absolutely with inset:0 and set width/height to
 *   100% of the frame, which matches the img exactly.  Using
 *   preserveAspectRatio="none" would distort the ellipse if the SVG
 *   element's aspect ever drifted from the viewBox's; the default
 *   'xMidYMid meet' is safer here because the frame and img share the
 *   same natural dimensions, so the SVG fills the frame completely while
 *   still honouring the viewBox aspect ratio — no letterboxing, no
 *   distortion.
 *
 * Interaction model:
 *   When interactive=false (crop mode), the root SVG has pointer-events:none
 *   so crop handles beneath it receive events.  When interactive=true
 *   (disk mode), draggable handles enable their own pointer-events and the
 *   SVG background creates new disks on press-drag-release.
 *
 * Drag pattern mirrors CropCanvas:
 *   A mutable ref (NOT state) holds the in-flight drag to avoid ~60
 *   re-renders/s.  setPointerCapture on pointerdown + releasePointerCapture
 *   on pointerup keeps events locked to the initiating element.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RecipeDisk } from '../../plugin/recipe';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import {
  diskFromDrag,
  majorAxisHandle,
  minorAxisHandle,
  axisRatioFromMinorDrag,
} from '../diskOverlay';
import { DEPROJECT_MIN_AXIS_RATIO } from '../../../../src/data/famousCalibration';

export type DiskOverlayProps = {
  source: { width: number; height: number; previewUrl: string };
  disk: RecipeDisk | undefined;
  /**
   * Catalog-derived axis ratio (b/a) from the seed's HyperLEDA enrichment.
   * Pre-fills the minor axis and seeds the deproject toggle on first creation;
   * the user can override by dragging the minor handle.
   */
  catalogAxisRatio?: number | undefined;
  interactive: boolean;
  onDiskChange: (d: RecipeDisk) => void;
};

/** Draggable handle kinds. */
type DiskHandle = 'center' | 'edge' | 'minor';

type DragState = {
  handle: DiskHandle | 'create';
  /** Nucleus position when handle='create', captured at pointerdown. */
  createCenter?: Vec2;
};

/**
 * Convert a pointer event's client coords to source-image px.
 *
 * Divides each axis separately so the conversion is correct for non-square
 * sources — a 1000×500 source mapped onto a 200×100 CSS element has
 * scale-x=5 and scale-y=5, but a 1000×800 source mapped onto 200×160 also
 * has different pixel densities per axis when preserveAspectRatio="none"
 * is NOT used (and the image may be letter-boxed by the browser).
 * Computing per-axis scales from getBoundingClientRect ensures we always
 * land on the correct source pixel regardless of container or page zoom.
 */
function toSourcePx(
  e: PointerEvent,
  svgEl: SVGSVGElement,
  source: { width: number; height: number },
): Vec2 {
  const rect = svgEl.getBoundingClientRect();
  return [
    (e.clientX - rect.left) / (rect.width / source.width),
    (e.clientY - rect.top) / (rect.height / source.height),
  ];
}

/**
 * Grab-handle and stroke sizes are authored in SCREEN px and converted into
 * the SVG's source-px user units at render time.  Anything left in user units
 * shrinks as the source grows: a 4000px source shown in a 400px frame renders
 * an 8-unit handle as a sub-pixel dot.  Stroke widths have the same problem in
 * WebKit, which ignores the CSS `vector-effect` property — so the strokes also
 * carry `vector-effect="non-scaling-stroke"` as an element attribute (honoured
 * everywhere) rather than relying on the stylesheet alone.
 */
const HANDLE_RADIUS_SCREEN = 7;

export function DiskOverlay(props: DiskOverlayProps) {
  const { source, disk, catalogAxisRatio, interactive, onDiskChange } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Live display scale (rendered px per source px).  Tracked so screen-constant
  // handle radii can be expressed in the SVG's source-px user units; a
  // ResizeObserver keeps it correct across window resizes and layout shifts.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setScale(rect.width / source.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [source.width]);

  // ── Pointer handlers ────────────────────────────────────────────────────

  const onSvgPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!interactive || !svgRef.current) return;
      // Only respond to background clicks — handle pointerdowns call
      // stopPropagation so they don't bubble here.
      const pt = toSourcePx(e.nativeEvent, svgRef.current, source);
      dragRef.current = { handle: 'create', createCenter: pt };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [interactive, source],
  );

  const onSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const d = dragRef.current;
      if (!d || !svgRef.current) return;
      const pt = toSourcePx(e.nativeEvent, svgRef.current, source);
      if (d.handle === 'create' && d.createCenter) {
        const g = diskFromDrag(d.createCenter, pt);
        if (g.radiusPx < 1) return; // guard zero-radius flicker
        // Pre-fill minor axis from the catalog b/a; seed deproject for
        // round-ish galaxies only (inclined disks deproject poorly).
        onDiskChange({
          ...g,
          ...(catalogAxisRatio !== undefined ? { axisRatio: catalogAxisRatio } : {}),
          deproject: (catalogAxisRatio ?? 1) >= DEPROJECT_MIN_AXIS_RATIO,
        });
      }
    },
    [source, catalogAxisRatio, onDiskChange],
  );

  const onSvgPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  // ── Per-handle drag factory ──────────────────────────────────────────────

  const startHandleDrag = useCallback(
    (handle: DiskHandle) => (e: ReactPointerEvent<SVGCircleElement>) => {
      if (!interactive || !disk) return;
      e.stopPropagation(); // don't trigger bg create
      dragRef.current = { handle };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [interactive, disk],
  );

  const onHandlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGCircleElement>) => {
      const d = dragRef.current;
      if (!d || d.handle === 'create' || !disk || !svgRef.current) return;
      const pt = toSourcePx(e.nativeEvent, svgRef.current, source);
      switch (d.handle) {
        case 'center':
          onDiskChange({ ...disk, centerPx: pt });
          break;
        case 'edge': {
          const g = diskFromDrag(disk.centerPx, pt);
          onDiskChange({ ...disk, radiusPx: g.radiusPx, paDeg: g.paDeg });
          break;
        }
        case 'minor':
          onDiskChange({ ...disk, axisRatio: axisRatioFromMinorDrag(disk, pt) });
          break;
      }
    },
    [disk, source, onDiskChange],
  );

  const onHandlePointerUp = useCallback((e: ReactPointerEvent<SVGCircleElement>) => {
    if (dragRef.current) {
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const edgePt = disk ? majorAxisHandle(disk) : undefined;
  // Effective axis ratio: user override > catalog > round (1).  The minor
  // handle position and the ellipse ry both reflect this resolved value so
  // the visual is always consistent with what the pipeline will use.
  const effectiveAxisRatio = disk ? (disk.axisRatio ?? catalogAxisRatio ?? 1) : 1;
  const minorPt = disk ? minorAxisHandle(disk, effectiveAxisRatio) : undefined;
  const ellipseTransform = disk
    ? `rotate(${disk.paDeg}, ${disk.centerPx[0]}, ${disk.centerPx[1]})`
    : undefined;
  // Screen-constant handle radius expressed in source-px user units.
  const handleRadiusSrc = HANDLE_RADIUS_SCREEN / scale;

  return (
    <svg
      ref={svgRef}
      className="curator-disk-overlay"
      viewBox={`0 0 ${source.width} ${source.height}`}
      // preserveAspectRatio default (xMidYMid meet) — see module comment.
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
    >
      {disk && edgePt && minorPt && (
        <g style={{ pointerEvents: 'none' }}>
          {/* Major-axis line: centre → edge handle */}
          <line
            className="curator-disk-axis"
            vectorEffect="non-scaling-stroke"
            x1={disk.centerPx[0]}
            y1={disk.centerPx[1]}
            x2={edgePt[0]}
            y2={edgePt[1]}
          />
          {/* Ellipse outline: rx = major, ry = minor, rotated by paDeg */}
          <ellipse
            className="curator-disk-ellipse"
            vectorEffect="non-scaling-stroke"
            cx={disk.centerPx[0]}
            cy={disk.centerPx[1]}
            rx={disk.radiusPx}
            ry={disk.radiusPx * effectiveAxisRatio}
            transform={ellipseTransform}
          />
        </g>
      )}

      {/* Draggable handles — pointer-events:all so they receive events even
          when the parent g has pointer-events:none. */}
      {disk && (
        <>
          {/* Center handle */}
          <circle
            className="curator-disk-handle"
            data-handle="center"
            data-testid="disk-handle-center"
            cx={disk.centerPx[0]}
            cy={disk.centerPx[1]}
            r={handleRadiusSrc}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: interactive ? 'all' : 'none', cursor: 'move' }}
            onPointerDown={startHandleDrag('center')}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
          />
          {/* Edge (major-axis) handle */}
          {edgePt && (
            <circle
              className="curator-disk-handle"
              data-handle="edge"
              data-testid="disk-handle-edge"
              cx={edgePt[0]}
              cy={edgePt[1]}
              r={handleRadiusSrc}
            vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: interactive ? 'all' : 'none', cursor: 'crosshair' }}
              onPointerDown={startHandleDrag('edge')}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            />
          )}
          {/* Minor-axis handle */}
          {minorPt && (
            <circle
              className="curator-disk-handle"
              data-handle="minor"
              data-testid="disk-handle-minor"
              cx={minorPt[0]}
              cy={minorPt[1]}
              r={handleRadiusSrc}
            vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: interactive ? 'all' : 'none', cursor: 'ns-resize' }}
              onPointerDown={startHandleDrag('minor')}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            />
          )}
        </>
      )}
    </svg>
  );
}
