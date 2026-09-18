import type { LayerUiSection } from './LayerUiSection';

/**
 * LayerUi — a Layer's two panel surfaces. Both are hand-written components,
 * never schemas (ADR 0011): `settings` is explorer-facing, `debug` is the
 * power-user knobs the dev panel shows. Either may be absent; a Layer with
 * neither omits `ui` entirely.
 */
export type LayerUi = {
  readonly settings?: LayerUiSection;
  readonly debug?: LayerUiSection;
};
