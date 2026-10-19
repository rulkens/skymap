/*
 * AskList — the set texts some sources ask a user to print, each under its
 * source's name with a link to the page that holds the full, current wording.
 */
import { DATA_SOURCES } from '../../data/dataSources.ts';
import styles from './AskList.module.css';

const asks = DATA_SOURCES.filter((row) => row.ask);

function AskList() {
  return (
    <div className={styles.root}>
      <p>
        Every source in the table asks to be cited, and its row links to the paper or page to cite.
        Four also ask for a set text. For SDSS and DESI we print only the opening: take the full,
        current wording from the linked page.
      </p>
      <ul className={styles.bare}>
        {asks.map((row) => (
          <li key={row.id}>
            <b>{row.id === '2mass-xsc' ? 'Catalogues read through VizieR' : row.name}</b>
            <blockquote>{row.ask}</blockquote>
            <a href={row.askHref}>
              Acknowledgement page for {row.id === '2mass-xsc' ? 'VizieR' : row.name.split(',')[0]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AskList;
