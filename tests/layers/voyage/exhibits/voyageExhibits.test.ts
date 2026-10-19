import { describe, expect, it } from 'vitest';

import { voyageExhibits } from '../../../../src/layers/voyage/exhibits/voyageExhibits';
import type { ExhibitFactsSection } from '../../../../src/@types/exhibits/ExhibitFactsSection';

describe('voyageExhibits', () => {
  it('voyageExhibits facts are tripOf’s numbers', () => {
    const m31 = voyageExhibits.find((e) => e.id === 'voyage-m31')!;
    const facts = m31.body.find((s) => (s.data as ExhibitFactsSection).facts !== undefined)!
      .data as ExhibitFactsSection;
    expect(facts.facts.find((f) => f.label === 'Ship time')!.value).toContain('28.6');
  });
});
