/** An Electron accelerator as the keyboard in front of the person spells it. */
export function shortcutLabel(accelerator: string, isMac: boolean): string {
  return accelerator.replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl');
}
