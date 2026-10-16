/** The fields show and label entries share: where the switch lives and how it recedes. */
export type VisibilityEntryCommon = {
  /** Settings cluster; defaults to `key` on a show entry, required on a label entry. */
  readonly cluster?: string;
  /** Per item: the switch is `settings[cluster].items[id].<field>`. */
  readonly items?: readonly string[];
  /** Focus recession strength; omitted = does not recede. */
  readonly recession?: 'strong' | 'mild';
};
