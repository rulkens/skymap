/*
 * DataEntryRecord — one source as a data page prints it, in the order a
 * reader asks: may I use it, what is it in the app, what do I print (rows of
 * a summary, the credit last because it can be long); its licence and terms
 * as a quotation of the record; what it is, with a picture, and who made it;
 * where its files enter the build, the registry's rows folded away. Licence,
 * credit, makers and files are the record's or the registry's; the rest is
 * data/dataSourceNotes.ts. `level` is the depth of its headings: 2 on a page
 * of its own, 3 as a section of its family's page, where rows stand for sections.
 */
import { Fragment } from 'react';

import type { DataEntry } from '../../@types/DataEntry';
import { DATA_FAMILIES_USED, DATA_USES } from '../../data/dataPages.ts';
import { DATA_SOURCE_NOTES } from '../../data/dataSourceNotes.ts';
import { DATA_SOURCES } from '../../data/dataSources.ts';
import { formatDate } from '../../utils/formatDate.ts';
import Caveat from '../Caveat/Caveat.tsx';
import DocFigure from '../DocFigure/DocFigure.tsx';
import DocLink from '../DocLink/DocLink.tsx';
import DocTable from '../DocTable/DocTable.tsx';
import FactText from '../FactText/FactText.tsx';
import RecordText from '../RecordText/RecordText.tsx';
import Recorded from '../Recorded/Recorded.tsx';
import Row from '../Row/Row.tsx';
import UseTerms from '../UseTerms/UseTerms.tsx';
import View from '../View/View.tsx';
import styles from './DataEntryRecord.module.css';

type DataEntryRecordProps = { entry: DataEntry; level: 2 | 3 };

function DataEntryRecord({ entry, level }: DataEntryRecordProps) {
  const H = `h${level}` as 'h2' | 'h3';
  const { bullets, use, checked, section, sectionNotes } = entry.record;
  const note = DATA_SOURCE_NOTES[entry.id];
  const family = DATA_FAMILIES_USED.find((row) => row.id === entry.family)!;
  // On a page of its own a heading's anchor is its words; on a shared page it carries the entry's id, to stay one of a kind.
  const anchor = (name: string) => (level === 2 ? name : `${entry.id}-${name}`);
  const inTable = DATA_SOURCES.some((row) => row.entries.includes(entry.id));
  const about = [
    // A page of its own opens on a sentence about the source; the record's own wording follows here.
    [level === 2 ? 'In the record’s words' : 'What it is', bullets.What],
    ['Made by', bullets.By],
    ['Where it comes from', bullets.Upstream],
    ['Changed by us', bullets.Modified],
  ].filter(([, text]) => text);
  const byHand = entry.files.filter((file) => !file.fetcher).length;

  return (
    <>
      <dl className={styles.summary} data-embed>
        <Row label="Use">
          {use.map((term) => (
            <Fragment key={term}>
              <UseTerms use={[term]} />
              <p className={styles.meaning}>
                <RecordText text={DATA_USES[term]} phrase />
              </p>
            </Fragment>
          ))}
        </Row>
        {note?.shows && (
          <Row label="In the app">
            <p>
              {note.setting ? (
                <DocLink href={`/docs/reference/settings/#${note.setting}`}>{note.shows}</DocLink>
              ) : (
                note.shows
              )}
            </p>
            {(note.scene || inTable) && (
              <p className={styles.links}>
                {note.scene && (
                  <DocLink href={`/docs/start/scene/#${note.scene}`}>
                    In “What is in the scene”
                  </DocLink>
                )}
                {inTable && (
                  <DocLink href="/science/#sources">In the Science page’s table of sources</DocLink>
                )}
              </p>
            )}
          </Row>
        )}
        {note?.view && (
          <Row label="Open">
            <View to={note.view.to}>{note.view.label}</View>
          </Row>
        )}
        <Row label="Credit">
          <RecordText text={bullets.Attribution ?? ''} lift copy />
        </Row>
        {level === 3 && (
          <>
            {about.map(([label, text]) => (
              <Row key={label} label={label}>
                <RecordText text={text!} />
              </Row>
            ))}
            <Row label="In the build">
              <RecordText text={bullets['Enters skymap'] ?? ''} />
            </Row>
          </>
        )}
      </dl>
      {level === 3 && note?.figure && <DocFigure id={note.figure} />}

      <H id={anchor('licence')}>Licence and terms</H>
      <Recorded>
        <RecordText text={bullets.Licence ?? ''} lift />
      </Recorded>
      {bullets['Not verified'] && (
        <Caveat title={`Not verified on ${formatDate(checked)}`}>
          <RecordText text={bullets['Not verified']} />
        </Caveat>
      )}

      {level === 2 && (
        <>
          <h2 id="about">What it is and who made it</h2>
          {note?.figure && <DocFigure id={note.figure} />}
          {note?.about && <p>{note.about}</p>}
          {note?.facts?.map((id) => (
            <FactText key={id} id={id} />
          ))}
          <dl className={styles.summary} data-embed>
            {about.map(([label, text]) => (
              <Row key={label} label={label}>
                <RecordText text={text!} />
              </Row>
            ))}
          </dl>
          <h2 id="build">In the build</h2>
          <RecordText text={bullets['Enters skymap'] ?? ''} />
        </>
      )}
      {entry.files.length > 0 && (
        <>
          {family.step && (
            <p>
              What the build does with {entry.files.length === 1 ? 'this file' : 'these files'} next
              is on{' '}
              <DocLink href={`/docs/data/pipeline/#${family.step}`}>
                From catalogue to pixels
              </DocLink>
              .
            </p>
          )}
          <details className={styles.files} data-embed>
            <summary className={styles.summaryRing}>
              {entry.files.length} {entry.files.length === 1 ? 'file' : 'files'} in the raw data
              registry
            </summary>
            <DocTable
              cols="stack"
              head={['Registry key', 'Path', 'Kept', 'Fetched by']}
              rows={entry.files.map((file) => [
                { code: file.key },
                { code: file.path },
                file.kept === 'committed' ? 'In the repository' : 'Outside the repository',
                ...(file.fetcher ? [{ code: file.fetcher }] : []),
              ])}
            />
            {byHand > 0 && (
              <p className={styles.byHand}>
                {byHand === entry.files.length
                  ? entry.files.length === 1
                    ? 'It was'
                    : 'All were'
                  : `${byHand} of these were`}{' '}
                fetched by hand: the registry names no tool.
              </p>
            )}
          </details>
        </>
      )}
      {level === 2 && sectionNotes.length > 0 && (
        <details className={styles.files} data-embed>
          <summary className={styles.summaryRing}>
            A note in our licence record on all of its part “{section}”
          </summary>
          <Recorded>
            {sectionNotes.map((text, i) => (
              <RecordText key={i} text={text} lift />
            ))}
          </Recorded>
        </details>
      )}
    </>
  );
}

export default DataEntryRecord;
