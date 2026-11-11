import s from './SegmentedField.module.css';

type Props = {
  readonly value: string;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly text: string }[];
  readonly onChange: (value: string) => void;
};

function SegmentedField({ value, label, options, onChange }: Props) {
  return (
    <span className={s.root} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </span>
  );
}

export default SegmentedField;
