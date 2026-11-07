/** An Electron accelerator as the keyboard in front of the person spells it. */
export function shortcutLabel(accelerator: string, isMac: boolean): string {
  return isMac
    ? accelerator.replace('CommandOrControl', 'Cmd')
    : accelerator.replace('CommandOrControl', 'Ctrl');
}
