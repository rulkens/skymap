/*
 * LightLine — the footer's last sentence, which counts how far light has
 * travelled since the page opened and says so each time it scrolls into view.
 * `text` is the sentence as it stands without script; lightLine.client.ts
 * rewrites it, so the line costs a few lines of script instead of React's
 * runtime on every page. Styled by Footer.module.css.
 */
import styles from './Footer.module.css';

type LightLineProps = { text: string };

function LightLine({ text }: LightLineProps) {
  return (
    <p className={styles.light} data-light>
      {text}
    </p>
  );
}

export default LightLine;
