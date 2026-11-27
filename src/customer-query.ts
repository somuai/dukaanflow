import type { Customer, CustomerCreditEvent, PromiseToPay } from './store.ts';
import { findCustomersMentioned, normalizeCustomerText } from './customer-identity.ts';

export type NamedPromise = PromiseToPay & { customerName: string };
export type CustomerQueryIntent = 'balance' | 'history';

export type CustomerQueryPlan =
  | { kind: 'open-balances' }
  | { kind: 'due-promises' }
  | { kind: 'customer-balance'; customerId: string }
  | { kind: 'customer-history'; customerId: string }
  | { kind: 'ambiguous'; intent: CustomerQueryIntent; matches: Customer[] }
  | { kind: 'not-found' }
  | { kind: 'unsupported' };

export type CustomerQueryContext = {
  customers: Customer[];
  promises: NamedPromise[];
  events: CustomerCreditEvent[];
};

const queryFillerWords = new Set([
  'who', 'has', 'have', 'not', 'paid', 'owes', 'owe', 'what', 'how', 'much', 'is', 'are',
  'remaining', 'remain', 'outstanding', 'due', 'balance', 'account', 'credit', 'history',
  'transaction', 'transactions', 'entries', 'show', 'tell', 'me', 'last', 'time', 'to', 'for',
  'ka', 'ki', 'ke', 'ko', 'ne', 'mein', 'me', 'kya', 'kitna', 'kitne', 'hai', 'hain',
  'baaki', 'baki', 'udhaar', 'hisaab', 'kiska', 'kisne', 'batao', 'dikhao', 'kab',
]);

function findCustomersByUniqueNamePart(question: string, customers: Customer[]) {
  const subject = new Set(normalizeCustomerText(question).split(' ')
    .filter((word) => word.length >= 3 && !queryFillerWords.has(word)));
  if (!subject.size) return [];
  return customers.filter((customer) => [customer.name, ...customer.aliases].some((label) =>
    normalizeCustomerText(label).split(' ').some((word) => word.length >= 3 && subject.has(word))));
}

export type CustomerQueryAnswer =
  | { kind: 'open-balances'; customers: Customer[]; totalPaise: number; customerCredits: Customer[] }
  | { kind: 'due-promises'; promises: NamedPromise[] }
  | { kind: 'balance'; customer: Customer; balancePaise: number; events: CustomerCreditEvent[] }
  | { kind: 'history'; customer: Customer; events: CustomerCreditEvent[]; hasMore: boolean; itemDetailsAreStructured: boolean }
  | { kind: 'ambiguous'; intent: CustomerQueryIntent; matches: Customer[] }
  | { kind: 'not-found' }
  | { kind: 'unsupported' };

function asksForOpenBalances(question: string) {
  return /\b(who owes|who has not paid|who hasn t paid|open balances?|outstanding balances?|customer dues?)\b/u.test(question)
    || /(?:किसका|किसका|किस किस का|किन ग्राहकों का).*(?:उधार|बाकी|बकाया)|(?:कौन कौन|कौन).*(?:बाकी|उधार|बकाया)/u.test(question);
}

function asksForPromises(question: string) {
  return /\b(promises?|promised|follow up|follow-up|due today|payment due today)\b/u.test(question)
    || /(?:वादा|वादे|देने की बात|पेमेंट का वादा|भुगतान का वादा)/u.test(question);
}

function asksForHistory(question: string) {
  return /\b(history|transactions?|entries|last time|what happened|what did|bought|purchase history)\b/u.test(question)
    || /(?:इतिहास|लेनदेन|लेन-देन|क्या हुआ|क्या लिया|खरीदा|कब दिया|kya (?:liya|kharida)|kya .*liya)/u.test(question);
}

function asksForBalance(question: string) {
  return /\b(balance|owe|owed|remaining|remain|outstanding|due|how much|kitna|kitne|baaki|baki|udhaar|hisaab)\b/u.test(question)
    || /(?:कितना|कितने|बाकी|बकाया|उधार|हिसाब|देना है)/u.test(question);
}

export function planCustomerQuery(question: string, customers: Customer[]): CustomerQueryPlan {
  const key = normalizeCustomerText(question);
  if (!key) return { kind: 'unsupported' };
  if (asksForOpenBalances(key)) return { kind: 'open-balances' };
  const exactMatches = findCustomersMentioned(key, customers);
  const mentioned = exactMatches.length ? exactMatches : findCustomersByUniqueNamePart(key, customers);
  if (asksForPromises(key) && !mentioned.length) return { kind: 'due-promises' };

  const intent: CustomerQueryIntent | null = asksForHistory(key) ? 'history' : asksForBalance(key) ? 'balance' : null;
  if (!intent) return { kind: 'unsupported' };

  const matches = mentioned;
  if (!matches.length) return { kind: 'not-found' };
  if (matches.length > 1) return { kind: 'ambiguous', intent, matches };
  const customer = matches[0];
  return intent === 'balance'
    ? { kind: 'customer-balance', customerId: customer.id }
    : { kind: 'customer-history', customerId: customer.id };
}

export function answerCustomerQuery(plan: CustomerQueryPlan, context: CustomerQueryContext, today: string): CustomerQueryAnswer {
  switch (plan.kind) {
    case 'open-balances': {
      const open = context.customers.filter((customer) => customer.balancePaise > 0);
      return {
        kind: 'open-balances',
        customers: open,
        totalPaise: open.reduce((sum, customer) => sum + customer.balancePaise, 0),
        customerCredits: context.customers.filter((customer) => customer.balancePaise < 0),
      };
    }
    case 'due-promises':
      return { kind: 'due-promises', promises: dueCustomerPromises(context.promises, context.customers, today) };
    case 'customer-balance': {
      const customer = context.customers.find((entry) => entry.id === plan.customerId);
      if (!customer) return { kind: 'not-found' };
      return {
        kind: 'balance',
        customer,
        balancePaise: customer.balancePaise,
        events: context.events.filter((event) => event.customerId === customer.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3),
      };
    }
    case 'customer-history': {
      const customer = context.customers.find((entry) => entry.id === plan.customerId);
      if (!customer) return { kind: 'not-found' };
      const events = context.events.filter((event) => event.customerId === customer.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const recentEvents = events.slice(0, 5);
      return {
        kind: 'history', customer, events: recentEvents, hasMore: events.length > 5,
        itemDetailsAreStructured: recentEvents.some((event) => event.lines.length > 0),
      };
    }
    case 'ambiguous':
      return plan;
    case 'not-found':
      return plan;
    case 'unsupported':
      return plan;
  }
}

export function currentShopBusinessDate(now = new Date()) {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(fields.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dueCustomerPromises(promises: NamedPromise[], customers: Customer[], today: string) {
  const balances = new Map(customers.map((customer) => [customer.id, customer.balancePaise]));
  return promises
    .filter((promise) => promise.status === 'open' && promise.dueDate !== null && promise.dueDate <= today
      && (balances.get(promise.customerId) ?? 0) > 0)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}
