/** Radians at full precision — the paste target, whatever the screen shows. */

import type { PanelModel } from '../../@types/components/PanelModel';
import { num } from '../../utils/format/num';

export function copyTextOf(model: PanelModel): string {
  const lines = ['camera-debug (rad = radians, m = metres, mpc = megaparsec)'];
  lines.push(`[header] ${model.header}${model.badge === null ? '' : ` ⚠ ${model.badge}`}`);
  lines.push('[dof, radians]');
  for (const dof of model.dofs) {
    lines.push(
      `${dof.name}: current=${num(dof.row.currentRad)} target=${num(dof.row.targetRad)} ` +
        `residual=${num(dof.row.residualRad)} delta=${num(dof.delta.deltaRad)} ` +
        `peak=${num(dof.delta.peakAbsRad)}` +
        (dof.off ? ' (north-up off)' : ''),
    );
  }
  for (const [title, rows] of [
    ['band', model.band],
    ...(model.site === null ? [] : [['site', model.site] as const]),
    ['raw', model.raw],
  ] as const) {
    lines.push(`[${title}]`);
    for (const row of rows) lines.push(`${row.key}: ${row.value}`);
  }
  return lines.join('\n');
}
