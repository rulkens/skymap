/*
 * Flow — `<Flow steps={[…]} />` on a docs page: a process as a line of rings
 * read downwards, one ring a step, with what goes in and what comes out
 * under each name. The ring is the site's own mark for a place you can go;
 * a step with `href` is a link to its section. The words are text, not part
 * of the drawing, so they keep the page's sizes at every width.
 */
import styles from './Flow.module.css';

type FlowProps = {
  label: string;
  steps: readonly { name: string; text: string; href?: string }[];
};

function Flow({ label, steps }: FlowProps) {
  return (
    <ol className={styles.root} data-embed aria-label={label}>
      {steps.map((step) => (
        <li key={step.name}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
          </svg>
          {step.href ? <a href={step.href}>{step.name}</a> : <b>{step.name}</b>}
          <span className={styles.text}>{step.text}</span>
        </li>
      ))}
    </ol>
  );
}

export default Flow;
