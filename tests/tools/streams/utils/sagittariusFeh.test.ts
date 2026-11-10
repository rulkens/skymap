import { expect, it } from 'vitest';

import { sagittariusFeh } from '../../../../tools/streams/utils/sagittariusFeh';

it('Sagittarius [Fe/H] falls from the core value to the old-debris value and holds there', () => {
  const t = Array.from({ length: 41 }, (_, i) => -i * 0.1);
  const feh = t.map(sagittariusFeh);
  feh.slice(1).forEach((f, i) => expect(f).toBeLessThanOrEqual(feh[i]!));
  expect(sagittariusFeh(0)).toBeCloseTo(-0.57, 12);
  expect(sagittariusFeh(-2.7)).toBeCloseTo(-1.13, 12);
  expect(sagittariusFeh(-4)).toBeCloseTo(-1.13, 12);
});
