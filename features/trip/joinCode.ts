// Join codes look like "gang-7k2": a word from the trip name + 3 random characters.
// No 0/o/1/l/i so they're easy to read out loud.

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeJoinCode(tripName: string, random: () => number = Math.random): string {
  const words = tripName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const word = (words[words.length - 1] ?? 'trip').slice(0, 6);
  let tail = '';
  for (let i = 0; i < 3; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${word}-${tail}`;
}

const STOP_WORDS = new Set(['the', 'and', 'with', 'for', 'our', 'trip', 'holiday']);

/**
 * Clean up whatever the user typed or pasted: "GANG-7K2", " gang 7k2 ",
 * or a whole invite link ending in /j/gang-7k2 or ?code=gang-7k2.
 */
export function normalizeJoinCode(input: string): string {
  let s = input.trim().toLowerCase();
  const fromQuery = s.match(/[?&]code=([a-z0-9-]+)/);
  const fromPath = s.match(/\/j\/([a-z0-9-]+)/);
  if (fromQuery) s = fromQuery[1];
  else if (fromPath) s = fromPath[1];
  s = s.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s;
}

export function looksLikeJoinCode(code: string): boolean {
  return /^[a-z]{2,6}-[a-z0-9]{3}$/.test(code);
}
