/** An Electron accelerator as the keyboard in front of the person spells it; a Mac keyboard says Option. */
export function shortcutLabel(accelerator: string, isMac: boolean): string {
  return isMac
    ? accelerator.replace('CommandOrControl', 'Cmd').replace('Alt', 'Option')
    : accelerator.replace('CommandOrControl', 'Ctrl');
}
