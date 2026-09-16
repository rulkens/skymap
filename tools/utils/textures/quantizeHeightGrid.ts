import { codeHeightM } from '../../../src/utils/scene/codeHeightM';
import { heightCode } from '../../../src/utils/scene/heightCode';

/** quantizeHeightGrid — snap every post onto the 0.1 m grid in place. The bake
 *  must call this BEFORE deriving header bounds, so the header describes the
 *  posts the file actually stores. */
export function quantizeHeightGrid(heightM: Float32Array): void {
  for (let i = 0; i < heightM.length; i++) heightM[i] = codeHeightM(heightCode(heightM[i]!));
}
