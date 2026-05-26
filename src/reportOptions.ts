export type ReportReason =
  | 'sexual_content'
  | 'harassment'
  | 'fake_profile'
  | 'spam'
  | 'minor_safety'
  | 'illegal_content'
  | 'other';

export const reportReasons: Array<{ value: ReportReason; label: string }> = [
  { value: 'sexual_content', label: 'Conteúdo sexual' },
  { value: 'harassment', label: 'Assédio' },
  { value: 'fake_profile', label: 'Perfil falso' },
  { value: 'spam', label: 'Spam' },
  { value: 'minor_safety', label: 'Menor de idade' },
  { value: 'illegal_content', label: 'Conteúdo ilegal' },
  { value: 'other', label: 'Outro' },
];

