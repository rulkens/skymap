import type { EngineSpaceMouseHandle } from './EngineSpaceMouseHandle';

/**
 * EngineInputHandle — root for all input-device sub-handles.
 *
 * Today this just owns `spaceMouse`.  When keyboard or gamepad sub-handles
 * land they nest under the same `input` namespace — `engine.input.keyboard`,
 * `engine.input.gamepad`.  The two-level nesting reserves the slot.
 */
export type EngineInputHandle = {
  spaceMouse: EngineSpaceMouseHandle;
};
