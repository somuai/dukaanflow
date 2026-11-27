import { parseRupees, type PaymentMethod } from './domain.ts';
import { findCustomersMentioned, normalizeCustomerText } from './customer-identity.ts';
import type { Customer } from './store.ts';

export type CustomerCaptureKind = 'credit_sale' | 'repayment_received';
export type CustomerCaptureIssue = 'multiple-events' | 'amount-unclear' | 'payment-method-unclear' | 'date-unclear';

export type CustomerCaptureProposal = {
  kind: CustomerCaptureKind | null;
  customerMatches: Customer[];
  amountPaise: number | null;
  paymentMethod: PaymentMethod | null;
  promiseMentioned: boolean;
  promiseDueDate: string | null;
  issues: CustomerCaptureIssue[];
};

const AMOUNT_PATTERNS = [
  /(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d{1,2})?)/giu,
  /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees?|rupaye|rupya|रुपये|रुपया|रु|upi|cash|नकद|यूपीआई)(?=$|[^\p{L}\p{N}])/giu,
  /(\d[\d,]*(?:\.\d{1,2})?)\s+(?:ka|ki|ke)\s+(?:samaan|maal|udhaar|baki|credit)(?=$|[^\p{L}\p{N}])/giu,
];

function parseAmountCandidates(text: string) {
  const candidates = new Set<number>();
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const amount = parseRupees(match[1]);
      if (amount !== null && amount > 0) candidates.add(amount);
    }
  }
  return [...candidates];
}

function has(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function parsePaymentMethod(text: string): { value: PaymentMethod | null; ambiguous: boolean } {
  const methods: PaymentMethod[] = [];
  if (/(?:\bupi\b|यूपीआई|यू पी आई)/u.test(text)) methods.push('upi');
  if (/(?:\bcash\b|\bnakad\b|नकद|कैश)/u.test(text)) methods.push('cash');
  if (/(?:\bcard\b|कार्ड)/u.test(text)) methods.push('card');
  if (/(?:\bbank transfer\b|बैंक ट्रांसफर)/u.test(text)) methods.push('bank_transfer');
  const unique = [...new Set(methods)];
  return { value: unique.length === 1 ? unique[0] : null, ambiguous: unique.length > 1 };
}

function addDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function estimateFollowUpDate(today: string) {
  return addDays(today, 7);
}

const DAY_COUNTS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5,
  chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5,
  छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
};

function parseRelativeDayCount(text: string) {
  const count = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|chaar|paanch|chhe|saat|aath|nau|das|एक|दो|तीन|चार|पांच|पाँच|छह|छः|सात|आठ|नौ|दस)';
  const matches = [...text.matchAll(new RegExp(`(?:\\bin\\s+)?${count}\\s*(?:days?|दिन(?:ों)?|din)\\s*(?:में|me\\b|mein\\b|बाद|baad\\b|from now)?`, 'giu'))];
  const days = matches.map((match) => /^\d+$/u.test(match[1]) ? Number(match[1]) : DAY_COUNTS[match[1]]);
  return { days, mentioned: matches.length > 0 || /(?:\bin\s+\d+\s+days?\b|\d+\s*(?:दिन(?:ों)?|din)\s*(?:में|me\b|mein\b))/u.test(text) };
}

const WEEKDAYS: ReadonlyArray<readonly [number, readonly string[]]> = [
  [0, ['sunday', 'raviwar', 'रविवार']],
  [1, ['monday', 'somvar', 'somvaar', 'सोमवार']],
  [2, ['tuesday', 'mangalwar', 'mangalvaar', 'मंगलवार']],
  [3, ['wednesday', 'budhwar', 'budhvaar', 'बुधवार']],
  [4, ['thursday', 'guruwar', 'guruvaar', 'बृहस्पतिवार', 'गुरुवार']],
  [5, ['friday', 'shukrawar', 'shukravaar', 'शुक्रवार']],
  [6, ['saturday', 'shanivar', 'shanivaar', 'शनिवार']],
];

function parsePromiseDate(text: string, today: string): { value: string | null; unclear: boolean } {
  const relative = parseRelativeDayCount(text);
  if (relative.mentioned) {
    if (relative.days.length !== 1 || !Number.isInteger(relative.days[0]) || relative.days[0] < 1 || relative.days[0] > 365) {
      return { value: null, unclear: true };
    }
    return { value: addDays(today, relative.days[0]), unclear: false };
  }
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/gu)].map((match) => match[1]);
  if (isoDates.length === 1) {
    const parsed = new Date(`${isoDates[0]}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoDates[0]) return { value: isoDates[0], unclear: false };
    return { value: null, unclear: true };
  }
  if (isoDates.length > 1) return { value: null, unclear: true };

  const weekdays = WEEKDAYS.flatMap(([weekday, words]) => words.filter((word) => text.includes(word)).map(() => weekday));
  const uniqueWeekdays = [...new Set(weekdays)];
  if (uniqueWeekdays.length === 1) {
    const current = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const delta = (uniqueWeekdays[0] - current + 7) % 7;
    return { value: addDays(today, delta), unclear: false };
  }
  if (/\btomorrow\b/u.test(text)) return { value: addDays(today, 1), unclear: false };
  if (/(?:\bkal\b|कल)/u.test(text)) return { value: addDays(today, 1), unclear: false };
  if (/(?:\btoday\b|\baaj\b|आज)/u.test(text)) return { value: today, unclear: false };
  return { value: null, unclear: /(next week|this week|soon|अगले हफ्ते|अगले सप्ताह|जल्दी)/u.test(text) };
}

export function proposeCustomerCapture(text: string, customers: Customer[], today: string): CustomerCaptureProposal {
  const normalized = normalizeCustomerText(text);
  const creditMentioned = /(?:\budhaar\b|\bcredit\b|\bon credit\b|\bbaki\b|\bloan\b|\bborrow(?:ed|s)?\b|\bdebt\b|उधार|बकाया|बाकी)/u.test(normalized);
  const repaymentMentioned = /(?:\bpaid\b|\brepaid\b|\bpayment received\b|\bpay back\b|\b(?:ne|ने)\s+\d[^\s]*\s+(?:upi|cash|नकद|यूपीआई)\s+(?:de|diye|diya|दिए|दिया)\b|\b(?:de diye|de diya)\b|(?:भुगतान मिला|जमा कर दिया|पैसे दिए))/u.test(normalized);
  const promiseMentioned = /(?:\bpromise(?:d)?\b|\bwill pay\b|\bwill repay\b|\bpay (?:it )?back\b|\brepay\b|\bsettle(?: up)?\b|\bpay by\b|\bdenge\b|\bdega\b|\bde dunga\b|\bchuka(?:ega|enge)?\b|वादा|देगा|देंगे|दे दूंगा|दे दूँगा|चुकाएगा|चुकाएँगे)/u.test(normalized);
  const statedDueDay = /(?:\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|आज|कल)\s*(?:तक|\btak\b|\bby\b)/u.test(normalized);
  const issues: CustomerCaptureIssue[] = [];
  const customerKind: CustomerCaptureKind | null = creditMentioned && repaymentMentioned
    ? (issues.push('multiple-events'), null)
    : creditMentioned ? 'credit_sale'
      : repaymentMentioned ? 'repayment_received' : null;

  const supplierEventMentioned = /(?:\bsupplier\b|\bwholesaler\b|\bdeliver(?:ed|y)?\b|\bsent\b|\breceived\s+from\b|\bbhej(?:a|i|e)?\b|\bmaal\s+aaya\b|डिलिवरी|भेज[ाीे]?|माल\s+आया|सामान\s+आया)/u.test(normalized);
  const mixedEvents = customerKind !== null && supplierEventMentioned;
  if (mixedEvents) issues.push('multiple-events');
  const kind = mixedEvents ? null : customerKind;

  const amounts = parseAmountCandidates(text.normalize('NFKC').toLocaleLowerCase());
  const amountPaise = kind !== null && amounts.length === 1 ? amounts[0] : null;
  if (amounts.length > 1) issues.push('amount-unclear');
  const payment = parsePaymentMethod(normalized);
  if (payment.ambiguous) issues.push('payment-method-unclear');

  const parsedDate = promiseMentioned || statedDueDay ? parsePromiseDate(normalized, today) : { value: null, unclear: false };
  const date = mixedEvents && promiseMentioned && parsedDate.value
    ? { value: null, unclear: true }
    : parsedDate;
  if (date.unclear) issues.push('date-unclear');

  return {
    kind,
    customerMatches: findCustomersMentioned(normalized, customers),
    amountPaise,
    paymentMethod: payment.value,
    promiseMentioned: promiseMentioned || statedDueDay,
    promiseDueDate: date.value,
    issues,
  };
}
