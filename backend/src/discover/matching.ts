function words(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function containsPhrase(value: string, phrase: string): boolean {
  const normalized = words(phrase);
  return Boolean(normalized) && ` ${words(value)} `.includes(` ${normalized} `);
}

export function matchesCriteria(
  result: { title: string | null; location: string | null },
  criteria: { includeKeywords?: string; excludeKeywords?: string; location?: string },
): boolean {
  const includes = (criteria.includeKeywords ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const excludes = (criteria.excludeKeywords ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const title = result.title ?? '';
  if (excludes.some((phrase) => containsPhrase(title, phrase))) return false;
  if (includes.length && !includes.some((phrase) => containsPhrase(title, phrase))) return false;
  const locations = (criteria.location ?? '').split(';').map((s) => s.trim().split(',')[0]).filter(Boolean);
  return locations.length < 2 || locations.some((place) => containsPhrase(result.location ?? '', place));
}
