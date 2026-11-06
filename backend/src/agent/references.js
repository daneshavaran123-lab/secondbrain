// Records the assistant names in an answer become links to their page in the app
// (specs/002-assistant-links-notifications/contracts/assistant-references.md).
// Read tools give the model a short key per record (r1, r2…); the model writes [title](ref:r1)
// and never a URL. linkify() keeps only keys from this answer, links titles the model left
// plain, and turns every other link into plain text, so an answer cannot point outside the app.

/** An in-app page: starts with one «/», no scheme, no spaces. */
export const isAppPath = (p) => typeof p === 'string' && /^\/(?!\/)/.test(p) && !p.includes(':') && !/\s/.test(p);

const LINK = /(!?)\[([^\]\n]*)\]\(([^)\s]*)\)/g;
const MIN_TITLE = 3;
const ZWNJ = String.fromCharCode(0x200c);
const HOLD = String.fromCharCode(0xe000); // private-use mark around text already decided

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const label = (s) => String(s).replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')'));

export function createReferenceBook() {
  const byKey = new Map();
  const byRecord = new Map();

  return {
    /** Key for a record; the same record keeps its key. Null when it has no page. */
    add({ type, id, title, path }) {
      if (!isAppPath(path) || id === undefined || id === null) return null;
      const record = `${type}:${id}`;
      if (byRecord.has(record)) return byRecord.get(record);
      const key = `r${byKey.size + 1}`;
      byKey.set(key, { key, type, id: String(id), title: String(title ?? '').trim(), path });
      byRecord.set(record, key);
      return key;
    },

    list() {
      return [...byKey.values()];
    },

    /** Keep only this answer's ref: links, drop all others to text, link titles left plain. */
    linkify(text) {
      if (!text) return text;
      const linked = new Set();
      let out = String(text).replace(LINK, (_m, bang, inner, target) => {
        const ref = /^ref:(r\d+)$/.exec(target);
        if (!bang && ref && byKey.has(ref[1])) {
          linked.add(ref[1]);
          return `[${inner}](ref:${ref[1]})`;
        }
        return inner; // external, unknown key, image: keep the words only
      });

      // Titles the model wrote without a link: link the first whole-word occurrence outside
      // existing links. Longer titles go first and keep all their occurrences, so «کلاته» is not
      // linked inside a later «آب شرب روستای کلاته».
      const held = [];
      const hold = (s) => `${HOLD}${held.push(s) - 1}${HOLD}`;
      out = out.replace(/\[[^\]\n]*\]\(ref:r\d+\)/g, hold);
      const titles = [...byKey.values()]
        .filter((r) => r.title.length >= MIN_TITLE)
        .sort((a, b) => b.title.length - a.title.length);
      for (const r of titles) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}${ZWNJ}])${escapeRegExp(r.title)}(?![\\p{L}\\p{N}${ZWNJ}])`, 'gu');
        out = out.replace(pattern, (m) => {
          if (linked.has(r.key)) return hold(m);
          linked.add(r.key);
          return hold(`[${label(r.title)}](ref:${r.key})`);
        });
      }
      return out.replace(new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g'), (_m, i) => held[Number(i)]);
    },
  };
}
