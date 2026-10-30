// The same Persian normalization as the server's search (backend/src/search/normalize.js), for
// matching on this side: ي/ى→ی، ك→ک، ة→ه، أ/إ→ا، Persian and Arabic digits → 0-9; zero-width
// marks (ZWNJ…), tatweel and diacritics removed; lower case.

const MAP: Record<string, string> = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا' };
'۰۱۲۳۴۵۶۷۸۹'.split('').forEach((d, i) => { MAP[d] = String(i); });
'٠١٢٣٤٥٦٧٨٩'.split('').forEach((d, i) => { MAP[d] = String(i); });
const DROP_CODES = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff, 0x0640, 0x0670];
for (let c = 0x064b; c <= 0x065f; c++) DROP_CODES.push(c);
const DROP = new Set(DROP_CODES.map((c) => String.fromCharCode(c)));

export const normalizeFa = (text: string) => {
  let out = '';
  for (const c of text) if (!DROP.has(c)) out += MAP[c] ?? c;
  return out.toLowerCase();
};

/** Distinct words of a query, normalized. */
export const queryWords = (text: string) =>
  [...new Set(normalizeFa(text).split(/[\s,.;:!?؟،؛«»"'()[\]{}\-/\\|…]+/).filter(Boolean))];

/** Every word of the query is somewhere in the text. */
export const matchesAll = (text: string, words: string[]) => {
  const t = normalizeFa(text);
  return words.every((w) => t.includes(w));
};
