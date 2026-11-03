/* FormulaLine — one line of a Formula, as a MathML `<math>` element (utils/formulaMathml.ts). */
import { createElement } from 'react';

import { formulaMathml } from '../../../utils/formulaMathml.ts';

type FormulaLineProps = { line: string };

// React's JSX types know no MathML element, so it is made by name.
function FormulaLine({ line }: FormulaLineProps) {
  return createElement('math', { dangerouslySetInnerHTML: { __html: formulaMathml(line) } });
}

export default FormulaLine;
