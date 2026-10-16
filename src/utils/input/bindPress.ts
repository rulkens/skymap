import type { BindingTable } from '../../@types/input/BindingTable';
import type { HeldIntent } from '../../@types/input/HeldIntent';
import type { Press } from '../../@types/input/Press';

export function bindPress(table: BindingTable, press: Press): HeldIntent {
  const row = table.find(([pattern]) =>
    (Object.keys(pattern) as (keyof Press)[]).every((k) => pattern[k] === press[k]),
  );
  // Every table ends in a catch-all `{}` row, so a miss is a malformed table, not input to tolerate.
  if (!row) throw new Error('bindPress: no binding row matches the press');
  return row[1];
}
