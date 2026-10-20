/* Closing — Home's last section: Saturn behind the words that say what the pictures are, and the way into the app. */
import OpenApp from '../OpenApp/OpenApp.tsx';
import PictureBand from '../PictureBand/PictureBand.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Closing.module.css';

function Closing() {
  return (
    <PictureBand id="saturn" tall="saturn-portrait" words="right">
      <h2>Most pictures here are addresses</h2>
      <p>
        Choose “Open this view” under one and the app opens on the same view. From there you can
        move the camera.
      </p>
      <OpenApp className={styles.open} />
      <ShotCaption id="saturn" />
    </PictureBand>
  );
}

export default Closing;
