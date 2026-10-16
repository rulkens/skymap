/*
 * CodeBlock — a block of code between two rules: a fenced block of a docs
 * page (its children), or `text` from data. Long lines wrap inside the rules,
 * so nothing is out of sight and nothing scrolls sideways. A fenced block is a
 * command or an address: it wraps between words, and inside one only when
 * the word is wider than the block, because a hyphen at a line's end could
 * be the word's own. The copy control takes the text as written.
 */
import type { ReactNode } from 'react';

import { slotHtml } from '../../utils/slotHtml.ts';
import CopyButton from '../CopyButton/CopyButton.tsx';
import styles from './CodeBlock.module.css';

type CodeBlockProps = { text?: string; label?: string; children?: ReactNode };

// A fenced block reaches the page as escaped HTML; the clipboard gets the characters.
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  '#x27': "'",
};

function CodeBlock({ text, label = 'Copy these lines', children }: CodeBlockProps) {
  const fenced = text === undefined;
  const code =
    text ??
    slotHtml(children)
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, name: string) => ENTITIES[name]!)
      .trim();
  return (
    <div className={styles.root} data-embed>
      <pre>
        <code>
          {fenced
            ? code
                .split(/(\s+)/)
                .map((run, i) => (/\s/.test(run) ? run : <span key={i}>{run}</span>))
            : code}
        </code>
      </pre>
      <div className={styles.copy}>
        <CopyButton text={code} label={label} />
      </div>
    </div>
  );
}

export default CodeBlock;
