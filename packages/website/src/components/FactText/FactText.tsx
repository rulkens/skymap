/*
 * FactText — `<Fact id="…" />` on a docs page: the words of one sourced row of
 * data/facts.ts, as a paragraph or, with `inline`, inside a sentence. A
 * command-line flag in the words is set as code (utils/flagParts.ts). A row is
 * stated in full on one page; any other page says it `brief`:
 * `<Fact id="…" brief to="/science/#distances">a clause of the page's own</Fact>`
 * prints that clause as a link to where the row is stated. Either way the
 * page's source list finds the id in the text (pages/docs/[...slug].astro).
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { fact } from '../../data/fact.ts';
import { flagParts } from '../../utils/flagParts.ts';
import DocLink from '../DocLink/DocLink.tsx';

type FactTextProps = { id: string; children?: ReactNode } & (
  | { brief?: false; inline?: boolean; to?: undefined }
  | { brief: true; to: string }
);

function FactText(props: FactTextProps) {
  // An unknown id fails the build in both forms.
  const parts = flagParts(fact(props.id).text);
  if (props.brief && !props.to)
    throw new Error(
      `<Fact id="${props.id}" brief> needs "to": the page and anchor that state the row`,
    );
  if (props.brief) return <DocLink href={props.to}>{props.children}</DocLink>;

  const Tag = props.inline ? Fragment : 'p';
  return (
    <Tag>{parts.map((part, i) => (part.flag ? <code key={i}>{part.text}</code> : part.text))}</Tag>
  );
}

export default FactText;
