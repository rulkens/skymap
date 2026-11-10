import s from './InspectorSection.module.css';

type Props = { readonly title: string };

function InspectorSection({ title }: Props) {
  return <p className={s.root}>{title}</p>;
}

export default InspectorSection;
