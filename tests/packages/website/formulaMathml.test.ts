import { describe, expect, it } from 'vitest';

import { formulaMathml } from '../../../packages/website/src/utils/formulaMathml';

describe('formulaMathml', () => {
  it('sets a fraction, a subscript and both limits of an integral', () => {
    expect(formulaMathml('d = \\frac{c}{H_0} ∫_0^z')).toBe(
      '<mi>d</mi><mo>=</mo><mfrac><mi>c</mi><msub><mi>H</mi><mn>0</mn></msub></mfrac>' +
        '<msubsup><mo>∫</mo><mn>0</mn><mi>z</mi></msubsup>',
    );
  });

  it('raises a bracket as a whole and keeps a prime with its letter', () => {
    expect(formulaMathml('\\sqrt{(1 + z′)^3}')).toBe(
      '<msqrt><msup><mrow><mo>(</mo><mn>1</mn><mo>+</mo><msup><mi>z</mi><mo>′</mo></msup><mo>)</mo></mrow><mn>3</mn></msup></msqrt>',
    );
  });

  it('takes a group as an exponent, a typed hyphen as a minus, and words as words', () => {
    expect(formulaMathml('10^{-0.4 M_{med}} \\text{ in <Mpc>}')).toBe(
      '<msup><mn>10</mn><mrow><mo>−</mo><mn>0.4</mn><msub><mi>M</mi><mi>med</mi></msub></mrow></msup>' +
        '<mtext> in &lt;Mpc&gt;</mtext>',
    );
  });

  it('ties a sign after another operator to its number, and sets a thin space', () => {
    expect(formulaMathml('log\\,R = -0.2')).toBe(
      '<mi>log</mi><mspace width="0.17em"/><mi>R</mi><mo>=</mo><mo form="prefix">−</mo><mn>0.2</mn>',
    );
  });

  it.each(['\\frac{a}{b', '(a + b', 'a }', '\\cdot', 'a^'])('refuses %s', (source) => {
    expect(() => formulaMathml(source)).toThrow(/formula/);
  });
});
