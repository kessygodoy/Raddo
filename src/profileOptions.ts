import type { GenderIdentity, Sexuality } from './types';

export const genderOptions: Array<{ value: GenderIdentity; label: string }> = [
  { value: 'man', label: 'Homem' },
  { value: 'woman', label: 'Mulher' },
  { value: 'couple', label: 'Casal' },
];

export const sexualityOptions: Array<{ value: Sexuality; label: string }> = [
  { value: 'hetero', label: 'Hetero' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbica' },
  { value: 'bi', label: 'Bi' },
  { value: 'pan', label: 'Pan' },
  { value: 'trans', label: 'Trans' },
  { value: 'nonbinary', label: 'Não binário' },
  { value: 'queer', label: 'Queer' },
  { value: 'asexual', label: 'Assexual' },
  { value: 'demisexual', label: 'Demissexual' },
  { value: 'other', label: 'Outro' },
];

export function formatGender(value: string) {
  return genderOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatSexuality(value: string) {
  return sexualityOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatRadius(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
