import type { CatalogItem } from './domain.ts';

export type DictatedInvoiceLine = {
  id: string;
  rawDescription: string;
  catalogueItemId: string | null;
  billedQuantity: number | null;
};

export type DictatedCountSuggestion = {
  lineId: string;
  good: string;
  damaged: string;
  missing: string;
};

const countValues = new Map<string, number>();
['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
  .forEach((word, value) => countValues.set(word, value));
const hindiCountSpellings: [number, string[]][] = [
  [0, ['shunya', 'shoonya', 'शून्य']],
  [1, ['ek', 'aik', 'एक']], [2, ['do', 'दो']], [3, ['teen', 'tin', 'तीन']],
  [4, ['char', 'chaar', 'चार']], [5, ['panch', 'paanch', 'पांच', 'पाँच']],
  [6, ['chhe', 'chhah', 'chah', 'che', 'छह', 'छः']], [7, ['saat', 'sat', 'सात']],
  [8, ['aath', 'ath', 'आठ']], [9, ['nau', 'nao', 'नौ']], [10, ['das', 'dus', 'दस']],
  [11, ['gyarah', 'gyaarah', 'ग्यारह']], [12, ['barah', 'baarah', 'बारा', 'बारह']],
  [13, ['terah', 'tera', 'तेरह']], [14, ['chaudah', 'chauda', 'चौदह']],
  [15, ['pandrah', 'pandra', 'पंद्रह', 'पन्द्रह']], [16, ['solah', 'sola', 'सोलह']],
  [17, ['satrah', 'satra', 'सत्रह']], [18, ['atharah', 'athara', 'अठारह']],
  [19, ['unnees', 'unnis', 'उन्नीस']], [20, ['bees', 'bis', 'बीस']],
  [21, ['ikkees', 'ikkis', 'इक्कीस']], [22, ['baees', 'bais', 'बाईस', 'बाइस']],
  [23, ['teis', 'teiis', 'तेईस']], [24, ['chaubees', 'chaubis', 'चौबीस']],
  [25, ['pachis', 'pachchis', 'pachchees', 'पच्चीस']], [26, ['chhabbis', 'छब्बीस']],
  [27, ['sattais', 'सत्ताईस']], [28, ['atthais', 'अट्ठाईस']], [29, ['untees', 'उनतीस']],
  [30, ['tees', 'तीस']], [40, ['chalis', 'chaalis', 'चालीस']], [50, ['pachas', 'pachaas', 'पचास']],
  [60, ['saath', 'साठ']], [70, ['sattar', 'सत्तर']], [80, ['assi', 'अस्सी']],
  [90, ['nabbe', 'नब्बे']], [100, ['sau', 'सौ']],
];
for (const [value, spellings] of hindiCountSpellings) {
  for (const spelling of spellings) countValues.set(spelling, value);
}

function normalize(text: string) {
  return text.normalize('NFKC').replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966)).toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function quantityFor(text: string, labels: string[]) {
  const escapedCounts = [...countValues.keys()].sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const token = `(\\d+|${escapedCounts.join('|')})`;
  const label = `(?:${labels.join('|')})`;
  const before = new RegExp(`(?:^|[\\s,;:])${token}\\s*${label}(?=$|[\\s,;.!])`, 'iu').exec(text)?.[1];
  const after = new RegExp(`(?:^|[\\s,;:])${label}\\s*[:\\-]?\\s*${token}(?=$|[\\s,;.!])`, 'iu').exec(text)?.[1];
  const raw = before ?? after;
  if (!raw) return null;
  const value = /^\d+$/u.test(raw) ? Number(raw) : countValues.get(raw.toLocaleLowerCase());
  return Number.isSafeInteger(value) && value! >= 0 && value! <= 1_000_000 ? value! : null;
}

const labels = {
  good: ['good', 'okay', 'usable', 'सही', 'ठीक'],
  damaged: ['damaged', 'broken', 'torn', 'खराब', 'फटा', 'टूटा'],
  missing: ['missing', 'short', 'less', 'कम', 'नहीं आया'],
};

/** Turn simple spoken condition counts into editable suggestions; it never confirms a delivery. */
export function suggestDictatedDeliveryCounts(
  note: string,
  invoiceLines: readonly DictatedInvoiceLine[],
  catalogue: readonly CatalogItem[],
): DictatedCountSuggestion[] {
  const text = normalize(note);
  if (!text || !invoiceLines.length) return [];

  const mentions = invoiceLines.flatMap((line) => {
    if (!line.catalogueItemId) return [];
    const item = catalogue.find((candidate) => candidate.id === line.catalogueItemId);
    if (!item) return [];
    const phrases = [...new Set([item.name, `${item.name} ${item.packSize}`, ...item.aliases].map(normalize))]
      .filter((phrase) => phrase.length >= 3)
      .sort((a, b) => b.length - a.length);
    const found = phrases.map((phrase) => ({ phrase, lineId: line.id, start: text.indexOf(phrase) })).filter((match) => match.start >= 0);
    return found;
  }).sort((a, b) => a.start - b.start);
  const unique: [number, string][] = [];
  for (let index = 0; index < mentions.length;) {
    const start = mentions[index].start;
    const atStart = mentions.filter((mention) => mention.start === start);
    const longest = Math.max(...atStart.map((mention) => mention.phrase.length));
    const owners = new Set(atStart.filter((mention) => mention.phrase.length === longest).map((mention) => mention.lineId));
    if (owners.size === 1) unique.push([start, [...owners][0]]);
    index += atStart.length;
  }

  return invoiceLines.flatMap((line) => {
    if (line.billedQuantity === null || !line.catalogueItemId) return [];
    let segment = text;
    if (invoiceLines.length > 1) {
      const mentionIndex = unique.findIndex(([, lineId]) => lineId === line.id);
      if (mentionIndex < 0) return [];
      const [start] = unique[mentionIndex];
      const end = unique[mentionIndex + 1]?.[0] ?? text.length;
      segment = text.slice(start, end);
    }
    const damaged = quantityFor(segment, labels.damaged);
    const missing = quantityFor(segment, labels.missing);
    const good = quantityFor(segment, labels.good);
    if (damaged === null && missing === null && good === null) return [];
    const damagedValue = damaged ?? 0;
    const missingValue = missing ?? 0;
    const goodValue = good ?? line.billedQuantity - damagedValue - missingValue;
    if (goodValue < 0 || goodValue + damagedValue + missingValue !== line.billedQuantity) return [];
    return [{ lineId: line.id, good: String(goodValue), damaged: String(damagedValue), missing: String(missingValue) }];
  });
}
