// Phonetic keys for duplicate detection — Soundex, implemented here rather
// than pulled in as a dependency. Consistent with this project's standing
// preference for built-ins on small, well-understood jobs (HMAC over a
// signing library, contentEditable over an editor framework).
//
// This key is ONLY ever used to find candidate duplicates. It is never
// displayed, never used for the main search, and never treated as identity
// on its own — a match is a prompt for a human to look, not a merge.

const CODES = {
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

// Standard Soundex over one word. H and W are transparent — they don't code,
// but they also don't break adjacency, so "Ashworth" doesn't gain a digit
// where the letters sound joined.
function soundexWord(word) {
  const letters = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return '';

  const first = letters[0];
  let previousCode = CODES[first] || '';
  let result = first;

  for (let i = 1; i < letters.length && result.length < 4; i += 1) {
    const letter = letters[i];
    const code = CODES[letter];

    if (letter === 'H' || letter === 'W') {
      // Transparent: leave previousCode as it was, so B-H-P still collapses.
      continue;
    }
    if (!code) {
      // A vowel resets adjacency, so "Pepper" keeps both P sounds.
      previousCode = '';
      continue;
    }
    if (code !== previousCode) result += code;
    previousCode = code;
  }

  return (result + '000').slice(0, 4);
}

// Key for a full name. Each word is coded separately and the codes are
// sorted, so "Ishan Dusane" and "Dusane Ishan" produce the same key —
// reversed given/family name order is a routine data-entry variation, not a
// different person.
function phoneticKey(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .map(soundexWord)
    .filter(Boolean);

  if (!words.length) return '';
  return words.sort().join('-');
}

module.exports = { phoneticKey, soundexWord };
