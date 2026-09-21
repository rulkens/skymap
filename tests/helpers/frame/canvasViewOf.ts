/**
 * The canvas view of a frame — what `runFrame` derives and every pass sees,
 * in one call, so a test asserting on a view field says so once rather than
 * repeating the frame→view pair.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameContextInput } from '../../../src/@types/engine/frame/FrameContextInput';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Size } from '../../../src/@types/rendering/Size';
import { deriveFrameContext } from '../../../src/services/engine/frame/frameContext';
import { deriveView } from '../../../src/services/engine/frame/deriveView';
import { mainViewSpec } from '../../../src/utils/camera/mainViewSpec';

export function canvasViewOf(
  state: EngineState,
  input: FrameContextInput,
  sizePx: Size,
): FrameView | null {
  const snapshot = deriveFrameContext(state, input);
  return snapshot.isReady ? deriveView(snapshot, input.cam, mainViewSpec(input.cam, sizePx)) : null;
}
