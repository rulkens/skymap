/*
 * SketchSection — one section of a page's structure file drawn as a layout sketch: its heading, its
 * job line standing in for copy, the owner's `layout` and `visual` notes, its `shots`, and its parts as
 * cards. A deliberately plain arrangement: the notes say what the real section should become.
 */
import type { PageSection } from '../../../@types/PageSection';
import Shot from '../../../components/shared/media/Shot/Shot.tsx';
import styles from './SketchSection.module.css';

type SketchSectionProps = { section: PageSection };

function Notes({ section }: SketchSectionProps) {
  if (!section.layout && !section.visual) return null;
  return (
    <dl className={styles.notes}>
      {section.layout && (
        <>
          <dt>layout</dt>
          <dd>{section.layout}</dd>
        </>
      )}
      {section.visual && (
        <>
          <dt>visual</dt>
          <dd>{section.visual}</dd>
        </>
      )}
    </dl>
  );
}

function Shots({ ids, sizes }: { ids: string[] | undefined; sizes: string }) {
  if (!ids?.length) return null;
  return (
    <div className={styles.shots}>
      {ids.map((id) => (
        <figure key={id}>
          <Shot id={id} sizes={sizes} alt="" />
          <figcaption>{id}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function SketchSection({ section }: SketchSectionProps) {
  return (
    <>
      <h2>{section.heading}</h2>
      <p className={styles.job}>{section.job}</p>
      <Notes section={section} />
      <Shots ids={section.shots} sizes="(max-width: 700px) 100vw, 40vw" />
      {section.parts && (
        <div className={styles.parts}>
          {section.parts.map((part) => (
            <article key={part.heading} className={styles.part}>
              <Shots ids={part.shots} sizes="(max-width: 700px) 100vw, 25vw" />
              <h3>{part.heading}</h3>
              <p className={styles.job}>{part.job}</p>
              <Notes section={part} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export default SketchSection;
