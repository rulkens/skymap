import { isValidElement } from 'react';
import type { ReactNode } from 'react';

/**
 * The HTML of the children a React component is given by Astro (a docs page's Markdown block):
 * @astrojs/react hands a slot over as one element whose `value` is the rendered HTML, a String object.
 */
export function slotHtml(children: ReactNode): string {
  const value = isValidElement<{ value?: unknown }>(children) ? children.props.value : undefined;
  return value == null ? '' : String(value);
}
