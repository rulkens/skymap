import { createPickCodeAllocator } from '../../src/services/engine/selection/createPickCodeAllocator';
import { LEGACY_PICK_CODES } from '../../src/compositions/legacyPickCodes';

/**
 * The `pickCode` `createLayers` binds for `layer` today: seeded codes equal the
 * old `Source` values, so fixtures that still pack `Source.X` keep resolving
 * until the dense-code step sweeps them.
 */
export function legacyPickCode(layer: string): (pickSourceId: string) => number {
  const allocator = createPickCodeAllocator(LEGACY_PICK_CODES);
  return (pickSourceId) => allocator.codeOf(layer, pickSourceId);
}
