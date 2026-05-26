import type { GenderIdentity, ProfileInterest, RelationshipGoal, Sexuality } from './types';

export const genderOptions: Array<{ value: GenderIdentity; label: string }> = [
  { value: 'man', label: 'Homem' },
  { value: 'woman', label: 'Mulher' },
  { value: 'couple', label: 'Casal' },
  { value: 'nonbinary', label: 'Nao binario' },
  { value: 'trans', label: 'Trans' },
  { value: 'other', label: 'Outros' },
  { value: 'prefer_not_to_say', label: 'Prefiro nao informar' },
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

export const interestOptions: Array<{ value: ProfileInterest; label: string }> = [
  { value: 'games', label: 'Games' },
  { value: 'gym', label: 'Academia' },
  { value: 'anime', label: 'Anime' },
  { value: 'technology', label: 'Tecnologia' },
  { value: 'music', label: 'Musica' },
  { value: 'travel', label: 'Viagem' },
  { value: 'cars', label: 'Carros' },
  { value: 'pets', label: 'Pets' },
];

export const relationshipGoalOptions: Array<{ value: RelationshipGoal; label: string }> = [
  { value: 'dating', label: 'Namoro' },
  { value: 'friendship', label: 'Amizade' },
  { value: 'chat', label: 'Conversar' },
  { value: 'casual', label: 'Casual' },
];

export function formatGender(value: string) {
  return genderOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatSexuality(value: string) {
  return sexualityOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatInterest(value: string) {
  return interestOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatRelationshipGoal(value: string) {
  return relationshipGoalOptions.find((option) => option.value === value)?.label ?? value;
}

export function formatRadius(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
