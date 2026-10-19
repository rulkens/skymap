import { describe, expect, it } from 'vitest';

import { voyageExhibits } from '../../../../src/layers/voyage/exhibits/voyageExhibits';
import type { ExhibitFactsSection } from '../../../../src/@types/exhibits/ExhibitFactsSection';
import type { ExhibitProseSection } from '../../../../src/@types/exhibits/ExhibitProseSection';

describe('voyageExhibits', () => {
  it('voyageExhibits facts are tripOf’s numbers', () => {
    const m31 = voyageExhibits.find((e) => e.id === 'voyage-m31')!;
    const facts = m31.body.find((s) => (s.data as ExhibitFactsSection).facts !== undefined)!
      .data as ExhibitFactsSection;
    expect(facts.facts.find((f) => f.label === 'Ship time')!.value).toContain('28.6');
  });

  // The far trips' 2/a turn length does not hold at Proxima's γ of 3.19: there it is d/γ.
  it('each exhibit’s turn length is its own trip’s d/γ', () => {
    const turn = (id: string) =>
      voyageExhibits
        .find((e) => e.id === id)!
        .body.map((s) => s.data as Partial<ExhibitProseSection>)
        .find((d) => d.heading?.endsWith('at the turn'))!;
    expect(turn('voyage-proxima').heading).toBe('1.33 light-years at the turn');
    expect(turn('voyage-proxima').text).toContain('0.66 of them still ahead');
    expect(turn('voyage-m87').heading).toBe('1.94 light-years at the turn');
  });
});
