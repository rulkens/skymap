import { shotSources } from './shotSources.ts';

/** A shot's width over its height. */
export function shotRatio(id: string): number {
  const { width, height } = shotSources(id);
  return width / height;
}
