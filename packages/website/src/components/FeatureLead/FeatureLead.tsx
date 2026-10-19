/*
 * FeatureLead — the opening of the Features page: its title and one short
 * lead, with no picture, since every group below brings its own.
 */
import styles from './FeatureLead.module.css';

function FeatureLead() {
  return (
    <section className={styles.root}>
      <h1>Features</h1>
      <p className={styles.say}>
        Everything you can see and do in Skymap, in the order you meet it. Each name opens its page
        in the docs.
      </p>
    </section>
  );
}

export default FeatureLead;
