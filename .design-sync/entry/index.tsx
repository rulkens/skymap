/**
 * Design-sync bundle entry — the surface exposed to claude.ai/design at
 * window.SkymapUI. Re-exports skymap's presentational HUD components (rendered
 * from mock props, no engine or Redux store) plus the mock fixtures the preview
 * cards use.
 */

export { default as InfoCard } from '../../src/components/InfoCard/InfoCard';
export { default as SettingsPanelPreview } from '../hud/SettingsPanelPreview';
export * as fixtures from './fixtures';
