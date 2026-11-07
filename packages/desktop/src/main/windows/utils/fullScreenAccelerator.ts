/** The key back into full screen: F11 belongs to the system on macOS, which uses Ctrl+Cmd+F instead. */
export function fullScreenAccelerator(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11';
}
