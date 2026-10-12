import { fact } from '../../../packages/website/src/data/fact';

/**
 * The figures a fact's sentence states, as `pattern`'s groups. A test redoes
 * the sum from them, so a figure cannot change without its inputs; a reworded
 * sentence throws here and the pattern is updated with it.
 */
export function statedFigures(id: string, pattern: RegExp): number[] {
  const match = pattern.exec(fact(id).text);
  if (!match) throw new Error(`Fact "${id}" no longer reads as ${pattern}`);
  return match.slice(1).map((figure) => Number(figure.replace(/,/g, '')));
}
