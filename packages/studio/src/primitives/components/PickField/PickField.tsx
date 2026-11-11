import s from './PickField.module.css';

type Props = {
  readonly value: string;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly text: string }[];
  readonly onChange: (value: string) => void;
};

function PickField({ value, label, options, onChange }: Props) {
  return (
    <select
      className={s.root}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.text}
        </option>
      ))}
    </select>
  );
}

export default PickField;
