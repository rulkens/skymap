/**
 * Opens the control window: the systems' settings key (Cmd+, on macOS; Ctrl+, on Windows, as most
 * apps use it), owner ruling 2026-11-06. Skymap › Settings… carries it, and the sky reads it itself
 * (isControlKey), so it also works from a full-screen sky, which has no menu. Not global: that would
 * take the key from every other app while Skymap runs.
 */
export const CONTROL_SHORTCUT = 'CommandOrControl+,';
