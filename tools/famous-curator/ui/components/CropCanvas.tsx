/**
 * CropCanvas — source preview + 1:1 crop overlay.
 *
 * Layout:
 *   - When `source` is undefined, renders a drop-zone placeholder.
 *   - When `source` is set, renders an <img> at the preview URL plus
 *     an absolutely-positioned crop rectangle with corner + edge
 *     handles and a body-drag region.
 *
 * Pointer math: every pointermove on a handle translates into a delta
 * in source-pixel space (canvasDeltaPx ÷ canvasScale) and calls the
 * matching `cropMath` helper.  The component just owns the
 * pointer-event plumbing — the geometry is all in cropMath.ts.
 *
 * Why pointer events instead of mouse events?
 * `setPointerCapture` routes all subsequent events (even when the
 * cursor leaves the element) to the target, giving smooth drag
 * behaviour with no "escaped cursor" glitches.  Mouse-events have no
 * equivalent without global listeners.
 *
 * `onFileDrop(file)` fires when the user drag-drops a local file onto
 * the canvas.  The parent calls /api/fetch with { bytes, mediaType }.
 *
 * Why is zoom a local state and not in the Redux-style reducer?
 * Zoom is purely a canvas-viewport preference — it doesn't affect the
 * crop coordinates that get persisted.  Keeping it local avoids
 * polluting the global state with UI transients and makes the
 * component self-contained for reuse.
 */
import { useCallback, useRef, useState } from 'react';
import type { PointerEvent, DragEvent } from 'react';
import {
  resetCrop,
  translateCrop,
  resizeCornerNE,
  resizeCornerNW,
  resizeCornerSE,
  resizeCornerSW,
  resizeEdgeN,
  resizeEdgeE,
  resizeEdgeS,
  resizeEdgeW,
} from '../cropMath';
import type { Crop, Bounds } from '../cropMath';

type Handle =
  | 'body'
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type CropCanvasProps = {
  source: { width: number; height: number; previewUrl: string } | undefined;
  crop: Crop | undefined;
  onCropChange: (c: Crop) => void;
  onFileDrop: (file: File) => void;
};

type DragState = {
  handle: Handle;
  startX: number;
  startY: number;
  startCrop: Crop;
  /** on-screen px per source-image px at the time the drag started */
  canvasScale: number;
};

export function CropCanvas(props: CropCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Mutable drag state — not React state because we don't want to re-render
  // on every pointermove (that would be ~60 re-renders/s for no visual gain;
  // the parent re-renders on onCropChange which is enough).
  const dragRef = useRef<DragState | null>(null);

  const startDrag = useCallback(
    (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
      if (!props.source || !props.crop) return;
      const img = containerRef.current?.querySelector(
        'img.curator-crop-source',
      ) as HTMLImageElement | null;
      if (!img) return;
      // canvasScale = on-screen-px-per-source-px.  Use getBoundingClientRect
      // (not clientWidth) so the value reflects the parent stage's CSS
      // `transform: scale(zoom)` as well as any browser page-zoom — both
      // contribute to how far the cursor travels per source pixel.
      // clientWidth ignores CSS transforms and is also interpreted
      // inconsistently across browsers (e.g. Brave with fingerprint
      // protection), which previously made drags run at 2× speed there.
      const canvasScale = img.getBoundingClientRect().width / props.source.width;
      dragRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startCrop: props.crop,
        canvasScale,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [props.source, props.crop],
  );

  const moveDrag = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d || !props.source) return;
      const dx = (e.clientX - d.startX) / d.canvasScale;
      const dy = (e.clientY - d.startY) / d.canvasScale;
      const b: Bounds = { width: props.source.width, height: props.source.height };
      let next: Crop;
      switch (d.handle) {
        case 'body': next = translateCrop(d.startCrop, dx, dy, b); break;
        case 'nw':   next = resizeCornerNW(d.startCrop, dx, dy, b); break;
        case 'n':    next = resizeEdgeN(d.startCrop, dy, b); break;
        case 'ne':   next = resizeCornerNE(d.startCrop, dx, dy, b); break;
        case 'e':    next = resizeEdgeE(d.startCrop, dx, b); break;
        case 'se':   next = resizeCornerSE(d.startCrop, dx, dy, b); break;
        case 's':    next = resizeEdgeS(d.startCrop, dy, b); break;
        case 'sw':   next = resizeCornerSW(d.startCrop, dx, dy, b); break;
        case 'w':    next = resizeEdgeW(d.startCrop, dx, b); break;
      }
      props.onCropChange(next);
    },
    [props],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLElement>) => {
    if (dragRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) props.onFileDrop(file);
    },
    [props],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Prevent the browser's default "copy file into page" behaviour so
    // our custom onDrop handler fires.
    e.preventDefault();
  }, []);

  // Empty state — no source loaded yet.  Show a drop-zone invitation.
  if (!props.source || !props.crop) {
    return (
      <div
        className="curator-crop-canvas curator-crop-canvas--empty"
        data-testid="curator-crop-dropzone"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <p>Paste a URL above or drop an image file here.</p>
      </div>
    );
  }

  // Express the crop rectangle as percentages of the source image so the
  // overlay lines up correctly regardless of how the <img> is scaled by CSS.
  const cropPctX = (props.crop.x / props.source.width) * 100;
  const cropPctY = (props.crop.y / props.source.height) * 100;
  const cropPctW = (props.crop.width / props.source.width) * 100;
  const cropPctH = (props.crop.height / props.source.height) * 100;

  return (
    <div
      className="curator-crop-canvas"
      ref={containerRef}
      data-testid="curator-crop-dropzone"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* Controls strip above the stage */}
      <div className="curator-crop-controls">
        <label>
          Zoom{' '}
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() =>
            props.onCropChange(
              resetCrop({ width: props.source!.width, height: props.source!.height }),
            )
          }
        >
          Reset crop
        </button>
        <span className="curator-crop-readout">
          crop {props.crop.width} × {props.crop.height} of {props.source.width} ×{' '}
          {props.source.height} source
        </span>
      </div>

      {/* Stage centres the frame; frame shrink-wraps the image so the
          absolutely-positioned crop rect's containing block IS the image.
          Without that, percentage-positioned rects drift off the image
          whenever the stage's aspect ratio differs from the image's. */}
      <div className="curator-crop-stage">
        <div
          className="curator-crop-frame"
          style={{ transform: `scale(${zoom})` }}
        >
          <img className="curator-crop-source" src={props.source.previewUrl} alt="source" />

          {/* Crop overlay: percentages of the frame === percentages of the
              image, so a square crop in source-px renders as a square
              overlay and matches exactly what /api/process extracts. */}
          <div
            className="curator-crop-rect"
            style={{
              position: 'absolute',
              left: `${cropPctX}%`,
              top: `${cropPctY}%`,
              width: `${cropPctW}%`,
              height: `${cropPctH}%`,
            }}
            onPointerDown={startDrag('body')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((h) => (
              <span
                key={h}
                className={`curator-crop-handle curator-crop-handle--${h}`}
                data-handle={h}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag(h)(e as PointerEvent<HTMLElement>);
                }}
                onPointerMove={moveDrag as (e: React.PointerEvent<HTMLSpanElement>) => void}
                onPointerUp={endDrag as (e: React.PointerEvent<HTMLSpanElement>) => void}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
