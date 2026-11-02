/*
 * LinkAnatomy — how a teacher makes a link, shown on a real one: the address set large over the picture of
 * the view it opens, each part of it numbered by the step that writes it, and the three steps under it.
 * Pointing at or focusing a step lights its part of the address (CSS only); the copy control copies the
 * whole address. Narrow, the address wraps between its parts and the picture follows it.
 */
import type { CSSProperties } from 'react';

import { ACCENTS, says } from '../../../../content/pages/classroom/classroom.data.ts';
import { HOME_LINKS } from '../../../../data/homeLinks.ts';
import { appAddress } from '../../../../utils/appAddress.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import AddressText from '../../../shared/links/AddressText/AddressText.tsx';
import AppLink from '../../../shared/links/AppLink/AppLink.tsx';
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './LinkAnatomy.module.css';

// The address of the Jupiter picture beside it, without the camera position a copied address never has.
const HASH = HOME_LINKS.classroom;
const SHOT = 'classroom-hero';

function LinkAnatomy() {
  return (
    <div className={styles.root} style={{ '--accent': ACCENTS.jupiter } as CSSProperties}>
      <figure className={styles.figure}>
        <div className={styles.picture}>
          <Shot id={SHOT} tall="classroom-hero-portrait" sizes="(max-width: 900px) 100vw, 60vw" />
        </div>
        <div className={styles.address}>
          {/* The address is the link, as a browser's is; the copy control sits outside it, a button cannot live in
              a link. */}
          <p className={styles.url}>
            <AppLink className={styles.link} view={HASH}>
              <AddressText
                hash={HASH}
                head={styles.host}
                param={() => ({ className: styles.part })}
              />
            </AppLink>{' '}
            <CopyButton text={appAddress(HASH)} label="Copy the address" />
          </p>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={SHOT} showDrawn={false} showTitle={false} open={false} />
          <ViewLink hang view={HASH}>
            Jupiter on 14 March 2033
          </ViewLink>
        </figcaption>
      </figure>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <h3>Find the object</h3>
          <p>
            Open <a href={sitePath('/docs/guide/finding/#open-the-search')}>the search</a>, type a
            name and press Enter. {says('double-click-focus')}
          </p>
        </li>
        <li className={styles.step}>
          <h3>Set the date</h3>
          <p>
            Select <a href={sitePath('/docs/guide/time/#set-a-date-and-time')}>the clock</a> at the
            bottom right, type a date and a time, and press Enter. {says('date-entry-utc')}
          </p>
        </li>
        <li className={styles.step}>
          <h3>Copy the address</h3>
          <p>{says('lesson-link')} Paste it into a lesson plan or a slide.</p>
          <ObjLink size="small" hang href={sitePath('/docs/guide/sharing/')}>
            Sharing a view
          </ObjLink>
        </li>
      </ol>
    </div>
  );
}

export default LinkAnatomy;
