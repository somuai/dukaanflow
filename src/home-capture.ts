import { estimateFollowUpDate, proposeCustomerCapture } from './customer-capture.ts';
import { MAX_QUANTITY, parseRupees, parseShopEventItems, type CatalogItem, type PaymentMethod, type StockUnit } from './domain.ts';
import { findCustomersMentioned, normalizeCustomerText } from './customer-identity.ts';
import type { Customer, HomeNoteBatchInput, NewCustomerInput, SupplierProfile } from './store.ts';

export type HomeCaptureRoute = 'customer' | 'supplier' | 'choose';
export const MAX_HOME_NOTE_LENGTH = 3000;
export type HomeNoteEventKind = Exclude<HomeCaptureRoute, 'choose'>;
export type HomeNoteCatalogLine = { catalogueItemId: string; name: string; packSize: string; unit: StockUnit; quantity: number };
export type HomeNoteEventCandidate =
  | { kind: 'supplier'; sourceText: string; supplierId?: string; supplierName?: string; lines?: HomeNoteCatalogLine[] }
  | { kind: 'customer'; sourceText: string; customerId?: string | null; customerName?: string; newCustomer?: NewCustomerInput; lines?: { catalogueItemId: string; quantity: number }[]; credit?: ResolvedHomeCreditCapture };
export type HomeNoteAnalysis = {
  transcript: string;
  events: HomeNoteEventCandidate[];
  unresolvedSegments: string[];
  clarification?: { kind: 'supplier' | 'customer' | 'catalog' | 'quantity'; label: string; ambiguous: boolean };
};
export type ResolvedRetailPurchase = { customerId: string; customerLabel: string; sourceText: string; lines: { catalogueItemId: string; quantity: number }[] };
export type ResolvedHomeCreditCapture = {
  customerId: string | null;
  customerName: string;
  kind: 'credit_sale' | 'repayment_received';
  amountPaise: number;
  paymentMethod: PaymentMethod | null;
  sourceText: string;
  promise: { amountPaise: number; dueDate: string; dateSource?: 'estimated' } | null;
};

export function toHomeNoteBatchInput(analysis: HomeNoteAnalysis, newCustomerId?: string): HomeNoteBatchInput | null {
  const suppliers = analysis.events.filter((event) => event.kind === 'supplier');
  const customers = analysis.events.filter((event) => event.kind === 'customer');
  if (!analysis.events.length || analysis.unresolvedSegments.length || suppliers.length > 1 || customers.length > 1) return null;
  const supplier = suppliers[0];
  const customer = customers[0];
  if (supplier && (!supplier.supplierName || !supplier.lines?.length)) return null;
  if (customer && ((!customer.newCustomer && customer.customerId === undefined) || (customer.newCustomer && !newCustomerId)
    || !customer.customerName || (!customer.lines?.length && !customer.credit))) return null;

  const credit = customer?.credit;
  const resolvedCustomerId = customer?.newCustomer ? newCustomerId : customer?.customerId;
  return {
    ...(customer?.newCustomer && newCustomerId ? { newCustomer: { ...customer.newCustomer, id: newCustomerId } } : {}),
    receipt: supplier?.supplierName && supplier.lines ? {
      supplier: supplier.supplierName, voiceNote: supplier.sourceText,
      receiptTotalPaise: null, amountPaidPaise: null, paymentMethod: null,
      lines: supplier.lines.map(({ catalogueItemId, ...line }) => ({ ...line, catalogItemId: catalogueItemId })),
    } : undefined,
    sale: customer && customer.customerId !== undefined && customer.customerName && customer.lines?.length ? {
      customerId: resolvedCustomerId ?? null, customerLabel: customer.customerName,
      paymentState: credit ? 'credit' : 'unknown',
      amountPaise: credit?.amountPaise ?? null, sourceText: customer.sourceText, lines: customer.lines,
    } : undefined,
    credit: credit ? {
      event: {
        customerId: resolvedCustomerId ?? credit.customerId ?? '', kind: credit.kind, amountPaise: credit.amountPaise,
        paymentMethod: credit.paymentMethod, note: null, sourceText: credit.sourceText,
      },
      ...(credit.promise ? { promise: { ...credit.promise, note: null } } : {}),
    } : undefined,
  };
}

export function resolveRetailPurchase(text: string, customers: Customer[], catalog: Parameters<typeof parseShopEventItems>[1]): ResolvedRetailPurchase | null {
  const matches = findNamedCustomer(text, customers);
  if (matches.length !== 1 || !CUSTOMER_PURCHASE.test(text)) return null;
  const lines = parseShopEventItems(text, catalog);
  if (!lines.length || lines.some((line) => !line.catalogItemId || !line.quantity || line.candidateIds.length > 1)) return null;
  return {
    customerId: matches[0].id,
    customerLabel: matches[0].name,
    sourceText: text.trim(),
    lines: lines.map(({ catalogItemId, quantity }) => ({ catalogueItemId: catalogItemId!, quantity: quantity! })),
  };
}

function findNamedCustomer(text: string, customers: Customer[]) {
  const normalized = text.normalize('NFKC').toLocaleLowerCase();
  return customers.filter((customer) => [customer.name, ...customer.aliases].some((alias) => {
    const key = alias.trim().normalize('NFKC').toLocaleLowerCase();
    return key.length > 1 && normalized.includes(key);
  }));
}

/**
 * Resolves a single, amount-explicit customer credit or repayment note for Home.
 * This deterministic fast path refuses product, supplier, multi-event, and
 * ambiguous notes; those need a richer extractor and must not be partially saved.
 */
function estimatedFollowUp(today: string, amountPaise: number) {
  return { amountPaise, dueDate: estimateFollowUpDate(today), dateSource: 'estimated' as const };
}

export function resolveHomeCreditCapture(
  text: string,
  customers: Customer[],
  suppliers: SupplierProfile[],
  catalog: CatalogItem[],
  today: string,
): ResolvedHomeCreditCapture | null {
  const sourceText = text.trim();
  if (!sourceText || sourceText.length > 2_000 || /\b(?:supplier|wholesaler|vendor|delivery|invoice)\b|सप्लायर|थोकवाला|डिलीवरी|बिल/iu.test(sourceText)) return null;
  if (namedSuppliers(sourceText, suppliers).length > 0) return null;

  const normalized = normalizeCustomerText(sourceText);
  const itemUnit = /(?:\b(?:packets?|packs?|pieces?|pcs|bottles?|cartons?|boxes?|kg|kilos?|quintals?)\b|पैकेट|पीस|बोतल|कार्टन|डिब्बा|किलो|क्विंटल)/iu;
  const itemAction = /(?:\b(?:bought|purchased|buy|sold|kharid(?:a|e|i)?|khareed(?:a|e|i)?)\b|खरीद[ाीे]?)/iu;
  const commonProduct = /(?:\b(?:milk|doodh|bread|butter|maggi|rice|chawal|atta|flour|oil|tel|biscuit|biscuits)\b|दूध|ब्रेड|मक्खन|मैगी|चावल|आटा|तेल|बिस्कुट)/iu;
  const catalogProduct = catalog.some((item) => [item.name, item.packSize, ...item.aliases]
    .some((alias) => alias.trim().length > 1 && includesShopAlias(normalized, alias)));
  if (itemUnit.test(normalized) || itemAction.test(normalized) || commonProduct.test(normalized) || catalogProduct) return null;

  const proposal = proposeCustomerCapture(sourceText, customers, today);
  if (!proposal.kind || proposal.amountPaise === null || proposal.customerMatches.length !== 1 || proposal.issues.length > 0) return null;
  if (proposal.kind === 'credit_sale'
    && (!/(?:\budhaar\b|\bon credit\b|\bcredit\s+(?:sale|liya)\b|\bborrow(?:ed|s)?\b|\btook\s+(?:a\s+)?loan\b|\bloan\s+(?:taken|liya)\b|उधार)/iu.test(normalized)
      || /\b(?:loaned|lent)\b/iu.test(normalized))) return null;
  if (proposal.promiseMentioned && proposal.kind !== 'credit_sale') return null;

  return {
    customerId: proposal.customerMatches[0].id,
    customerName: proposal.customerMatches[0].name,
    kind: proposal.kind,
    amountPaise: proposal.amountPaise,
    paymentMethod: proposal.paymentMethod,
    sourceText,
    promise: proposal.promiseDueDate
      ? { amountPaise: proposal.amountPaise, dueDate: proposal.promiseDueDate }
      : proposal.kind === 'credit_sale' ? estimatedFollowUp(today, proposal.amountPaise) : null,
  };
}

const SUPPLIER_ACTION = /(?:\b(?:deliver(?:ed|y)?|receive(?:d)?|sent|suppl(?:y|ied)|arriv(?:e|ed)|brought|got)\b|\b(?:bhej(?:a|i|e|o)?|aaya|aayi|aaye|mila|mili|pahuncha|bheje|diya|diye)\b|(?:भेज[ाीे]?|दिया|दिए|आया|आई|आए|आये|मिला|मिली|पहुँचा|पहुंचा|डिलीवरी|माल\s+आया|सामान\s+आया))/iu;
const CUSTOMER_EVENT = /(?:\budhaar\b|\bcredit\b|\bbaki\b|\bloan\b|\bborrow(?:ed|s)?\b|\bdebt\b|\bowes?\b|\bpaid\b|\brepaid\b|\bupi\b|\bde diye\b|\bde diya\b|उधार|बकाया|बाकी|भुगतान|दिए|दिया)/iu;
const CUSTOMER_CREDIT = /(?:\budhaar\b|\bcredit\b|\bbaki\b|\bloan\b|\bborrow(?:ed|s)?\b|\bdebt\b|उधार|बकाया|बाकी)/iu;
const CUSTOMER_PURCHASE = /(?:\b(?:bought|purchased|took|le liya|kharid(?:a|e|i)?)\b|खरीद[ाीे]?|ले लिया|लिया है)/iu;
const WALK_IN = /^(?:a customer\s+|(?:(?:ek|एक)\s+)?(?:customer|ग्राहक)\s+(?:ने|ne)\s+)/iu;
const NEW_SUPPLIER = /^(?:(?:new supplier|नए सप्लायर|नये सप्लायर|naye supplier)\s+)([\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]{0,79}?)\s+(?:ने|ne)\s+/iu;
const UNSUPPORTED_CUSTOMER_DETAILS = /(?:\b(?:udhaar|credit|baki|balance|loan|borrow(?:ed|s)?|debt|owe|owes|paid|repay(?:ment|ed)?|payment|upi|cash|promise(?:d)?|will\s+pay|pay\s+by|dega|denge|dunga|chuka(?:ega|enge)?|rupees?|rupaye|rs\.?|inr|withdrawn)\b|₹|उधार|बकाया|बाकी|भुगतान|वादा|देगा|देंगे|दे दूंगा|दे दूँगा|चुकाएगा|चुकाएँगे|नकद|यूपीआई|रुपये|रुपया|वापस|लौटाया)/iu;
const UNSUPPORTED_SUPPLIER_DETAILS = /(?:\b(?:invoice|bill|paid|payment|cash|upi|damaged?|broken|missing|short|extra|return(?:ed)?|credit\s+note|rupees?|rupaye|rs\.?|inr)\b|₹|बिल|भुगतान|नकद|खराब|टूटा|कम\s+आया|ज्यादा|वापस|लौटाया|क्रेडिट\s+नोट)/iu;

export function classifyHomeCapture(text: string, customers: Customer[], suppliers: SupplierProfile[], today: string): HomeCaptureRoute {
  const customerProposal = proposeCustomerCapture(text, customers, today);
  const newCustomerCredit = captureNewCustomerCredit(text, customers, suppliers, [], today);
  const customerIntent = (customerProposal.kind === 'credit_sale' && CUSTOMER_CREDIT.test(text))
    || (customerProposal.kind === 'repayment_received' && customerProposal.customerMatches.length > 0)
    || (customerProposal.customerMatches.length > 0 && (CUSTOMER_EVENT.test(text) || CUSTOMER_PURCHASE.test(text)))
    || (WALK_IN.test(text) && CUSTOMER_PURCHASE.test(text))
    || Boolean(newCustomerCredit)
    || GOODS_AGAINST_CREDIT.test(text);
  const normalized = text.normalize('NFKC').toLocaleLowerCase();
  const knownSupplier = namedSuppliers(normalized, suppliers).length > 0;
  const explicitSupplier = /\b(?:supplier|wholesaler|vendor|delivery|invoice)\b|\bfrom\b|सप्लायर|थोकवाला|डिलीवरी|बिल/iu.test(text);
  const productDelivery = /\d[\d,]*\s+(?:[\p{L}\p{M}]+\s+){0,3}(?:cartons?|boxes|packets?|bottles?|kg|quintals?|maggi|milk|doodh|atta|rice|chawal|तेल|दूध|चावल|आटा)\b/iu.test(text);
  const supplierIntent = SUPPLIER_ACTION.test(text) && (knownSupplier || explicitSupplier || productDelivery);

  if (customerProposal.issues.includes('multiple-events') && customerProposal.customerMatches.length > 0 && supplierIntent) return 'choose';
  if (customerIntent && supplierIntent) return 'choose';
  if (customerIntent) return 'customer';
  if (supplierIntent) return 'supplier';
  return 'choose';
}

function includesShopAlias(text: string, alias: string) {
  const haystack = normalizeCustomerText(text);
  const needle = normalizeCustomerText(alias);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}($|[^\\p{L}\\p{M}\\p{N}])`, 'u').test(haystack);
}

function namedSuppliers(text: string, suppliers: SupplierProfile[]) {
  return suppliers.filter((supplier) => [supplier.name, ...supplier.aliases].some((alias) => includesShopAlias(text, alias)));
}

function captureNewCustomerCredit(text: string, customers: Customer[], suppliers: SupplierProfile[], catalog: CatalogItem[], today: string) {
  const proposal = proposeCustomerCapture(text, customers, today);
  if (proposal.kind !== 'credit_sale' || proposal.customerMatches.length > 0 || proposal.amountPaise === null || proposal.issues.length > 0) return null;
  if (namedSuppliers(text, suppliers).length > 0) return null;
  const normalized = normalizeCustomerText(text);
  if (/(?:\b(?:supplier|wholesaler|vendor|delivery|invoice)\b|सप्लायर|थोकवाला|डिलीवरी|बिल)/iu.test(normalized)) return null;
  const hasProductUnit = /(?:\b(?:packets?|packs?|pieces?|pcs|bottles?|cartons?|boxes?|kg|kilos?|quintals?)\b|पैकेट|पीस|बोतल|कार्टन|डिब्बा|किलो|क्विंटल)/iu.test(normalized);
  const hasProductAction = /(?:\b(?:bought|purchased|buy|sold|kharid(?:a|e|i)?|khareed(?:a|e|i)?)\b|खरीद[ाीे]?)/iu.test(normalized);
  const commonProduct = /(?:\b(?:milk|doodh|bread|butter|maggi|rice|chawal|atta|flour|oil|tel|biscuit|biscuits)\b|दूध|ब्रेड|मक्खन|मैगी|चावल|आटा|तेल|बिस्कुट)/iu;
  const mentionsCatalog = catalog.some((item) => [item.name, item.packSize, ...item.aliases]
    .some((alias) => alias.trim().length > 1 && includesShopAlias(normalized, alias)));
  if (hasProductUnit || hasProductAction || commonProduct.test(normalized) || mentionsCatalog) return null;

  const sourceText = text.trim();
  const match = sourceText.match(/^([\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}?)\s+(?:ने|ne)(?:\s|$)/iu)
    ?? sourceText.match(/^([\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}?)\s+(?:borrowed|owes|took\s+(?:a\s+)?loan)\b/iu);
  if (!match) return null;
  const spokenName = match[1].trim().replace(/^(?:customer|ग्राहक)\s+/iu, '').trim();
  const name = spokenName.replace(/\s+(?:ji|जी)$/iu, '').trim();
  if (name.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}$/u.test(name)) return null;
  if (findCustomersMentioned(name, customers).length > 0 || namedSuppliers(name, suppliers).length > 0) return null;
  if (proposal.promiseMentioned && !proposal.promiseDueDate) return null;
  const credit: ResolvedHomeCreditCapture = {
    customerId: null, customerName: name, kind: 'credit_sale', amountPaise: proposal.amountPaise,
    paymentMethod: null, sourceText,
    promise: proposal.promiseDueDate
      ? { amountPaise: proposal.amountPaise, dueDate: proposal.promiseDueDate }
      : estimatedFollowUp(today, proposal.amountPaise),
  };
  return { customer: { name, aliases: spokenName === name ? [] : [spokenName] }, credit };
}

function packKey(value: string) {
  return normalizeCustomerText(value).replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function containedPack(item: CatalogItem, catalog: CatalogItem[], quantity: number) {
  if (item.unit !== 'box' || !item.packageContent) return { item, quantity };
  const content = item.packageContent.match(/(\d+)\s*[x×]\s*(.+)$/iu);
  if (!content) return { item, quantity };
  const count = Number(content[1]);
  if (!Number.isSafeInteger(count) || count < 1 || quantity > Math.floor(MAX_QUANTITY / count)) return null;
  const nameKey = normalizeCustomerText(item.name);
  const targetPackKey = packKey(content[2]);
  const targets = catalog.filter((candidate) => candidate.id !== item.id
    && candidate.unit !== 'box'
    && normalizeCustomerText(candidate.name) === nameKey
    && packKey(candidate.packSize) === targetPackKey);
  if (!targets.length) return { item, quantity };
  if (targets.length !== 1) return null;
  return { item: targets[0], quantity: quantity * count };
}

function resolveCatalogLines(
  text: string,
  catalog: CatalogItem[],
  allowCountedItems = false,
  onCatalogIssue?: (label: string, ambiguous: boolean, missingQuantity?: boolean) => void,
) {
  const cleaned = text
    .replace(/^.*?\s+(?:ने|ne)\s+/iu, '')
    .replace(/\b(?:mere ko|mujhe)\b|(?:मेरे\s+को|मुझे)/giu, ' ')
    .replace(/\b(?:bhej\p{L}*|send|sent|deliver(?:ed|y)?|receive(?:d)?|suppl(?:y|ied))\b|(?:भेज[ाीे]?|दिया|दिए)/giu, ' ')
    .replace(/\b(?:aaj|today|hain|hai)\b|(?:आज|हैं|है)/giu, ' ')
    .replace(/\s+/gu, ' ').trim();
  const expanded = expandSharedQuantity(cleaned, catalog);
  const parsed = parseShopEventItems(expanded, catalog, { keepUnresolved: true, allowCountedItems });
  if (!parsed.length) return null;
  const cartonWord = /(?:^|[^\p{L}\p{M}\p{N}])(?:cartons?|ctn|कार्टन)(?![\p{L}\p{M}\p{N}])/iu;
  const resolved: HomeNoteCatalogLine[] = [];
  for (const originalLine of parsed) {
    const spokenAsCarton = cartonWord.test(originalLine.label);
    const cartonVariants = spokenAsCarton ? catalog.filter((item) => item.unit === 'box'
      && cartonWord.test([item.name, item.packSize, item.packageContent ?? '', ...item.aliases].join(' '))) : catalog;
    const line = spokenAsCarton
      ? parseShopEventItems(originalLine.label, cartonVariants)[0]
      : originalLine;
    if (!line) return null;
    if (line.quantity === null || line.quantity < 1 || !Number.isSafeInteger(line.quantity)) {
      if (line.candidateIds.length > 1) onCatalogIssue?.(originalLine.label, true);
      else if (line.quantity === null && line.candidateIds.length === 1) onCatalogIssue?.(originalLine.label, false, true);
      return null;
    }
    const candidates = cartonVariants.filter((item) => line.candidateIds.includes(item.id) || item.id === line.catalogItemId);
    const unitMatches = line.unit ? candidates.filter((item) => item.unit === line.unit) : candidates;
    if (unitMatches.length !== 1) {
      onCatalogIssue?.(originalLine.label, unitMatches.length > 1);
      return null;
    }
    const [matchedItem] = unitMatches;
    const normalized = spokenAsCarton ? containedPack(matchedItem, catalog, line.quantity) : { item: matchedItem, quantity: line.quantity };
    if (!normalized) return null;
    const { item, quantity } = normalized;
    const existing = resolved.find((entry) => entry.catalogueItemId === item.id);
    if (existing) {
      if (existing.quantity + quantity > MAX_QUANTITY) return null;
      existing.quantity += quantity;
    } else {
      resolved.push({ catalogueItemId: item.id, name: item.name, packSize: item.packSize, unit: item.unit, quantity });
    }
  }
  return resolved;
}

function expandSharedQuantity(text: string, catalog: CatalogItem[]) {
  const match = text.match(/(^|[,،]\s*)(\d{1,6})\s+(cartons?|ctn|boxes|box|कार्टन|डिब्बे?)\s+(.+?)\s+(?:aur|और|and)\s+([^,،]+)$/iu);
  if (!match) return text;
  const [, prefix, quantity, unit, firstProduct, secondProduct] = match;
  const first = parseShopEventItems(`${quantity} ${unit} ${firstProduct}`, catalog, { keepUnresolved: true })[0];
  const second = parseShopEventItems(`${quantity} ${unit} ${secondProduct}`, catalog, { keepUnresolved: true })[0];
  const isResolvedCarton = (line: typeof first) => Boolean(line?.quantity === Number(quantity)
    && line.catalogItemId && line.unit === 'box' && line.candidateIds.length === 1);
  if (!isResolvedCarton(first) || !isResolvedCarton(second)) return text;
  return `${prefix}${quantity} ${unit} ${firstProduct}, ${quantity} ${unit} ${secondProduct}`;
}

const INTRODUCED_DELIVERY = /^([^।.;\n]+?)\s+(?:मेरे|मेरा|mere|mera)\s+(?:supplier|सप्लायर)\s+(?:है(?:ं)?|hain?)(?:\s+(?:माल\s+का|maal\s+ka))?(?:\s*[।.,]\s*|\s+)(?:(?:आज|aaj)\s+)?(?:उसने|usne)\s+(?:(?:मेरे\s+को|मुझे|mere\s+ko|mujhe)\s+)?([^।.;\n]+)(?:[।.]|$)/iu;

const GOODS_AGAINST_CREDIT = /^(.+?)\s+(?:ने|ne)\s+(?:(?:आज|aaj)\s+)?(?:मेरे\s+से|मुझसे|mere\s+se|mujhse)\s+(.+?)\s+(?:(?:उधार|udhaar)\s+)?(?:(?:ले|le)\s+)?(?:लिया|liya)(?:\s+(?:है|hai))?\s+(?:और|aur)\s+(?:उसके\s+बदले|uske\s+badle)\s+(.+?)\s+(?:(?:ले|le)\s+)?(?:लिया|liya)(?:\s+(?:है|hai))?(?:\s*[,।.]\s*(.+?))?[।.]?$/iu;
const RUPEE_PREFIX = /^(?:₹|rs\.?\s|inr\s)/iu;
const RUPEE_SUFFIX = /\s+(?:rupees?|rupaye|rupya|रुपये|रुपए|रुपया)$/iu;

function resolveGoodsAgainstCredit(
  text: string,
  customers: Customer[],
  catalog: CatalogItem[],
  today: string,
  onCatalogIssue: (label: string, ambiguous: boolean, missingQuantity?: boolean) => void,
  onCustomerIssue: (label: string, ambiguous: boolean) => void,
) {
  const match = text.match(GOODS_AGAINST_CREDIT);
  if (!match) return null;
  const matches = findCustomersMentioned(match[1], customers);
  if (matches.length > 1) {
    onCustomerIssue(match[1], matches.length > 1);
    return null;
  }
  const spokenAmount = match[2];
  const amountPaise = RUPEE_PREFIX.test(spokenAmount) || RUPEE_SUFFIX.test(spokenAmount)
    ? parseRupees(spokenAmount.replace(RUPEE_SUFFIX, '')) : null;
  if (catalog.some((item) => /\d/u.test(item.name) && includesShopAlias(match[3], item.name))) return null;
  const lines = resolveCatalogLines(match[3], catalog, true, onCatalogIssue);
  if (amountPaise === null || amountPaise <= 0 || !lines?.length) return null;
  const [customer] = matches;
  let newCustomer: NewCustomerInput | undefined;
  if (!customer) {
    const spokenName = match[1].trim().replace(/\s+(?:ji|जी)$/iu, '').trim();
    if (spokenName.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,79}$/u.test(spokenName)) return null;
    newCustomer = { name: spokenName, aliases: match[1].trim() === spokenName ? [] : [match[1].trim()] };
  }
  let promise: ResolvedHomeCreditCapture['promise'] = estimatedFollowUp(today, amountPaise);
  if (match[4]) {
    const promiseText = match[4].replace(/[।.]$/u, '').trim();
    const clearPromise = /^(?:आज|कल|रविवार|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d+\s*(?:दिन|din|days?))\s*(?:तक|tak|में|mein|by)?\s*(?:वो\s+|वह\s+|wo\s+)?(?:चुका\s+|chuka\s+)?(?:देगा|देंगे|चुकाएगा|dega|denge|will\s+(?:re)?pay)(?:\s+(?:वो|वह|wo))?$/iu;
    const statedDayOnly = /^(?:आज|कल|रविवार|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*(?:तक|tak)$/iu;
    if (!clearPromise.test(promiseText) && !statedDayOnly.test(promiseText)) return null;
    const proposal = proposeCustomerCapture(`${match[1]} ने ${spokenAmount} उधार लिया है, ${promiseText}`, customers, today);
    if (!proposal.promiseMentioned || !proposal.promiseDueDate || proposal.issues.length) return null;
    promise = { amountPaise, dueDate: proposal.promiseDueDate };
  }
  const credit: ResolvedHomeCreditCapture = {
    customerId: customer?.id ?? null, customerName: customer?.name ?? newCustomer!.name, kind: 'credit_sale',
    amountPaise, paymentMethod: null, sourceText: text, promise,
  };
  return { credit, lines, ...(newCustomer ? { newCustomer } : {}) };
}

/** Split a voice note at shop-known people and resolve clear events against this shop's catalog. */
export function analyzeHomeNote(
  text: string,
  customers: Customer[],
  suppliers: SupplierProfile[],
  today: string,
  catalog?: CatalogItem[],
): HomeNoteAnalysis {
  const transcript = text.trim();
  if (transcript.length > MAX_HOME_NOTE_LENGTH) {
    return { transcript, events: [], unresolvedSegments: [transcript] };
  }
  const introduction = transcript.match(INTRODUCED_DELIVERY);
  const explicitSegments = [
    ...(introduction ? [introduction[0].trim()] : []),
    ...(introduction ? transcript.slice(introduction[0].length) : transcript).split(/[;\n]+/u).map((part) => part.trim()).filter(Boolean),
  ];
  // Wispr often omits punctuation. Split at a shop-known person's next event only
  // when the current clause already contains a strong delivery/customer cue.
  const aliases = [
    ...suppliers.flatMap((person) => [person.name, ...person.aliases].map((alias) => ({ alias, kind: 'supplier' as const, ownerId: person.id }))),
    ...customers.flatMap((person) => [person.name, ...person.aliases].map((alias) => ({ alias, kind: 'customer' as const, ownerId: person.id }))),
  ].filter((entry) => entry.alias.trim().length > 1).sort((a, b) => b.alias.length - a.alias.length);
  const segments = explicitSegments.flatMap((part) => {
    const occurrences = aliases.flatMap((entry) => spokenAliasVariants(entry.alias)
      .flatMap((alias) => findPhraseOccurrences(part, alias).map((span) => ({ ...entry, ...span }))));
    const first = occurrences.sort((a, b) => a.start - b.start || b.end - a.end)[0];
    if (!first) return [part];
    const firstOwners = new Set(occurrences
      .filter((entry) => entry.start === first.start && entry.end === first.end)
      .map((entry) => `${entry.kind}:${entry.ownerId}`));
    if (firstOwners.size > 1) return [part];
    const next = occurrences
      .filter((entry) => entry.start >= first.end && entry.kind !== first.kind)
      .sort((a, b) => a.start - b.start || b.end - a.end)[0];
    if (!next) return [part];
    const nextOwners = new Set(occurrences
      .filter((entry) => entry.start === next.start && entry.end === next.end)
      .map((entry) => `${entry.kind}:${entry.ownerId}`));
    if (nextOwners.size > 1) return [part];
    const firstClause = part.slice(0, next.start).trim().replace(/\s+(?:and|aur|और|फिर)\s*$/iu, '');
    if (classifyHomeCapture(firstClause, customers, suppliers, today) !== first.kind) return [part];
    return [firstClause, part.slice(next.start).trim()];
  });
  const classified = segments.map((sourceText) => ({ sourceText, kind: classifyHomeCapture(sourceText, customers, suppliers, today) }));
  const customerSegments = classified.filter((segment) => segment.kind === 'customer');
  const supplierSegments = classified.filter((segment) => segment.kind === 'supplier');
  const unresolvedSegments = classified.filter((segment) => segment.kind === 'choose').map((segment) => segment.sourceText);

  // Keep the existing transcript-only analyzer behavior for callers that do not
  // provide the shop catalog. The Home submit path always supplies it.
  if (!catalog) {
    if (!customerSegments.length || !supplierSegments.length) {
      return { transcript, events: [], unresolvedSegments: segments };
    }
    return {
      transcript,
      events: classified.flatMap((segment) => segment.kind === 'customer' || segment.kind === 'supplier'
        ? [{ kind: segment.kind, sourceText: segment.sourceText }]
        : []),
      unresolvedSegments,
    };
  }

  const events: HomeNoteEventCandidate[] = [];
  const unresolved = [...unresolvedSegments];
  let clarification: HomeNoteAnalysis['clarification'];
  const catalogIssue = (label: string, ambiguous: boolean, missingQuantity = false) => { clarification ??= { kind: missingQuantity ? 'quantity' : 'catalog', label, ambiguous }; };
  for (const segment of classified) {
    if (segment.kind === 'choose') continue;
    if (segment.kind === 'supplier') {
      const matches = namedSuppliers(segment.sourceText, suppliers);
      const introduced = segment.sourceText.match(INTRODUCED_DELIVERY);
      const newSupplier = segment.sourceText.match(NEW_SUPPLIER)?.[1];
      if (matches.length !== 1 && !(matches.length === 0 && newSupplier)) {
        if (introduced) clarification ??= { kind: 'supplier', label: introduced[1], ambiguous: matches.length > 1 };
        unresolved.push(segment.sourceText);
        continue;
      }
      const lines = resolveCatalogLines(introduced?.[2] ?? segment.sourceText, catalog, false, catalogIssue);
      const [supplier] = matches;
      events.push({ kind: 'supplier', sourceText: segment.sourceText, supplierId: supplier?.id, supplierName: supplier?.name ?? newSupplier, ...(lines?.length ? { lines } : {}) });
      if (!lines?.length || UNSUPPORTED_SUPPLIER_DETAILS.test(segment.sourceText)) unresolved.push(segment.sourceText);
      continue;
    }

    const matches = findCustomersMentioned(segment.sourceText, customers);
    const walkIn = WALK_IN.test(segment.sourceText);
    if (!matches.length) {
      const proposedNewCustomer = captureNewCustomerCredit(segment.sourceText, customers, suppliers, catalog, today);
      if (proposedNewCustomer) {
        events.push({ kind: 'customer', sourceText: segment.sourceText, customerId: null,
          customerName: proposedNewCustomer.customer.name, newCustomer: proposedNewCustomer.customer,
          credit: proposedNewCustomer.credit });
        continue;
      }
    }
    if (walkIn && !matches.length && !UNSUPPORTED_CUSTOMER_DETAILS.test(segment.sourceText)) {
      const lines = resolveCatalogLines(segment.sourceText.replace(WALK_IN, ''), catalog, true, catalogIssue);
      if (lines?.length) {
        events.push({ kind: 'customer', customerId: null, customerName: 'Walk-in customer', sourceText: segment.sourceText,
          lines: lines.map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })) });
        continue;
      }
    }
    const linkedPurchase = resolveGoodsAgainstCredit(segment.sourceText, customers, catalog, today, catalogIssue, (label, ambiguous) => {
      clarification ??= { kind: 'customer', label, ambiguous };
    });
    if (!matches.length && linkedPurchase?.newCustomer) {
      events.push({ kind: 'customer', customerId: null, customerName: linkedPurchase.newCustomer.name,
        newCustomer: linkedPurchase.newCustomer, sourceText: segment.sourceText,
        lines: linkedPurchase.lines.map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })),
        credit: linkedPurchase.credit });
      continue;
    }
    const lines = linkedPurchase?.lines ?? resolveCatalogLines(segment.sourceText, catalog, true, catalogIssue);
    const credit = linkedPurchase?.credit ?? resolveHomeCreditCapture(segment.sourceText, customers, suppliers, catalog, today);
    if (matches.length !== 1) {
      unresolved.push(segment.sourceText);
      continue;
    }
    const [customer] = matches;
    const event: HomeNoteEventCandidate = {
      kind: 'customer', customerId: customer.id, customerName: customer.name, sourceText: segment.sourceText,
      ...((linkedPurchase || CUSTOMER_PURCHASE.test(segment.sourceText)) && lines?.length
        ? { lines: lines.map(({ catalogueItemId, quantity }) => ({ catalogueItemId, quantity })) }
        : {}),
      ...(credit ? { credit } : {}),
    };
    events.push(event);
    if ((!event.lines?.length && !event.credit) || UNSUPPORTED_CUSTOMER_DETAILS.test(segment.sourceText) && !event.credit) unresolved.push(segment.sourceText);
  }

  return { transcript, events, unresolvedSegments: [...new Set(unresolved)], ...(clarification ? { clarification } : {}) };
}

function spokenAliasVariants(alias: string) {
  const variants = new Set([alias.trim()]);
  variants.add(alias.replace(/(^|[^\p{L}\p{M}\p{N}])ji(?=$|[^\p{L}\p{M}\p{N}])/giu, '$1जी').trim());
  variants.add(alias.replace(/(^|[^\p{L}\p{M}\p{N}])जी(?=$|[^\p{L}\p{M}\p{N}])/gu, '$1ji').trim());
  return [...variants].filter(Boolean);
}

function findPhraseOccurrences(text: string, phrase: string) {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
  if (!escaped) return [];
  const pattern = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'giu');
  return [...text.matchAll(pattern)].map((match) => {
    const start = match.index! + match[1].length;
    return { start, end: start + match[2].length };
  });
}
