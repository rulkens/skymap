/**
 * Opens the control window. Not global: that would take the key from every other app. The sky reads
 * it itself (isControlKey), so it works from a full-screen sky, which has no menu.
 */
export const CONTROL_SHORTCUT = 'CommandOrControl+,';
