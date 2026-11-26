/** The Ease pick's options: every ease the engine has, by its own name. */
import { EASE } from '../../../../../src/services/engine/animation/ease';
import type { Ease } from '../../../../../src/@types/animation/Ease';
import type { PickOption } from '../@types/PickOption';

export const EASE_OPTIONS: readonly PickOption[] = (Object.keys(EASE) as Ease[]).map((value) => ({
  value,
  text: value,
}));
