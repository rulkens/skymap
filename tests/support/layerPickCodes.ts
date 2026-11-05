import { catalogPickCodes } from '../../src/utils/picking/catalogPickCodes';
import { structurePickCodes as structurePickCodesOver } from '../../src/layers/structure/picking/utils/structurePickCodes';
import { BODY_SOURCE_ROWS } from '../../src/layers/body/sources/bodySourceRows';
import { MISSIONS_SOURCE_ROWS } from '../../src/layers/missions/sources/missionsSourceRows';
import { testPickCode } from './testPickCode';
import type { StructureStore } from '../../src/layers/structure/catalog/@types/StructureStore';

/** The body Layer's `pickCodes`, as `create` builds them; pass `fakePickCode()` to catch a stamp that packs a catalog value. */
export function bodyPickCodes(pickCode = testPickCode('body')) {
  return catalogPickCodes(BODY_SOURCE_ROWS, pickCode);
}

/** The missions Layer's `pickCodes`, as `create` builds them. */
export function missionsPickCodes(pickCode = testPickCode('missions')) {
  return catalogPickCodes(MISSIONS_SOURCE_ROWS, pickCode);
}

/** The structure Layer's `pickCodes`, as `create` builds them. */
export function structurePickCodes(pickCode = testPickCode('structure')) {
  return structurePickCodesOver(pickCode);
}

/** The structure selection row's reads over a store fixture, plus the Layer's pick codes. */
export function structureRowRuntime(
  store: Pick<StructureStore, 'byId' | 'byCategory'>,
  pickCode = testPickCode('structure'),
) {
  return { store, pickCodes: structurePickCodesOver(pickCode) };
}

/** The single-row Layers' pick codes, as their `create` asks for them. */
export const milkyWayPickCode = (pickCode = testPickCode('milkyWay')) => pickCode('milkyWay');
export const blackHolePickCode = (pickCode = testPickCode('blackHoles')) => pickCode('sgr-a-star');
export const satellitesPickCode = (pickCode = testPickCode('satellites')) => pickCode('satellites');
export const zoneOfAvoidancePickCode = (pickCode = testPickCode('zoneOfAvoidance')) =>
  pickCode('zoneOfAvoidance');
