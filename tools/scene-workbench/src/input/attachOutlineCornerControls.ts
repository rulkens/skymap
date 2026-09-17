/**
 * attachOutlineCornerControls — drag a draft corner to move it, click it to delete it (or, on
 * the first corner of an open ring, to close it). The `pointerdown` listener is capture-phase
 * and swallows a press near a corner, so `attachOrbitControls`' own listener never starts a
 * pan for it; that recognizer stays untouched. Desktop-only: `setPointerCapture` breaks touch
 * pointers on iOS, which is why `orbitControls` never calls it.
 */
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { HeldCorner } from '../../@types/HeldCorner';
import { sceneCameraView } from '../render/sceneCameraView';
import { assetToGroupM } from '../scene/assetToGroupM';
import { groupToAssetXY } from '../scene/groupToAssetXY';
import { groupXYToPx } from '../scene/groupXYToPx';
import { pxToGroupXY } from '../scene/pxToGroupXY';
import { cornerClicked, cornerMoved } from '../state/outline/outlineSlice';
import { selectDraftAsset } from '../state/outline/selectDraftAsset';
import type { SceneCamera } from '../state/view/viewSlice';
import type { SceneStore } from '../store/types';

const HIT_RADIUS_SQ_PX = 8 * 8; // CSS px
const DRAG_THRESHOLD_SQ_PX = 4 * 4; // orbitControls' click threshold

export function attachOutlineCornerControls(
  canvas: HTMLCanvasElement,
  store: SceneStore,
  getCameraPose: () => SceneCamera,
): () => void {
  let held: HeldCorner | null = null;

  const localPx = (e: PointerEvent): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  /** The draft's asset and an orthographic view in CSS px, or null when there is nothing to edit. */
  const editContext = () => {
    const state = store.getState();
    const draft = state.outline.draft;
    const pose = getCameraPose();
    const asset = selectDraftAsset(state);
    if (!draft || !asset || pose.projection !== 'orthographic') return null;
    const view = sceneCameraView(pose, [canvas.clientWidth, canvas.clientHeight]);
    return { draft, transform: asset.transform, view };
  };

  const onDown = (e: PointerEvent): void => {
    if (held || e.button !== 0) return;
    const context = editContext();
    if (!context) return;
    const px = localPx(e);
    let nearest = -1;
    let nearestSq = HIT_RADIUS_SQ_PX;
    context.draft.ringM.forEach(([x, y], index) => {
      const [gx, gy] = assetToGroupM(context.transform, [x, y, 0]);
      const [cx, cy] = groupXYToPx(context.view, [gx, gy]);
      const distSq = (cx - px[0]) ** 2 + (cy - px[1]) ** 2;
      if (distSq <= nearestSq) {
        nearest = index;
        nearestSq = distSq;
      }
    });
    if (nearest < 0) return;
    e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    held = { pointerId: e.pointerId, index: nearest, downPx: px, dragging: false };
  };

  const onMove = (e: PointerEvent): void => {
    if (!held || e.pointerId !== held.pointerId) return;
    const px = localPx(e);
    const movedSq = (px[0] - held.downPx[0]) ** 2 + (px[1] - held.downPx[1]) ** 2;
    if (!held.dragging && movedSq < DRAG_THRESHOLD_SQ_PX) return;
    held.dragging = true;
    const context = editContext();
    if (!context) return;
    const xyM = groupToAssetXY(context.transform, pxToGroupXY(context.view, px));
    store.dispatch(cornerMoved({ index: held.index, xyM }));
  };

  const onUp = (e: PointerEvent): void => {
    if (!held || e.pointerId !== held.pointerId) return;
    const { index, dragging } = held;
    held = null;
    if (e.type === 'pointerup' && !dragging) store.dispatch(cornerClicked(index));
  };

  canvas.addEventListener('pointerdown', onDown, { capture: true });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return () => {
    canvas.removeEventListener('pointerdown', onDown, { capture: true });
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  };
}
