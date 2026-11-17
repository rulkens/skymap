import { describe, expect, it } from 'vitest';
import { assertSelectionKindsComplete } from '../../../src/utils/selection/assertSelectionKindsComplete';
import type { SelectionKindFacts } from '../../../src/@types/engine/layer/SelectionKindFacts';

const kinds = (...types: string[]) => types.map((type) => ({ type }) as SelectionKindFacts);

describe('assertSelectionKindsComplete', () => {
  it('throws on a row type with no facts', () => {
    expect(() =>
      assertSelectionKindsComplete(kinds('body', 'craft'), ['body', 'craft']),
    ).not.toThrow();
    expect(() => assertSelectionKindsComplete(kinds('body'), ['body', 'satellite'])).toThrow(
      /satellite/,
    );
  });

  it('throws on a kind declared twice', () => {
    expect(() => assertSelectionKindsComplete(kinds('body', 'body'), ['body'])).toThrow(
      /body.*twice/,
    );
  });
});
