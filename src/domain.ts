export type StockUnit = 'packet' | 'piece' | 'bottle' | 'box' | 'kg' | 'quintal';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';

export interface CatalogItem {
  id: string;
  name: string;
  packSize: string;
  unit: StockUnit;
  aliases: readonly string[];
  imageUri?: string | null;
  barcode?: string | null;
  brand?: string | null;
  packageContent?: string | null;
  catalogueSource?: 'owner' | 'open_food_facts' | null;
}

export interface ReceiptDraftLine {
  id: string;
  label: string;
  catalogItemId: string | null;
  candidateIds: string[];
  quantity: number | null;
  unit: StockUnit | null;
}

interface ReceiptDetails {
  supplier: string | null;
  receiptTotalPaise: number | null;
  amountPaidPaise: number | null;
  paymentMethod: PaymentMethod | null;
}

export interface ReceiptDraft extends ReceiptDetails {
  lines: ReceiptDraftLine[];
  issues: string[];
}

export interface ReceiptInput extends ReceiptDetails {
  voiceNote?: string | null;
  lines: { catalogItemId: string; name: string; packSize: string; quantity: number; unit: StockUnit }[];
}

export const MAX_QUANTITY = 1_000_000;
export const MAX_MONEY_PAISE = 100_000_000_000;
export const RECEIPT_TOTAL_ISSUE = 'Check the receipt total or mark it unknown.';
export const AMOUNT_PAID_ISSUE = 'Check the amount paid or mark it unknown.';
export const PAYMENT_METHOD_ISSUE = 'Choose the payment method or mark it unknown.';
export const MIXED_EVENT_RECEIPT_ISSUE = 'This note contains customer activity. Use Home note capture so supplier and customer events are not combined into a receipt.';

export const DEMO_TRANSCRIPT =
  'Sharma se Maggi ke 12 packet aur Surf Excel 500 gram ke 6 packet aaye. Bill 840 ka tha, 500 cash diya.';

export const DEMO_CATALOG: readonly CatalogItem[] = [
  {
    id: 'maggi-70g', name: 'Maggi Masala Noodles', packSize: '70 g', unit: 'packet',
    aliases: ['maggi', 'maggie', 'maggi masala', 'मैगी', 'मैगी मसाला', 'maggi 70 g', 'मैगी 70 g', 'maggie 70 g'],
  },
  {
    id: 'maggi-280g', name: 'Maggi Masala Noodles', packSize: '280 g', unit: 'packet',
    aliases: ['maggi', 'maggie', 'maggi masala', 'मैगी', 'मैगी मसाला', 'maggi 280 g', 'मैगी 280 g', 'maggie 280 g'],
  },
  {
    id: 'surf-excel-500g', name: 'Surf Excel', packSize: '500 g', unit: 'packet',
    aliases: ['surf', 'surf excel', 'सर्फ', 'सर्फ एक्सेल', 'surf 500 g', 'सर्फ 500 g', 'सर्फ एक्सेल 500 g'],
  },
  {
    id: 'surf-excel-1kg', name: 'Surf Excel', packSize: '1 kg', unit: 'packet',
    aliases: ['surf', 'surf excel', 'सर्फ', 'सर्फ एक्सेल', 'surf 1 kg', 'सर्फ 1 kg', 'सर्फ एक्सेल 1 kg'],
  },
  {
    id: 'parle-g-90g', name: 'Parle-G', packSize: '90 g', unit: 'packet',
    aliases: ['parle g', 'parle-g', 'पारले जी', 'पार्ले जी', 'parle g 90 g', 'पारले जी 90 g'],
  },
  {
    id: 'bisleri-1l', name: 'Bisleri Water', packSize: '1 L', unit: 'bottle',
    aliases: ['bisleri', 'bisleri water', 'बिसलेरी', 'bisleri 1 l', 'बिसलेरी 1 l'],
  },
];

const UNIT_ALIASES: Readonly<Record<string, StockUnit>> = {
  packet: 'packet', packets: 'packet', pack: 'packet', packs: 'packet', 'पैकेट': 'packet', 'पैकेट्स': 'packet',
  piece: 'piece', pieces: 'piece', pcs: 'piece', 'पीस': 'piece',
  bottle: 'bottle', bottles: 'bottle', 'बोतल': 'bottle', 'बोतलें': 'bottle',
  box: 'box', boxes: 'box', carton: 'box', cartons: 'box', ctn: 'box', dabba: 'box', 'कार्टन': 'box', 'डब्बा': 'box', 'डिब्बा': 'box', 'डिब्बे': 'box',
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', 'किलो': 'kg', 'किलोग्राम': 'kg',
  quintal: 'quintal', quintals: 'quintal', qtl: 'quintal', 'क्विंटल': 'quintal',
};

const PAYMENT_ALIASES: Readonly<Record<string, PaymentMethod>> = {
  cash: 'cash', nakad: 'cash', 'कैश': 'cash', 'नकद': 'cash',
  upi: 'upi', 'यूपीआई': 'upi', 'यू पी आई': 'upi',
  card: 'card', 'कार्ड': 'card',
  'bank transfer': 'bank_transfer', 'बैंक ट्रांसफर': 'bank_transfer',
};

const HINDI_NUMBERS: readonly (readonly string[])[] = [
  ['shunya zero', 'शून्य ज़ीरो'],
  ['ek', 'एक'], ['do', 'दो'], ['teen tin', 'तीन'], ['char chaar', 'चार'],
  ['panch paanch', 'पांच पाँच'], ['chhe chhah che chah', 'छह छः'],
  ['saat sat', 'सात'], ['aath ath', 'आठ'], ['nau nao', 'नौ'], ['das dus', 'दस'],
  ['gyarah gyaarah', 'ग्यारह'], ['barah baara baarah', 'बारह'], ['terah tera', 'तेरह'],
  ['chaudah chaudha', 'चौदह'], ['pandrah pandra', 'पंद्रह पन्द्रह'], ['solah sola', 'सोलह'],
  ['satrah satra', 'सत्रह सत्तरह'], ['atharah athara', 'अठारह'], ['unnees unnis', 'उन्नीस'],
  ['bees bis', 'बीस'], ['ikkees ikkis', 'इक्कीस'], ['baees bais', 'बाईस बाइस'], ['teis teiis', 'तेईस'],
  ['chaubees chaubis', 'चौबीस'], ['pachis pachchis pachchees', 'पच्चीस'],
];

const COUNT_WORDS = new Map<string, number>();
HINDI_NUMBERS.forEach((spellings, number) => {
  spellings.flatMap((group) => group.split(' ')).forEach((word) => COUNT_WORDS.set(word, number));
});
const ENGLISH_NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
ENGLISH_NUMBERS.forEach((word, index) => COUNT_WORDS.set(word, index));
const TENS_WORDS = new Map<string, number>([
  ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50], ['sixty', 60],
  ['seventy', 70], ['eighty', 80], ['ninety', 90], ['tees', 30], ['तीस', 30],
  ['chalis', 40], ['चालीस', 40], ['pachas', 50], ['पचास', 50], ['saath', 60], ['साठ', 60],
  ['sattar', 70], ['सत्तर', 70], ['assi', 80], ['अस्सी', 80], ['nabbe', 90], ['नब्बे', 90],
]);

function normalizeDigits(text: string) {
  return text.normalize('NFKC').replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966));
}

function normalize(text: string) {
  return normalizeDigits(text).toLowerCase().replace(/\s+/gu, ' ').trim();
}

function normalizeProduct(text: string) {
  return normalize(text)
    .replace(/(\d)\s*(kilograms?|kilos?|kgs?|किलो(?:ग्राम)?)(?![\p{L}\p{M}])/gu, '$1 kg')
    .replace(/(\d)\s*(grams?|gms?|g|ग्राम)(?![\p{L}\p{M}])/gu, '$1 g')
    .replace(/(\d)\s*(litres?|liters?|ltr|l|लीटर)(?![\p{L}\p{M}])/gu, '$1 l')
    .replace(/[‐‑–—-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseNaturalInteger(text: string): number | null {
  const normalized = normalize(text);
  if (/^\d+$/u.test(normalized)) {
    const number = Number(normalized);
    return Number.isSafeInteger(number) ? number : null;
  }
  const exact = COUNT_WORDS.get(normalized) ?? TENS_WORDS.get(normalized);
  if (exact !== undefined) return exact;
  if (normalized === 'sau' || normalized === 'सौ') return 100;

  const hundreds = normalized.match(/^([^ ]+) (?:hundred|sau|सौ)(?: (.+))?$/u);
  if (hundreds) {
    const leading = parseNaturalInteger(hundreds[1]);
    const trailing = hundreds[2] ? parseNaturalInteger(hundreds[2].replace(/^and /u, '')) : 0;
    if (leading !== null && leading >= 1 && leading <= 9 && trailing !== null && trailing < 100) {
      return leading * 100 + trailing;
    }
  }

  const pair = normalized.match(/^([a-z]+)[ -]([a-z]+)$/u);
  if (pair && ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].includes(pair[1])) {
    const ones = ENGLISH_NUMBERS.indexOf(pair[2]);
    if (ones > 0 && ones < 10) return (TENS_WORDS.get(pair[1]) ?? 0) + ones;
  }
  return null;
}

export function parseRupees(text: string): number | null {
  const normalized = normalize(text).replace(/^(?:₹|rs(?:\.|\s+)|inr)\s*/u, '');
  const [integerPart, fraction = '', ...extra] = normalized.split('.');
  const grouped = /^\d{1,3}(?:,\d{3})+$|^\d{1,2}(?:,\d{2})*,\d{3}$/u.test(integerPart);
  if (extra.length || !/^\d{0,2}$/u.test(fraction) || (normalized.includes('.') && !fraction)) return null;
  const rupees = parseNaturalInteger(grouped ? integerPart.replace(/,/gu, '') : integerPart);
  if (rupees === null) return null;
  const paise = rupees * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise <= MAX_MONEY_PAISE ? paise : null;
}

const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });

export function formatPaise(paise: number) {
  return RUPEE_FORMAT.format(paise / 100);
}

export function emptyReceiptLine(id: string): ReceiptDraftLine {
  return { id, label: '', catalogItemId: null, candidateIds: [], quantity: null, unit: null };
}

export function emptyReceiptDraft(): ReceiptDraft {
  return {
    supplier: null, lines: [emptyReceiptLine('line-1')], receiptTotalPaise: null,
    amountPaidPaise: null, paymentMethod: null, issues: [],
  };
}

function productKeys(item: CatalogItem) {
  return [item.name, `${item.name} ${item.packSize}`, ...item.aliases].map(normalizeProduct);
}

function matchProducts(label: string, catalog: readonly CatalogItem[]) {
  const key = normalizeProduct(label);
  const equivalentGroups = [
    ['दूध', 'doodh', 'dudh', 'milk'],
    ['अंडा', 'अंडे', 'anda', 'ande', 'egg', 'eggs'],
  ];
  const keys = equivalentGroups.find((group) => group.includes(key)) ?? [key];
  return catalog.filter((item) => productKeys(item).some((itemKey) => keys.includes(itemKey)));
}

function isUnitWord(word: string) {
  return Object.prototype.hasOwnProperty.call(UNIT_ALIASES, word);
}

function cleanLabel(text: string) {
  return text.replace(/^(?:ke|ki|ka|of|के|की|का)\s+/u, '')
    .replace(/\s+(?:ke|ki|ka|of|के|की|का)$/u, '').trim();
}

function parseStockLine(segment: string, id: string, catalog: readonly CatalogItem[]): ReceiptDraftLine {
  const normalized = normalize(segment).replace(/^(?:received|got)\s+/u, '').replace(/[×]/gu, ' ').trim();
  const tokens = normalized.split(/\s+/u);
  const units = new Set(tokens.filter(isUnitWord).map((token) => UNIT_ALIASES[token]));
  const ambiguousQuantity = /(?:^| )(?:ya|or|to|tak|around|about|approx(?:imately)?|nahi|nahin|no|not|sorry|sawa|saadhe|sade|या|तक|लगभग|नहीं|सॉरी|सवा|साढ़े)(?: |$)|\d\s*[-–—]\s*\d/u.test(normalized);
  const computedLine = {
    ...emptyReceiptLine(id), label: segment,
    unit: units.size === 1 ? [...units][0] : null,
  };
  const candidates: { label: string; quantity: number; unit: StockUnit }[] = [];
  const addCandidate = (label: string, count: string, unit: StockUnit) => {
    const quantity = parseNaturalInteger(count);
    if (label && quantity !== null && quantity > 0 && quantity <= MAX_QUANTITY) {
      candidates.push({ label, quantity, unit });
    }
  };

  for (let unitIndex = 0; unitIndex < tokens.length; unitIndex += 1) {
    const unitWord = tokens[unitIndex];
    if (!isUnitWord(unitWord)) continue;
    const unit = UNIT_ALIASES[unitWord];
    if (unitIndex < tokens.length - 1) {
      addCandidate(cleanLabel(tokens.slice(unitIndex + 1).join(' ')), tokens.slice(0, unitIndex).join(' '), unit);
    }
    if (unitIndex !== tokens.length - 1) continue;
    for (let split = 1; split < unitIndex; split += 1) {
      addCandidate(cleanLabel(tokens.slice(0, split).join(' ')), tokens.slice(split, unitIndex).join(' '), unit);
      addCandidate(cleanLabel(tokens.slice(split, unitIndex).join(' ')), tokens.slice(0, split).join(' '), unit);
    }
  }

  const deduplicated = candidates.filter((candidate, index) => candidates.findIndex((other) =>
    candidate.label === other.label && candidate.quantity === other.quantity && candidate.unit === other.unit) === index);
  if (deduplicated.length === 1 && !ambiguousQuantity && units.size === 1) {
    const [candidate] = deduplicated;
    const products = matchProducts(candidate.label, catalog);
    const unitCompatibleProducts = products.filter((product) => product.unit === candidate.unit);
    const resolvedProducts = unitCompatibleProducts.length ? unitCompatibleProducts : products;
    const hasUnresolvedCount = !products.length && /(?:^| )\d+(?= |$)/u.test(candidate.label);
    return {
      ...candidate, id, label: segment, quantity: hasUnresolvedCount ? null : candidate.quantity,
      catalogItemId: resolvedProducts.length === 1 ? resolvedProducts[0].id : null,
      candidateIds: resolvedProducts.map((product) => product.id),
    };
  }

  const label = normalizeProduct(normalized);
  const matches = catalog.map((item) => ({
    item,
    keys: productKeys(item).filter((key) => label === key || label.startsWith(`${key} `) || label.endsWith(` ${key}`)),
  }));
  const longestKey = Math.max(0, ...matches.flatMap(({ keys }) => keys.map((key) => key.length)));
  const explicitLabel = normalized.match(/^(.+?)\s+(?:ke|ki|ka|के|की|का)\s+/u)?.[1];
  const explicitlyMatched = explicitLabel ? matchProducts(explicitLabel, catalog) : [];
  const matchingHints = matches.filter(({ keys }) => ambiguousQuantity ? keys.length > 0
    : keys.some((key) => key.length === longestKey));
  const products = explicitlyMatched.length ? explicitlyMatched : matchingHints.map(({ item }) => item);
  const safelyMatched = products.length === 1 && (!ambiguousQuantity || explicitlyMatched.length === 1);
  return {
    ...computedLine, catalogItemId: safelyMatched ? products[0].id : null,
    candidateIds: products.map((product) => product.id),
  };
}

const PAYMENT_PATTERN = Object.keys(PAYMENT_ALIASES).sort((left, right) => right.length - left.length).join('|');
const MENTIONED_PAYMENT_METHOD = new RegExp(`(?:^| )(${PAYMENT_PATTERN})(?= |$)`, 'gu');
const PAID_VERBS = 'paid|diya|diye|di|de diya|de diye|bhugtan kiya|दिया|दिए|दी|दे दिया|दे दिए|भुगतान किया';
const TOTAL_CLAUSE = /^(?:bill(?: total)?|receipt total|total(?: amount)?|invoice(?: total)?|बिल|कुल|टोटल|इनवॉइस)(?=\s|[:=])(?:\s+(?:was|is|amount|का|की|का था))?\s*[:=]?\s*(.+?)(?:\s+(?:ka tha|ki thi|tha|thi|का था|की थी|था|थी))?$/u;
const PAID_SUFFIX = new RegExp(`^(.+?)(?: (${PAYMENT_PATTERN}))? (?:${PAID_VERBS})$`, 'u');
const PAID_PREFIX = new RegExp(`^(?:i )?(?:${PAID_VERBS})(?: (.+?))?(?: (?:by |via )?(${PAYMENT_PATTERN}))?$`, 'u');

const SUPPLIER_DISPATCH_ACTION = /(?:\b(?:bhej\p{L}*|diya|diye|aaya|aayi|aaye|mila|mili|sent|delivered|supplied|received|arrived|brought|got)\b|(?:भेज[ाीे]?|दिया|दिए|आया|आई|आए|आये|मिला|मिली))/iu;

function extractSupplierDispatch(source: string, catalog: readonly CatalogItem[]) {
  const hindi = source.match(/^(.+?\s+(?:ji|जी))\s+(?:ne|ने)\s+(?:mujhe\s+)?([\s\S]+)$/iu)
    ?? source.match(/^(.+?)\s+(?:ne|ने)\s+(?:mujhe\s+)?([\s\S]+)$/iu);
  const english = source.match(/^(.+?)\s+(?:sent|delivered|supplied)\s+([\s\S]+)$/iu);
  const match = hindi ?? english;
  if (!match || (hindi && !SUPPLIER_DISPATCH_ACTION.test(match[2])) || !parseShopEventItems(match[2], catalog).length) return null;
  return { supplier: match[1].trim(), contents: match[2] };
}

function cleanSupplierDispatchContents(text: string) {
  return text
    .replace(/\b(?:aaj|today|has|have|been|hain|hai)\b|(?:आज|हैं|है)/giu, ' ')
    .replace(/\b(?:bhej\p{L}*|diya|diye|aaya|aayi|aaye|mila|mili|sent|delivered|supplied|received|arrived|brought|got)\b|(?:भेज[ाीे]?|दिया|दिए|आया|आई|आए|आये|मिला|मिली)/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function containsCustomerActivity(text: string) {
  return /(?:\b(?:udhaar|udhar|credit|loan|kharid\p{L}*|bought|purchased|customer|grahak|paid\s+me|mere\s+se|mujhse|liya|liye|li)\b|(?:उधार|खरीद[ाीे]?|खरीदा|खरीदे|खरीदी|ग्राहक|मुझसे|मेरे\s+से|लिया|लिए|ली))/iu.test(text);
}

function parseSpokenMoney(text: string) {
  return parseRupees(text.replace(/\s+(?:rupees?|rupay(?:e)?|rupiye|rs\.?|रुपये|रुपए|रुपया|रूपये)$/u, ''));
}

function splitTranscript(text: string) {
  const normalized = normalizeDigits(text).replace(/\brs\.(?=\s*\d)/giu, 'Rs ');
  const clauses: string[] = [];
  let start = 0;
  for (const separator of normalized.matchAll(/[,.;!?।\r\n]|\s+(?:aur|and|और)\s+/giu)) {
    const index = separator.index;
    const end = index + separator[0].length;
    if (['.', ','].includes(separator[0]) && /\d/u.test(normalized[index - 1] ?? '') && /\d/u.test(normalized[end] ?? '')) continue;
    if (separator[0].trim().toLowerCase() === 'and' && /\bhundred$/iu.test(normalized.slice(start, index))) continue;
    clauses.push(normalized.slice(start, index).trim());
    start = end;
  }
  clauses.push(normalized.slice(start).trim());
  return clauses.filter(Boolean);
}

function countedCatalogLines(clause: string, line: ReceiptDraftLine, catalog: readonly CatalogItem[]) {
  const tokens = normalize(clause).split(' ');
  if (tokens.length < 2 || tokens.length > 64) return [line];
  const counts = tokens.map(parseNaturalInteger);
  if (!counts[0]) return [line];
  const ends = tokens.flatMap((_, index) => counts[index] ? [index] : []);
  ends.push(tokens.length);
  // A number can also be part of a product name. Keep at most two fully
  // matched interpretations so an ambiguous list never changes stock.
  const resolved = new Map<number, ReceiptDraftLine[][]>([[tokens.length, [[]]]]);
  for (const start of ends.slice(0, -1).reverse()) {
    const quantity = counts[start];
    if (!quantity || quantity > MAX_QUANTITY) continue;
    const alternatives: ReceiptDraftLine[][] = [];
    for (const end of ends) {
      if (end < start + 2) continue;
      const suffixes = resolved.get(end);
      if (!suffixes?.length) continue;
      const products = matchProducts(tokens.slice(start + 1, end).join(' '), catalog);
      for (const item of products) {
        for (const suffix of suffixes) {
          alternatives.push([{
            ...line, id: `${line.id}-${start}`, label: tokens.slice(start, end).join(' '),
            quantity, unit: item.unit, catalogItemId: item.id, candidateIds: [item.id],
          }, ...suffix]);
          if (alternatives.length > 1) break;
        }
        if (alternatives.length > 1) break;
      }
      if (alternatives.length > 1) break;
    }
    if (alternatives.length) resolved.set(start, alternatives);
  }
  const solutions = resolved.get(0);
  if (solutions && solutions.length > 1 && solutions.every((solution) => solution.length === 1)) {
    return [{ ...line, quantity: counts[0], candidateIds: [...new Set(solutions.map((solution) => solution[0].catalogItemId).filter((id): id is string => id !== null))] }];
  }
  if (solutions?.length !== 1 || solutions[0].some(({ unit }) => unit === null || !['piece', 'packet', 'bottle'].includes(unit))) return [line];
  return solutions[0];
}

/** Extract editable product/quantity suggestions from one supplier or customer clause. */
export function parseShopEventItems(
  text: string,
  catalog: readonly CatalogItem[] = DEMO_CATALOG,
  { keepUnresolved = false, allowCountedItems = false } = {},
): ReceiptDraftLine[] {
  const normalized = normalizeDigits(text).slice(0, 3000)
    .replace(/^(?:.*?\bne\b\s+|.*?\s+ने\s+)/iu, '')
    .replace(/\b(?:mere se|mujhse)\b|(?:मेरे\s+से|मुझसे)/giu, '')
    .replace(/\b(?:kharide|kharida|kharidi|bought|purchased|liya|liye|received|bheje|bheja|bheji|diye|diya)\b|(?:खरीद[ाीे]?|भेज[ाीे]?|लिया|लिए|दिए|दिया)/giu, ' ')
    .replace(/\b(?:hain|hai|aaj|today|aur|and)\b|(?:हैं|है|आज|और)/giu, ',');
  return splitTranscript(normalized)
    .flatMap((clause, index) => {
      const line = parseStockLine(clause.trim(), `event-line-${index + 1}`, catalog);
      if (!allowCountedItems || line.quantity !== null || line.unit !== null) return [line];
      return countedCatalogLines(clause, line, catalog);
    })
    .filter((line) => keepUnresolved || line.quantity !== null || line.catalogItemId !== null || line.candidateIds.length > 0);
}

export function parseReceipt(text: string, catalog: readonly CatalogItem[] = DEMO_CATALOG): ReceiptDraft {
  const draft = emptyReceiptDraft();
  draft.lines = [];
  const totals: (number | null)[] = [];
  const payments: { amount: number | null; methods: PaymentMethod[] }[] = [];
  const source = text.slice(0, 3000);
  if (text.length > 3000) {
    return { ...emptyReceiptDraft(), issues: ['The delivery description is too long. Enter a shorter description.'] };
  }
  const dispatch = extractSupplierDispatch(source, catalog);
  if (dispatch && containsCustomerActivity(dispatch.contents)) {
    return {
      ...draft,
      supplier: dispatch.supplier,
      lines: [{ ...emptyReceiptLine('line-unclassified'), label: 'Unclassified activity' }],
      issues: [MIXED_EVENT_RECEIPT_ISSUE],
    };
  }
  const receiptText = dispatch ? cleanSupplierDispatchContents(dispatch.contents) : source;
  const clauses = splitTranscript(receiptText);
  if (dispatch) draft.supplier = dispatch.supplier;

  for (const [index, clause] of clauses.entries()) {
    const contents = clause.replace(/^(?:aaj|आज|today)\s+/iu, '');
    const deliveryParts = contents.match(/^(.*?)(?:\s+(?:aaye|aye|aaya|aayi|aai|arrived|received|आए|आये|आया|आई|आयी|आ गई|मिले|मिली))(?=\s|$)(.*)$/iu);
    let stock = deliveryParts ? deliveryParts[1].trim() : contents;
    const paymentText = normalize(deliveryParts ? deliveryParts[2] : contents);
    const total = paymentText.match(TOTAL_CLAUSE);
    const paid = paymentText.match(PAID_PREFIX) ?? paymentText.match(PAID_SUFFIX);
    const amount = paid?.[1] ? parseSpokenMoney(paid[1]) : null;
    const mentionedMethods = [...paymentText.matchAll(MENTIONED_PAYMENT_METHOD)].map((match) => PAYMENT_ALIASES[match[1]]);
    const negated = /(?:^| )(?:not|nahi|nahin|नहीं)(?: |$)/u.test(paymentText);
    const paymentClause = paid && (amount !== null || mentionedMethods.length || /\bpaid\b|भुगतान|रुपये|रुपए|\brupaye?\b|₹/u.test(paymentText));
    if (total) totals.push(parseSpokenMoney(total[1]));
    else if (paymentClause) payments.push({ amount: negated ? null : amount, methods: negated ? [] : mentionedMethods });

    if (!deliveryParts && (total || paymentClause)) continue;
    const supplier = stock.match(/^([^\d₹]{1,100}?)\s+(?:se|से)\s+(.+)$/iu);
    if (supplier && index === 0 && !draft.supplier) {
      draft.supplier = supplier[1].trim();
      stock = supplier[2];
    } else {
      const deliveredBy = stock.match(/^(.{1,100}?)\s+(?:delivered|supplied)\s+(.+)$/iu);
      if (deliveredBy && index === 0 && !draft.supplier) {
        draft.supplier = deliveredBy[1].trim();
        stock = deliveredBy[2];
      }
    }
    if (!draft.supplier) {
      const englishSupplier = stock.match(/^(.+?)\s+from\s+([^\d₹]{1,100})$/iu);
      if (englishSupplier && index === 0) {
        stock = englishSupplier[1];
        draft.supplier = englishSupplier[2].trim();
      }
    }
    if (stock) draft.lines.push(parseStockLine(stock, `line-${index + 1}`, catalog));
    if (deliveryParts && paymentText && !total && !paymentClause) {
      draft.lines.push({ ...emptyReceiptLine(`line-${index + 1}-extra`), label: deliveryParts[2].trim() });
    }
  }

  if (totals.length === 1) draft.receiptTotalPaise = totals[0];
  if (totals.length && draft.receiptTotalPaise === null) draft.issues.push(RECEIPT_TOTAL_ISSUE);
  if (payments.length === 1) draft.amountPaidPaise = payments[0].amount;
  if (payments.length && draft.amountPaidPaise === null) draft.issues.push(AMOUNT_PAID_ISSUE);
  const methods = new Set(payments.flatMap((payment) => payment.methods));
  if (methods.size === 1) draft.paymentMethod = [...methods][0];
  if (methods.size > 1) draft.issues.push(PAYMENT_METHOD_ISSUE);
  if (!draft.lines.length) draft.lines.push(emptyReceiptLine('line-1'));
  return draft;
}

export function validateReceiptDraft(draft: ReceiptDraft, catalog: readonly CatalogItem[] = DEMO_CATALOG): string[] {
  const problems: string[] = [];
  if (draft.lines.length === 0) problems.push('Add at least one item.');
  if (draft.supplier && draft.supplier.trim().length > 100) problems.push('Shorten the supplier name to 100 characters.');
  for (const [index, line] of draft.lines.entries()) {
    const description = `Item ${index + 1}`;
    const product = catalog.find((item) => item.id === line.catalogItemId);
    if (!product) problems.push(`${description}: choose an exact product and pack size.`);
    if (line.quantity === null || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      problems.push(`${description}: enter a whole quantity from 1 to ${MAX_QUANTITY.toLocaleString('en-IN')}.`);
    }
    if (!line.unit) problems.push(`${description}: select a stock unit.`);
    else if (product && line.unit !== product.unit) problems.push(`${description}: select ${product.unit} for this variant.`);
  }
  for (const [label, money] of [['Receipt total', draft.receiptTotalPaise], ['Amount paid', draft.amountPaidPaise]] as const) {
    if (money !== null && (!Number.isSafeInteger(money) || money < 0 || money > MAX_MONEY_PAISE)) {
      problems.push(`${label}: enter a valid amount.`);
    }
  }
  if (draft.receiptTotalPaise === null && draft.issues.includes(RECEIPT_TOTAL_ISSUE)) problems.push(RECEIPT_TOTAL_ISSUE);
  if (draft.amountPaidPaise === null && draft.issues.includes(AMOUNT_PAID_ISSUE)) problems.push(AMOUNT_PAID_ISSUE);
  if (draft.paymentMethod === null && draft.issues.includes(PAYMENT_METHOD_ISSUE)) problems.push(PAYMENT_METHOD_ISSUE);
  return problems;
}

export function toReceiptInput(draft: ReceiptDraft, catalog: readonly CatalogItem[] = DEMO_CATALOG): ReceiptInput | null {
  if (validateReceiptDraft(draft, catalog).length) return null;
  const lines: ReceiptInput['lines'] = [];
  for (const line of draft.lines) {
    const product = catalog.find((item) => item.id === line.catalogItemId);
    if (!product || line.quantity === null || !line.unit) return null;
    lines.push({
      catalogItemId: product.id, name: product.name, packSize: product.packSize,
      quantity: line.quantity, unit: line.unit,
    });
  }
  return {
    lines, supplier: draft.supplier?.trim() || null, receiptTotalPaise: draft.receiptTotalPaise,
    amountPaidPaise: draft.amountPaidPaise, paymentMethod: draft.paymentMethod,
  };
}
