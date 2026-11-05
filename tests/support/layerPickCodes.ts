import { catalogPickCodes } from '../../src/utils/picking/catalogPickCodes';
import { BODY_SOURCE_ROWS } from '../../src/layers/body/sources/bodySourceRows';
import { MISSIONS_SOURCE_ROWS } from '../../src/layers/missions/sources/missionsSourceRows';
import { legacyPickCode } from './legacyPickCode';

/** The body Layer's `pickCodes`, as `create` builds them; pass `fakePickCode()` to catch a stamp that packs a `Source` value. */
export function bodyPickCodes(pickCode = legacyPickCode('body')) {
  return catalogPickCodes(BODY_SOURCE_ROWS, pickCode);
}

/** The missions Layer's `pickCodes`, as `create` builds them. */
export function missionsPickCodes(pickCode = legacyPickCode('missions')) {
  return catalogPickCodes(MISSIONS_SOURCE_ROWS, pickCode);
}
