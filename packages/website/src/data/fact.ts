import { FACTS } from './facts';
import type { Fact } from '../@types/Fact';

/** Look a fact up by id; an unknown id throws, so a page that cites a missing row fails the build. */
export function fact(id: string): Fact {
  const row = FACTS.find((f) => f.id === id);
  if (!row) throw new Error(`Unknown fact id "${id}" (see src/data/facts.ts)`);
  return row;
}
