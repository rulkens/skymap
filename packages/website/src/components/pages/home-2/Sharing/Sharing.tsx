/*
 * Sharing — Home's last section before the credits: a view of the Hubble Space Telescope over Earth as the
 * band's ground, with that view's own address under the words, ready to copy. Below the band, what an
 * address holds, a second address that also sets the clock, and the way into the app.
 */
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import AddressStrip from '../../../shared/links/AddressStrip/AddressStrip.tsx';
import OpenApp from '../../../shared/links/OpenApp/OpenApp.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import PictureBand from '../../../shared/media/PictureBand/PictureBand.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Sharing.module.css';

const BAND = 'hubble';
// Saturn with its rings wide open: the date is what makes the view.
const MOMENT = 'focus=body-saturn&t=2017-10-15T12:00:00Z';

function Sharing() {
  return (
    <>
      <PictureBand id={BAND} zoom={1.4}>
        <h2>Ready for sharing</h2>
        <p className={styles.lead}>
          Copy the address of any view and send it. It opens on the same view for whoever follows
          it.
        </p>
        <div className={styles.strip}>
          <AddressStrip hash={siteShot(BAND).link} />
        </div>
        <ShotCaption id={BAND} showDrawn={false} open={false} />
      </PictureBand>
      <div className={styles.root}>
        <div className={styles.parts}>
          <div className={styles.part}>
            <h3>Every view is a link</h3>
            <p>
              The address bar holds the view: the object in focus and where the camera is. There is
              no share button; the address is the link.
            </p>
          </div>
          <div className={styles.part}>
            <h3>A place and a moment</h3>
            <p>
              A link can also set the clock. The planets, moons and spacecraft then stand where they
              were at that moment.
            </p>
            <AddressStrip hash={MOMENT} plain />
            <ViewLink hang href={appLink(MOMENT)}>
              Saturn on 15 October 2017
            </ViewLink>
          </div>
        </div>
        <div className={styles.open}>
          <OpenApp />
        </div>
      </div>
    </>
  );
}

export default Sharing;
