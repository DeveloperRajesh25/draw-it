import levenshtein from 'fast-levenshtein';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

export function isExactMatch(guess: string, word: string): boolean {
  return normalize(guess) === normalize(word);
}

export function isCloseMatch(guess: string, word: string): boolean {
  const g = normalize(guess);
  const w = normalize(word);
  if (!g || !w) return false;
  if (g === w) return false;
  if (Math.abs(g.length - w.length) > 2) return false;
  return levenshtein.get(g, w) <= 1;
}
