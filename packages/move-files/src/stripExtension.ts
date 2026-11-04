export function stripExtension(path: string): string {
  return path.replace(/(\.d\.ts|\.[^/.]+)$/, '');
}
