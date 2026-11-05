import { createPickCodeAllocator } from '../../src/services/engine/selection/createPickCodeAllocator';

// One allocator per test module, as one engine has one: two Layers asking the same id
// get distinct codes, so a fixture composing several rows never collides.
const TEST_PICK_CODES = createPickCodeAllocator();

/** The `pickCode` `createLayers` binds for `layer`: dense codes in first-ask order. */
export function testPickCode(layer: string): (pickSourceId: string) => number {
  return (pickSourceId) => TEST_PICK_CODES.codeOf(layer, pickSourceId);
}
