/**
 * A copy of the clip with one param of a row's subject set, or removed when `value` is undefined
 * (an optional param back to its default). A waypoint ref edits `waypoints[index]` of the flyPath
 * at its path. Values arrive in stored units: the inspector converts before dispatch.
 */
import { updateEffectAt } from './updateEffectAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowRef } from '../../@types/rows/RowRef';
import type { ParamValue } from '../../@types/kinds/ParamValue';

export function setRowParam(
  data: ClipData,
  ref: RowRef,
  param: string,
  value: ParamValue,
): ClipData {
  const withParam = <T extends object>(subject: T): T => {
    const { [param]: _removed, ...rest } = subject as Record<string, unknown>;
    return (value === undefined ? rest : { ...rest, [param]: value }) as T;
  };
  switch (ref.kind) {
    case 'start':
      if (typeof data.start !== 'object') throw new Error('setRowParam: the clip starts live');
      return { ...data, start: withParam(data.start) };
    case 'effect':
      return updateEffectAt(data, ref.path, withParam);
    case 'waypoint':
      return updateEffectAt(data, ref.path, (effect) => {
        if (effect.kind !== 'flyPath') throw new Error('setRowParam: a waypoint needs a flyPath');
        const waypoints = effect.waypoints.map((w, i) => (i === ref.index ? withParam(w) : w));
        return { ...effect, waypoints };
      });
  }
}
