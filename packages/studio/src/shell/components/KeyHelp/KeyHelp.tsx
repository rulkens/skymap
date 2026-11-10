import { useEffect, useRef, type KeyboardEvent } from 'react';
import Kbd from '../../../primitives/components/Kbd/Kbd';
import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import { STUDIO_KEYS } from '../../data/studioKeys';
import { KEY_GROUPS } from './KeyHelp.constants';
import s from './KeyHelp.module.css';

type Props = { readonly onClose: () => void };

/** The `?` overlay: every studio key from the same table the handler binds, by group. Escape closes it first. */
function KeyHelp({ onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };

  return (
    <div className={s.root} role="dialog" aria-label="Keyboard shortcuts" onKeyDown={onKeyDown}>
      <div className={s.head}>
        <span className={s.title}>Keys</span>
        <Button
          ref={close}
          variant="quiet"
          size="compact"
          aria-label="Close keys"
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </Button>
      </div>
      <div className={s.groups}>
        {KEY_GROUPS.map((group) => (
          <section key={group} className={s.group}>
            <h3 className={s.groupTitle}>{group}</h3>
            {STUDIO_KEYS.filter((key) => key.group === group).map((key) => (
              <span key={key.id} className={s.row}>
                <span className={s.chips}>
                  {key.chips.map((chip) => (
                    <Kbd key={chip}>{chip}</Kbd>
                  ))}
                </span>
                {key.label}
              </span>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export default KeyHelp;
