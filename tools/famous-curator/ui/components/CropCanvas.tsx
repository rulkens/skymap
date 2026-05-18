/**
 * CropCanvas — source preview + crop overlay with rotation.
 *
 * Layout:
 *   - When `source` is undefined, renders a drop-zone placeholder.
 *   - When `source` is set, renders an <img> at the preview URL plus
 *     an absolutely-positioned crop rectangle with corner + edge handles,
 *     a body-drag region, and a rotation knob above the N edge.
 *
 * Pointer math: every pointermove on a resize/move handle translates
 * into a screen-px delta.  When the crop is rotated, we rotate the
 * delta by -rotationDeg into the rect's LOCAL frame before passing it
 * to cropMath.  The rotation handle is its own special case: we compute
 * the cursor's angle relative to the crop center and update
 * rotationDeg directly.
 *
 * `onFileDrop(file)` fires when the user drag-drops a local file onto
 * the canvas.  The parent calls /api/fetch with { bytes, mediaType }.
 *
 * Why is zoom a local state and not in the Redux-style reducer?
 * Zoom is purely a canvas-viewport preference — it doesn't affect the
 * crop coordinates that get persisted.
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
  rotateDelta,
  setRotation,
} from '../cropMath';
import type { Crop, Bounds } from '../cropMath';

type Handle =
  | 'body'
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  | 'rotate';

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
  /** on-screen px per source-image px at drag start */
  canvasScale: number;
  /**
   * For rotation drags: cursor's angle relative to the crop center at
   * the moment of pointerdown.  Used to convert subsequent cursor
   * positions into a rotation delta from `startCrop.rotationDeg`.
   */
  startAngleRad?: number;
  /** Crop center in screen coords, captured at pointerdown. */
  centerScreenX?: number;
  centerScreenY?: number;
};

export function CropCanvas(props: CropCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Mutable drag state — not React state because we don't want to re-render
  // on every pointermove (~60 re-renders/s for no visual gain; parent
  // re-renders on onCropChange which is enough).
  const dragRef = useRef<DragState | null>(null);

  const startDrag = useCallback(
    (handle: Handle) => (e: PointerEvent<HTMLElement>) => {
      if (!props.source || !props.crop) return;
      const img = containerRef.current?.querySelector(
        'img.curator-crop-source',
      ) as HTMLImageElement | null;
      if (!img) return;
      // canvasScale: on-screen-px per source-px.  getBoundingClientRect picks
      // up the CSS `transform: scale(zoom)` on the parent stage as well as
      // any browser page-zoom — both contribute to how far the cursor
      // travels per source pixel.  clientWidth ignores transforms.
      const imgRect = img.getBoundingClientRect();
      const canvasScale = imgRect.width / props.source.width;

      const next: DragState = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startCrop: props.crop,
        canvasScale,
      };
      if (handle === 'rotate') {
        // Crop center in screen coords stays fixed throughout a rotation
        // drag, so we cache it once at pointerdown.  Initial cursor angle
        // (relative to center) lets us derive rotation deltas in move.
        const centerSrcX = props.crop.x + props.crop.width / 2;
        const centerSrcY = props.crop.y + props.crop.height / 2;
        next.centerScreenX = imgRect.left + centerSrcX * canvasScale;
        next.centerScreenY = imgRect.top + centerSrcY * canvasScale;
        next.startAngleRad = Math.atan2(
          e.clientY - next.centerScreenY,
          e.clientX - next.centerScreenX,
        );
      }
      dragRef.current = next;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [props.source, props.crop],
  );

  const moveDrag = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d || !props.source) return;
      const b: Bounds = { width: props.source.width, height: props.source.height };

      if (d.handle === 'rotate') {
        const angleRad = Math.atan2(
          e.clientY - d.centerScreenY!,
          e.clientX - d.centerScreenX!,
        );
        const deltaDeg = ((angleRad - d.startAngleRad!) * 180) / Math.PI;
        props.onCropChange(setRotation(d.startCrop, d.startCrop.rotationDeg + deltaDeg));
        return;
      }

      // Screen-space delta in source-px.
      const dxScreen = (e.clientX - d.startX) / d.canvasScale;
      const dyScreen = (e.clientY - d.startY) / d.canvasScale;

      // Body drag is pure translation in world space — the rect moves
      // with the cursor regardless of its rotation.
      if (d.handle === 'body') {
        props.onCropChange(translateCrop(d.startCrop, dxScreen, dyScreen, b));
        return;
      }

      // Resize handles operate in the rect's LOCAL frame: the grabbed
      // handle should follow the cursor, which means the local-frame
      // delta is the screen delta rotated by -rotationDeg.  At
      // rotation=0 this reduces to (dxScreen, dyScreen).
      const { dx, dy } = rotateDelta(dxScreen, dyScreen, -d.startCrop.rotationDeg);

      let next: Crop;
      switch (d.handle) {
        case 'nw': next = resizeCornerNW(d.startCrop, dx, dy, b); break;
        case 'n':  next = resizeEdgeN(d.startCrop, dy, b); break;
        case 'ne': next = resizeCornerNE(d.startCrop, dx, dy, b); break;
        case 'e':  next = resizeEdgeE(d.startCrop, dx, b); break;
        case 'se': next = resizeCornerSE(d.startCrop, dx, dy, b); break;
        case 's':  next = resizeEdgeS(d.startCrop, dy, b); break;
        case 'sw': next = resizeCornerSW(d.startCrop, dx, dy, b); break;
        case 'w':  next = resizeEdgeW(d.startCrop, dx, b); break;
        // Exhaustive — `rotate` and `body` returned above.
        default: return;
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
    e.preventDefault();
  }, []);

  // Empty state — no source loaded yet.
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

  // Crop rect as percentages of the source image so the overlay lines
  // up correctly regardless of how the <img> is scaled by CSS.
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
        <button
          onClick={() => props.onCropChange(setRotation(props.crop!, 0))}
          disabled={props.crop.rotationDeg === 0}
        >
          Reset rotation
        </button>
        <span className="curator-crop-readout">
          crop {Math.round(props.crop.width)} × {Math.round(props.crop.height)} of{' '}
          {props.source.width} × {props.source.height} source ·{' '}
          {props.crop.rotationDeg.toFixed(1)}°
        </span>
      </div>

      <div className="curator-crop-stage">
        <div
          className="curator-crop-frame"
          style={{ transform: `scale(${zoom})` }}
        >
          <img className="curator-crop-source" src={props.source.previewUrl} alt="source" />

          {/* Crop overlay — rotated around its center.  Percentages of
              the frame === percentages of the image, so geometry stays
              honest under non-square aspect ratios. */}
          <div
            className="curator-crop-rect"
            style={{
              position: 'absolute',
              left: `${cropPctX}%`,
              top: `${cropPctY}%`,
              width: `${cropPctW}%`,
              height: `${cropPctH}%`,
              transform: `rotate(${props.crop.rotationDeg}deg)`,
              transformOrigin: 'center',
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
            {/* Rotation knob: short stem extending above the N edge, with a
                circular grab target at the top.  Rotates with the rect. */}
            <span className="curator-crop-rotate-stem" aria-hidden="true" />
            <span
              className="curator-crop-handle curator-crop-handle--rotate"
              data-handle="rotate"
              aria-label="Rotate crop"
              onPointerDown={(e) => {
                e.stopPropagation();
                startDrag('rotate')(e as PointerEvent<HTMLElement>);
              }}
              onPointerMove={moveDrag as (e: React.PointerEvent<HTMLSpanElement>) => void}
              onPointerUp={endDrag as (e: React.PointerEvent<HTMLSpanElement>) => void}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
