/** ExhibitSection — open an exhibit or play a clip, and leave either with Exit. */

import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteMenu } from '../../../@types/remote/RemoteMenu';
import controls from '../remoteControls.module.css';

export type ExhibitSectionProps = {
  menu: RemoteMenu | null;
  onCommand: (command: RemoteCommand) => void;
};

function ExhibitSection({ menu, onCommand }: ExhibitSectionProps) {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Exhibits and clips</h2>
      <div className={controls.row}>
        {menu?.exhibits.map(({ id: exhibitId, label }) => (
          <button
            key={exhibitId}
            type="button"
            className={controls.button}
            onClick={() => onCommand({ name: 'goTo', payload: { kind: 'exhibit', exhibitId } })}
          >
            {label}
          </button>
        ))}
        {menu?.clips.map((clip) => (
          <button
            key={clip.id}
            type="button"
            className={controls.button}
            onClick={() => onCommand({ name: 'clipStart', payload: { clipId: clip.id } })}
          >
            {clip.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={controls.button}
        onClick={() => onCommand({ name: 'exitTakeover', payload: null })}
      >
        Exit
      </button>
    </section>
  );
}

export default ExhibitSection;
