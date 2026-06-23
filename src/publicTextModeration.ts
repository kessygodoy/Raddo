const PUBLIC_TEXT_BLOCK_MESSAGE =
  'Este texto não pode ser publicado porque contém palavrões, linguagem de baixo calão ou conteúdo sexual. Reformule o texto para continuar.';

const blockedWordPatterns = [
  /\b(?:caralh\w*|porr\w*|merd\w*|put[ao]s?|fod\w*|bost\w*|cacete\w*)\b/u,
  /\b(?:bucet\w*|bocet\w*|xerec\w*|xan[ao]|piro[cq]\w*|rol[ao]|p[eê]nis|vagin\w*)\b/u,
  /\b(?:sexo|sexual|sexy|transa\w*|trepa\w*|boquete\w*|nudes?|pelad[ao]s?|porn\w*)\b/u,
  /\b(?:tes[aã]o|orgasm\w*|goza\w*|masturb\w*|punhet\w*|siriric\w*|surub\w*)\b/u,
  /\b(?:fuck\w*|shit\w*|bitch\w*|dick\w*|cock\w*|pussy|blowjob\w*|naked|horny)\b/u,
  /\b(?:mierd\w*|co[nñ]o|ching\w*|pendej\w*)\b/u,
];

function normalizePublicText(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return normalized.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (letters) => letters.replace(/\s+/g, ''));
}

export function publicTextIsAllowed(value: string) {
  const normalized = normalizePublicText(value);
  if (!normalized) return true;
  const withoutLongRepeats = normalized.replace(/([a-z])\1{2,}/g, '$1');
  return !blockedWordPatterns.some((pattern) => pattern.test(normalized) || pattern.test(withoutLongRepeats));
}

export function assertPublicTextAllowed(...values: string[]) {
  if (values.some((value) => !publicTextIsAllowed(value))) throw new Error(PUBLIC_TEXT_BLOCK_MESSAGE);
}

export function publicTextValidationMessage(...values: string[]) {
  return values.some((value) => !publicTextIsAllowed(value)) ? PUBLIC_TEXT_BLOCK_MESSAGE : '';
}
