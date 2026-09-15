import type { AssetKey } from './AssetKey';
import type { AssetSlot } from './AssetSlot';
import type { SlotDeps } from './SlotDeps';

/**
 * An asset that loads whenever its parent does, one rank behind it, with the
 * parent's own request — a `req`/`demand`/`priority` triple that would
 * otherwise be hand-copied from the parent row. Expanded once by
 * `expandCompanionRows`, where `ASSET_WIRING` is built.
 */
export type CompanionAssetRow<T = unknown, R = unknown> = {
  key: AssetKey;
  factory: (deps: SlotDeps) => AssetSlot<T, R>;
  companionOf: AssetKey;
};
