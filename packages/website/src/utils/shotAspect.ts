import { shotSources } from './shotSources.ts';

/** A shot's shape as a CSS `aspect-ratio` value, `width / height`. */
export function shotAspect(id: string): string {
  const { width, height } = shotSources(id);
  return `${width} / ${height}`;
}
