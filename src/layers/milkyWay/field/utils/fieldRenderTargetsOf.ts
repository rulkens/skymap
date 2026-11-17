import type { FieldTarget } from '../@types/FieldTarget';
import type { FieldTargetId } from '../@types/FieldTargetId';
import type { GalaxyFieldRenderTargets } from '../@types/GalaxyFieldRenderTargets';
import type { RenderTargets } from '../../../../@types/rendering/RenderTargets';
import { fieldTargetRowId } from './fieldTargetRowId';

/**
 * The field's targets as the host reads them, from the `mw-field-*` rows. No
 * `dustView` or `extras`: the JWST debug view and the extras are the tool's. Throws while the rows are
 * released, so a caller gates on the field part as the rows' `allocateWhen` does.
 */
export function fieldRenderTargetsOf(targets: RenderTargets): GalaxyFieldRenderTargets {
  const target = (id: FieldTargetId): FieldTarget => ({
    view: targets.viewOf(fieldTargetRowId(id)),
    sizePx: targets.sizeOf(fieldTargetRowId(id)),
  });
  return {
    dustMap: target('dustMap'),
    field: target('field'),
    shells: target('shells'),
    young: target('young'),
    dig: target('dig'),
  };
}
