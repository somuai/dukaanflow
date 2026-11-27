import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerCustomerQuery,
  planCustomerQuery,
  type CustomerQueryContext,
} from '../src/customer-query.ts';
import { buildCustomerReminderMessage } from '../src/customer-reminder.ts';
import type { Customer, CustomerCreditEvent, PromiseToPay } from '../src/store.ts';

const customers: Customer[] = [
  { id: 'sita', name: 'Sita Devi', aliases: ['Sita ji'], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: 12_500, openPromiseCount: 1 },
  { id: 'ramesh-sharma', name: 'Ramesh Sharma', aliases: ['Ramesh bhai'], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: 25_000, openPromiseCount: 0 },
  { id: 'ramesh-dairy', name: 'Ramesh Dairy', aliases: ['Ramesh bhai'], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: 0, openPromiseCount: 0 },
  { id: 'advance', name: 'Nitin', aliases: [], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: -3_000, openPromiseCount: 0 },
];

const promises: (PromiseToPay & { customerName: string })[] = [
  { id: 'overdue', customerId: 'sita', customerName: 'Sita Devi', amountPaise: 12_500, dueDate: '2026-11-22', note: null, status: 'open', createdAt: '2026-11-10T10:00:00.000Z', relatedEventId: null },
  { id: 'today', customerId: 'ramesh-sharma', customerName: 'Ramesh Sharma', amountPaise: null, dueDate: '2026-11-24', note: null, status: 'open', createdAt: '2026-11-10T10:00:00.000Z', relatedEventId: null },
  { id: 'future', customerId: 'sita', customerName: 'Sita Devi', amountPaise: null, dueDate: '2026-11-25', note: null, status: 'open', createdAt: '2026-11-10T10:00:00.000Z', relatedEventId: null },
  { id: 'kept', customerId: 'sita', customerName: 'Sita Devi', amountPaise: null, dueDate: '2026-11-20', note: null, status: 'kept', createdAt: '2026-11-10T10:00:00.000Z', relatedEventId: null },
];

function event(id: string, kind: CustomerCreditEvent['kind'], amountDeltaPaise: number): CustomerCreditEvent {
  return {
    id, customerId: 'sita', kind, amountPaise: Math.abs(amountDeltaPaise), amountDeltaPaise,
    paymentMethod: null, note: null, sourceText: null,
    createdAt: '2026-11-23T10:00:00.000Z', businessDate: '2026-11-23', reversesEventId: null,
    lines: [],
  };
}

test('a named balance question resolves a unique saved alias and answers from its current balance', () => {
  const plan = planCustomerQuery('Sita ji ka kitna baaki hai?', customers);
  assert.deepEqual(plan, { kind: 'customer-balance', customerId: 'sita' });

  const context: CustomerQueryContext = { customers, promises, events: [] };
  const answer = answerCustomerQuery(plan, context, '2026-11-24');
  assert.equal(answer.kind, 'balance');
  if (answer.kind !== 'balance') return;
  assert.equal(answer.customer.name, 'Sita Devi');
  assert.equal(answer.balancePaise, 12_500);
});

test('a shortened first-name query resolves when exactly one saved customer matches', () => {
  const [ramesh] = customers.filter(({ id }) => id === 'ramesh-sharma');
  const plan = planCustomerQuery('Ramesh ka kitna baaki hai?', [ramesh]);
  assert.deepEqual(plan, { kind: 'customer-balance', customerId: 'ramesh-sharma' });
});

test('a shortened first-name query asks for a choice when multiple saved customers match', () => {
  const plan = planCustomerQuery('Ramesh ka kitna baaki hai?', customers);
  assert.equal(plan.kind, 'ambiguous');
  if (plan.kind !== 'ambiguous') return;
  assert.deepEqual(plan.matches.map(({ id }) => id), ['ramesh-sharma', 'ramesh-dairy']);
});

test('a duplicated spoken alias returns choices instead of selecting a person', () => {
  const plan = planCustomerQuery('Ramesh bhai ka kitna baaki hai?', customers);
  assert.equal(plan.kind, 'ambiguous');
  if (plan.kind !== 'ambiguous') return;
  assert.equal(plan.intent, 'balance');
  assert.deepEqual(plan.matches.map(({ id }) => id), ['ramesh-sharma', 'ramesh-dairy']);
});

test('open-balance query lists only positive confirmed balances and computes an exact total', () => {
  const plan = planCustomerQuery('Who has not paid?', customers);
  assert.deepEqual(plan, { kind: 'open-balances' });
  const answer = answerCustomerQuery(plan, { customers, promises, events: [] }, '2026-11-24');
  assert.equal(answer.kind, 'open-balances');
  if (answer.kind !== 'open-balances') return;
  assert.deepEqual(answer.customers.map(({ id }) => id), ['sita', 'ramesh-sharma']);
  assert.equal(answer.totalPaise, 37_500);
  assert.deepEqual(answer.customerCredits.map(({ id }) => id), ['advance']);
});

test('due-promise query includes overdue and due-today promises, but not future, kept, or undated promises', () => {
  const plan = planCustomerQuery('Which payment promises are due today?', customers);
  assert.deepEqual(plan, { kind: 'due-promises' });
  const answer = answerCustomerQuery(plan, { customers, promises, events: [] }, '2026-11-24');
  assert.equal(answer.kind, 'due-promises');
  if (answer.kind !== 'due-promises') return;
  assert.deepEqual(answer.promises.map(({ id }) => id), ['overdue', 'today']);
});

test('customer history answer exposes recent saved events and says when the log is empty', () => {
  const plan = planCustomerQuery('Show Sita ji transaction history', customers);
  assert.deepEqual(plan, { kind: 'customer-history', customerId: 'sita' });
  const events = [event('repayment', 'repayment_received', -2_000), event('sale', 'credit_sale', 5_000)];
  const answer = answerCustomerQuery(plan, { customers, promises, events }, '2026-11-24');
  assert.equal(answer.kind, 'history');
  if (answer.kind !== 'history') return;
  assert.equal(answer.events.length, 2);
  assert.equal(answer.itemDetailsAreStructured, false);
  const empty = answerCustomerQuery(plan, { customers, promises, events: [] }, '2026-11-24');
  assert.equal(empty.kind, 'history');
  if (empty.kind === 'history') assert.equal(empty.events.length, 0);
});

test('a Hindi milk and bread-butter question opens history and never invents items for a lump-sum entry', () => {
  const raj: Customer = { id: 'raj', name: 'Raj Kumar', aliases: ['Raj'], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: 4_000, openPromiseCount: 1 };
  const shopCustomers = [...customers, raj];
  const plan = planCustomerQuery('Raj ne ₹100 mein kya liya — doodh aur bread butter?', shopCustomers);
  assert.deepEqual(plan, { kind: 'customer-history', customerId: 'raj' });
  const answer = answerCustomerQuery(plan, { customers: shopCustomers, promises, events: [{ ...event('sale', 'credit_sale', 10_000), customerId: 'raj' }] }, '2026-11-24');
  assert.equal(answer.kind, 'history');
  if (answer.kind !== 'history') return;
  assert.equal(answer.itemDetailsAreStructured, false);
  assert.equal(answer.events.length, 1);
});

test('itemized credit history answers which products were recorded for the customer', () => {
  const raj: Customer = { id: 'raj', name: 'Raj Kumar', aliases: ['Raj'], createdAt: '2026-11-01T10:00:00.000Z', balancePaise: 10_000, openPromiseCount: 1 };
  const plan = planCustomerQuery('Raj ne ₹100 mein kya liya — doodh aur bread butter?', [raj]);
  assert.deepEqual(plan, { kind: 'customer-history', customerId: 'raj' });
  const sale = {
    ...event('sale', 'credit_sale', 10_000), customerId: 'raj',
    lines: [
      { catalogueItemId: 'milk-500ml', name: 'Milk', packSize: '500 ml', unit: 'bottle' as const, quantity: 1, amountPaise: 4_000 },
      { catalogueItemId: 'bread-butter', name: 'Bread butter', packSize: '1 pack', unit: 'packet' as const, quantity: 1, amountPaise: 6_000 },
    ],
  };
  const answer = answerCustomerQuery(plan, { customers: [raj], promises, events: [sale] }, '2026-11-24');
  assert.equal(answer.kind, 'history');
  if (answer.kind !== 'history') return;
  assert.equal(answer.itemDetailsAreStructured, true);
  assert.deepEqual(answer.events[0].lines.map(({ name, amountPaise }) => [name, amountPaise]), [['Milk', 4_000], ['Bread butter', 6_000]]);
});

test('unsupported questions are not guessed into a ledger answer', () => {
  assert.deepEqual(planCustomerQuery('Will sales grow next month?', customers), { kind: 'unsupported' });
});

test('reminder copy reflects the confirmed balance and promise, and refuses to remind about a settled balance', () => {
  const message = buildCustomerReminderMessage({
    customerName: 'Sita Devi', balancePaise: 12_500, dueDateLabel: '24 Nov', shopName: 'Rakhi General Store', language: 'en',
  });
  assert.equal(message, 'Namaste Sita Devi, your confirmed shop ledger shows ₹125 still open. You had asked us to follow up by 24 Nov. When convenient, please let me know if this matches your records. Thank you, Rakhi General Store.');
  assert.equal(buildCustomerReminderMessage({
    customerName: 'Sita Devi', balancePaise: 0, dueDateLabel: '24 Nov', shopName: 'Rakhi General Store', language: 'en',
  }), null);
});
