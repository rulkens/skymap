import type { TextEdit } from './TextEdit';

/** The parameter-list edit of a function converted to one object parameter, or why it cannot be. */
export type ParamsDeclarationEdit =
  | {
      readonly ok: true;
      readonly edit: Omit<TextEdit, 'file'>;
      readonly names: readonly string[];
      readonly line: number; // of the function's name
      readonly staleParamTags: boolean; // its JSDoc has @param tags for the old parameters
    }
  | { readonly ok: false; readonly line: number; readonly refusal: string };
