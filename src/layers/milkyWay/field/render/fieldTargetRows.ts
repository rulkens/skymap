/**
 * FIELD_TARGET_ROWS — one `mw-field-*` render-target row per field target,
 * sized by the live divisor and held only while the field part draws, so the
 * default `'v1'` renderer allocates nothing for the field. The field passes
 * clear these themselves: a compute's writes are invisible to `touched`.
 */
import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import { FIELD_TARGET_IDS } from '../data/fieldTargetIds';
import { DUST_MAP_FORMAT } from '../host/data/dustMapFormat';
import { selectMilkyWayParts } from '../../state/milkyWay/selectors';
import { fieldTargetRowId } from '../utils/fieldTargetRowId';

export const FIELD_TARGET_ROWS: readonly RenderTargetSpec[] = FIELD_TARGET_IDS.map((id) => ({
  id: fieldTargetRowId(id),
  format: id === 'dustMap' ? DUST_MAP_FORMAT : HDR_TARGET_FORMAT,
  depth: null,
  scale: (s) => s.settings.milkyWay.field.divisors[id],
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
  allocateWhen: (s) => selectMilkyWayParts(s.settings.milkyWay).field,
}));
