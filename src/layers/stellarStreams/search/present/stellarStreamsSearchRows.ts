/**
 * stellarStreamsSearchRows — one palette row per stream, yielded once the meta lands (it is always
 * wanted, so the wait is short). `primary`: there are few of them, and a name is all a viewer has.
 */
import { encodeStellarStreamFocusId } from '../../selection/utils/encodeStellarStreamFocusId';
import type { LayerSearchEntry } from '../../../../@types/engine/layer/LayerSearchEntry';
import type { StellarStreamMeta } from '../../catalog/@types/StellarStreamMeta';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';

const loadedMeta = (runtime: StellarStreamsRuntime): Promise<readonly StellarStreamMeta[]> =>
  new Promise((resolve) => {
    const check = (): boolean => {
      const meta = runtime.meta();
      if (meta !== null) resolve(meta);
      return meta !== null;
    };
    if (check()) return;
    const unsubscribe = runtime.metaSlot.subscribe(() => {
      if (check()) unsubscribe();
    });
  });

export async function* stellarStreamsSearchRows(
  runtime: StellarStreamsRuntime,
): AsyncIterable<readonly LayerSearchEntry[]> {
  const meta = await loadedMeta(runtime);
  yield meta.map((m) => ({
    id: encodeStellarStreamFocusId(m.id),
    names: m.names,
    class: 'primary' as const,
    chip: 'Stream',
  }));
}
