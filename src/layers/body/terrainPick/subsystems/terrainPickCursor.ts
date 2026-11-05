/**
 * terrainPickCursor — the marker's own read of the pointer, and its render wake. It listens
 * here rather than through the `input` slice so that deleting this module leaves core
 * untouched: hover never wakes the loop otherwise, and core holds no cursor for anyone.
 */

import { cssToTexPx } from '../../../../services/engine/helpers/cssToTexPx';
import type { TerrainPickCursor } from '../@types/TerrainPickCursor';

export function createTerrainPickCursor(
  canvas: HTMLCanvasElement,
  isOn: () => boolean,
  requestRender: () => void,
): TerrainPickCursor {
  function onMove(e: PointerEvent): void {
    // A held button is a camera gesture, and touch and pen have no hover.
    if (e.pointerType !== 'mouse' || e.buttons !== 0 || !isOn()) return;
    cursor.texPx = [cssToTexPx(e.offsetX), cssToTexPx(e.offsetY)];
    requestRender();
  }

  const cursor: TerrainPickCursor = {
    texPx: null,
    destroy: () => canvas.removeEventListener('pointermove', onMove),
  };

  // A dome frame has no single cursor ray; `createEngine` stamps the rig before any Layer exists.
  if (canvas.dataset.viewRig !== 'dome') canvas.addEventListener('pointermove', onMove);
  return cursor;
}
