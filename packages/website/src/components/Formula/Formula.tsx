/*
 * Formula — an equation on a docs page, set as mathematics in MathML, which
 * every browser that runs the app draws without a library:
 * `<Formula say="…" of="d = \frac{c}{H_0} ∫_0^z \frac{d z′}{E(z′)}" />`
 * between two rules (a list in `of` gives one equation to a line), or
 * `inline` in a sentence. The notation is utils/formulaMathml.ts. `say` is
 * the equation in words, which is what a screen reader is given.
 */
import { createElement } from 'react';

import { formulaMathml } from '../../utils/formulaMathml.ts';
import styles from './Formula.module.css';

type FormulaProps = { say: string; of: string | readonly string[]; inline?: boolean };

// React's JSX types know no MathML element, so it is made by name.
const math = (line: string, key?: number) =>
  createElement('math', { key, dangerouslySetInnerHTML: { __html: formulaMathml(line) } });

function Formula({ say, of, inline = false }: FormulaProps) {
  const lines = [of].flat();
  return inline ? (
    <span className={styles.inline} role="math" aria-label={say}>
      {math(lines[0]!)}
    </span>
  ) : (
    <div className={styles.root} data-embed role="math" aria-label={say}>
      {lines.map((line, i) => math(line, i))}
    </div>
  );
}

export default Formula;
