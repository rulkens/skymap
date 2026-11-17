/*
 * PressKit — the About page's offer to the press: four of the kit's pictures in a row, the zip's one link with
 * its size, and the credit every picture opens with, with a control that copies it. Each picture's full credit
 * is in the zip's credits.txt (`npm run site:press-kit`).
 */
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './PressKit.module.css';
import { SIZE, THUMBS } from './PressKit.constants.ts';
import { PRESS_CREDIT } from '../../../../data/pressPictures.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';
import { pressKitUrl } from '../../../../utils/pressKitUrl.ts';

type PressKitProps = { label: string; creditLabel: string; copyLabel: string };

function PressKit({ label, creditLabel, copyLabel }: PressKitProps) {
  return (
    <div className={styles.root}>
      <ul className={styles.thumbs}>
        {THUMBS.map((id) => (
          <li key={id}>
            <Shot
              id={id}
              sizes={narrowSizes('calc(50vw - 1.75rem)', '(max-width: 1239px) 22vw, 16rem')}
            />
          </li>
        ))}
      </ul>
      <div className={styles.take}>
        <p className={styles.download}>
          <ObjLink hang href={pressKitUrl()} icon="download">
            {label}
            <span className={styles.size}>{SIZE}</span>
          </ObjLink>
        </p>
        <div>
          <p className={styles.label}>{creditLabel}</p>
          <p className={styles.credit}>
            <span>{PRESS_CREDIT}</span>
            <CopyButton text={PRESS_CREDIT} label={copyLabel} />
          </p>
        </div>
      </div>
    </div>
  );
}

export default PressKit;
