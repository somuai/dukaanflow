import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeCustomerCapture } from '../src/customer-capture.ts';
import type { Customer } from '../src/store.ts';

const customers: Customer[] = [
  { id: 'ramesh', name: 'Ramesh Sharma', aliases: ['Ramesh ji'], createdAt: '2026-11-01T00:00:00.000Z', balancePaise: 0, openPromiseCount: 0 },
  { id: 'ramesh-dairy', name: 'Ramesh Dairy', aliases: ['Ramesh ji'], createdAt: '2026-11-01T00:00:00.000Z', balancePaise: 0, openPromiseCount: 0 },
  { id: 'raj', name: 'Raj Kumar', aliases: ['Raj'], createdAt: '2026-11-01T00:00:00.000Z', balancePaise: 0, openPromiseCount: 0 },
];

test('Hindi/Hinglish credit dictation proposes one matching customer, amount, and a reviewed weekday promise', () => {
  const proposal = proposeCustomerCapture('Ramesh Sharma ko 350 ka samaan udhaar likho, Friday ko denge.', customers, '2026-11-24');
  assert.equal(proposal.kind, 'credit_sale');
  assert.equal(proposal.amountPaise, 35_000);
  assert.deepEqual(proposal.customerMatches.map(({ id }) => id), ['ramesh']);
  assert.equal(proposal.promiseMentioned, true);
  assert.equal(proposal.promiseDueDate, '2026-11-27');
});

test('English loan and repayment wording proposes the same customer-credit semantics as udhaar', () => {
  const proposal = proposeCustomerCapture('Raj borrowed ₹100 and will repay it in four days.', customers, '2026-11-24');
  assert.equal(proposal.kind, 'credit_sale');
  assert.equal(proposal.amountPaise, 10_000);
  assert.deepEqual(proposal.customerMatches.map(({ id }) => id), ['raj']);
  assert.equal(proposal.promiseMentioned, true);
  assert.equal(proposal.promiseDueDate, '2026-11-28');
  assert.deepEqual(proposal.issues, []);
});

test('repayment dictation proposes UPI only when it is present in the utterance', () => {
  const proposal = proposeCustomerCapture('Ramesh ji ne 200 UPI de diye.', customers, '2026-11-24');
  assert.equal(proposal.kind, 'repayment_received');
  assert.equal(proposal.amountPaise, 20_000);
  assert.deepEqual(proposal.customerMatches.map(({ id }) => id), ['ramesh', 'ramesh-dairy']);
  assert.equal(proposal.paymentMethod, 'upi');
});

test('an ordinary product purchase is not classified as customer credit', () => {
  const proposal = proposeCustomerCapture('Tinku ne 2 packet Maggi kharide.', customers, '2026-11-24');
  assert.equal(proposal.kind, null);
  assert.equal(proposal.amountPaise, null, 'item quantity is not the rupee amount');
  assert.equal(proposal.promiseMentioned, false);
});

test('more than one customer matching a spoken alias stays unresolved', () => {
  const proposal = proposeCustomerCapture('Ramesh ji ko ₹350 udhaar likho.', customers, '2026-11-24');
  assert.equal(proposal.kind, 'credit_sale');
  assert.equal(proposal.amountPaise, 35_000);
  assert.equal(proposal.customerMatches.length, 2);
});

test('a phrase containing both a credit sale and repayment is not collapsed into one write', () => {
  const proposal = proposeCustomerCapture('Ramesh ko 350 udhaar diya aur 200 UPI de diye.', customers, '2026-11-24');
  assert.equal(proposal.kind, null);
  assert.equal(proposal.amountPaise, null);
  assert.equal(proposal.issues.includes('multiple-events'), true);
});

test('kal in a future payment promise resolves to tomorrow', () => {
  const proposal = proposeCustomerCapture('Ramesh ko 350 udhaar likho, kal denge.', customers, '2026-11-24');
  assert.equal(proposal.promiseMentioned, true);
  assert.equal(proposal.promiseDueDate, '2026-11-25');
  assert.equal(proposal.issues.includes('date-unclear'), false);
});

test('a Hindi relative-day promise resolves against the shop date', () => {
  const proposal = proposeCustomerCapture('Raj ने ₹40 का दूध और bread butter उधार लिया है। 4 दिन में चुका देगा।', customers, '2026-11-24');
  assert.equal(proposal.kind, 'credit_sale');
  assert.equal(proposal.amountPaise, 4_000);
  assert.equal(proposal.customerMatches[0]?.id, 'raj');
  assert.equal(proposal.promiseMentioned, true);
  assert.equal(proposal.promiseDueDate, '2026-11-28');
  assert.equal(proposal.issues.includes('date-unclear'), false);
});

test('written Hindi day counts and Devanagari digits resolve with the shop date', () => {
  const written = proposeCustomerCapture('Raj को 40 रुपये उधार दिए, चार दिन में चुका देगा.', customers, '2026-11-24');
  const devanagariDigit = proposeCustomerCapture('Raj को 40 रुपये उधार दिए, ४ दिन में चुका देगा.', customers, '2026-11-24');
  assert.equal(written.promiseDueDate, '2026-11-28');
  assert.equal(devanagariDigit.promiseDueDate, '2026-11-28');
});

test('a mixed supplier delivery and customer credit utterance is not one customer write', () => {
  const proposal = proposeCustomerCapture(
    'Sharma delivered 12 cartons of Maggi and 4 cartons of milk today. Raj ने ₹100 उधार लिया है, ₹40 का दूध और bread butter भी; 4 दिन में चुका देगा.',
    customers,
    '2026-11-24',
  );
  assert.equal(proposal.kind, null);
  assert.equal(proposal.amountPaise, null);
  assert.equal(proposal.issues.includes('multiple-events'), true);
  assert.equal(proposal.issues.includes('amount-unclear'), true);
  assert.deepEqual(proposal.customerMatches.map(({ id }) => id), ['raj']);
});

test('Sunday is not attached to a customer promise when a mixed note has unclear event boundaries', () => {
  const proposal = proposeCustomerCapture(
    'Rajesh supplier ne mujhe 12 carton Maggi aur 4 carton doodh diye; Raju ne ₹100 ka udhaar liya. For that he will say that he has ₹40 withdrawn. दो दूध और दो bread and पटल लिया है, Sunday तक लाता देगा वो.',
    [{ id: 'raju', name: 'Raju Kumar', aliases: ['Raju'], createdAt: '2026-11-01T00:00:00Z', balancePaise: 0, openPromiseCount: 0 }],
    '2026-11-25',
  );
  assert.equal(proposal.kind, null, 'a mixed event note must not become one customer ledger write');
  assert.equal(proposal.amountPaise, null, '₹100 and ₹40 must not be collapsed');
  assert.deepEqual(proposal.customerMatches.map(({ id }) => id), ['raju']);
  assert.equal(proposal.promiseMentioned, true);
  assert.equal(proposal.promiseDueDate, null, 'Sunday must not be associated until the event boundary is confirmed');
  assert.equal(proposal.issues.includes('amount-unclear'), true);
  assert.equal(proposal.issues.includes('date-unclear'), true);
});
