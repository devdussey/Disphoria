const LETTER_POOL = 'EEEEEEEEEEEEAAAAAAAAAIIIIIIIIOOOOOOOONNNNNNRRRRRRTTTTTTLLLLSSSSUUUUDDDDGGGGBBCCMMPPFFHHVVWWYYKJXQZ';

// These 3-letter sequences are chosen because they appear in plenty of common words/names,
// ensuring each round is realistically solvable (even though answers are not dictionary-checked).
const PLAYABLE_TRIPLETS = [
  'THE', 'AND', 'ING', 'ION', 'ENT', 'TIO', 'ATI', 'ERE', 'HER', 'HIS', 'THA', 'THI', 'NTH', 'YOU', 'ARE', 'FOR', 'NOT',
  'ONE', 'OUR', 'OUT', 'ALL', 'EAS', 'EST', 'RES', 'TER', 'VER', 'CON', 'PRO', 'STA', 'MEN', 'EVE', 'OVE', 'EAL', 'EAR',
  'EER', 'ERS', 'NES', 'NCE', 'SIO', 'SIN', 'TED', 'TES', 'PRE', 'PER', 'SUP', 'SUB', 'TRA', 'STR', 'GRA', 'GRO', 'GLO',
  'WOR', 'ORD', 'RUS', 'USH', 'ASH', 'SHE', 'HEA', 'ART', 'HOU', 'USE', 'HOM', 'OME', 'FAM', 'MIL', 'ILI', 'LIA', 'IAL',
  'BLE', 'ABL', 'FUL', 'OUS', 'IVE', 'IZE', 'ISE', 'TION', // note: filtered below to keep only 3 chars
  'CAT', 'DOG', 'MAN', 'WOM', 'KID', 'CAR', 'BUS', 'TRA', 'AIR', 'SEA', 'SKY', 'SUN', 'MOON', // filtered below
  'ANA', 'ANN', 'SAM', 'BEN', 'MAX', 'LIA', 'MIA', 'EVA', 'AVA', 'NOA', 'LEO', 'KAI', 'ZOE', 'JAN', 'KIM', 'ALI', 'OMAR',
].filter(item => /^[A-Z]{3}$/.test(item));

function pickLetters(count = 3) {
  const target = Number.isInteger(count) ? count : 3;
  const letters = [];
  for (let i = 0; i < target; i += 1) {
    const idx = Math.floor(Math.random() * LETTER_POOL.length);
    letters.push(LETTER_POOL[idx]);
  }
  return letters;
}

function formatLetters(letters) {
  if (!Array.isArray(letters) || !letters.length) return '';
  return letters.map(letter => String(letter || '').toUpperCase()).join(' ');
}

function pickPlayableLetters() {
  if (!PLAYABLE_TRIPLETS.length) return pickLetters(3);
  const triplet = PLAYABLE_TRIPLETS[Math.floor(Math.random() * PLAYABLE_TRIPLETS.length)];
  return triplet.split('');
}

function normaliseCandidateWord(input) {
  if (!input || typeof input !== 'string') return null;
  let trimmed = input.trim();
  if (!trimmed) return null;

  // Common cleanup for Discord chat: strip wrapping punctuation and normalise apostrophes/dashes.
  trimmed = trimmed.replace(/[’]/g, "'").replace(/[–—]/g, '-');
  trimmed = trimmed.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z'\\-]+$/, '');
  if (!trimmed) return null;

  // Allow proper names as well as words (letters + optional apostrophes/hyphens).
  if (!/^[A-Za-z][A-Za-z'\\-]{2,31}$/.test(trimmed)) return null;
  return trimmed;
}

function containsLettersInOrder(word, letters) {
  if (!word || typeof word !== 'string') return false;
  const required = Array.isArray(letters)
    ? letters.map(letter => String(letter || '').toUpperCase()).filter(Boolean)
    : String(letters || '').toUpperCase().split('').filter(Boolean);

  if (required.length !== 3) return false;

  const haystack = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (haystack.length < required.length) return false;

  let idx = -1;
  for (const letter of required) {
    idx = haystack.indexOf(letter, idx + 1);
    if (idx === -1) return false;
  }
  return true;
}

module.exports = {
  pickLetters,
  pickPlayableLetters,
  formatLetters,
  normaliseCandidateWord,
  containsLettersInOrder,
};
