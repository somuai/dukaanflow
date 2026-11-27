import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeHomeNote, toHomeNoteBatchInput } from '../src/home-capture.ts';

const directory = mkdtempSync(join(tmpdir(), 'dukaanflow-new-customer-'));
process.env.DUKAANFLOW_TEST_DB_PATH = join(directory, 'dukaanflow.db');
const store = await import('../src/store.ts');

test('a clear Home credit note can create a new customer profile and linked promise by voice', () => {
  const analysis = analyzeHomeNote(
    'Raju ने ₹100 उधार लिया है, रविवार तक चुका देगा।',
    [],
    [],
    '2026-11-27',
    [],
  );
  assert.deepEqual(analysis.unresolvedSegments, []);
  assert.equal(analysis.events.length, 1);
  const event = analysis.events[0];
  assert.equal(event?.kind, 'customer');
  assert.equal('newCustomer' in (event ?? {}), true);
  assert.equal(event?.customerName, 'Raju');
  assert.equal(event?.credit?.amountPaise, 10_000);
  assert.equal(event?.credit?.promise?.dueDate, '2026-11-29');

  const batch = toHomeNoteBatchInput(analysis, 'voice-created-customer');
  assert.equal(batch?.newCustomer?.id, 'voice-created-customer');
  assert.equal(batch?.newCustomer?.name, 'Raju');
  assert.equal(batch?.credit?.event.customerId, 'voice-created-customer');
});

test('a spoken name that matches existing customer aliases never creates a second profile', () => {
  const customers = [
    { id: 'raju-one', name: 'Raju Sharma', aliases: ['Raju'] },
    { id: 'raju-two', name: 'Raju Dairy', aliases: ['Raju'] },
  ] as never[];
  const analysis = analyzeHomeNote(
    'Raju ने ₹100 उधार लिया है।', customers, [], '2026-11-27', [],
  );
  assert.ok(analysis.unresolvedSegments.length > 0);
  assert.equal(analysis.events.some((event) => 'newCustomer' in event), false);
  assert.equal(toHomeNoteBatchInput(analysis, 'must-not-create'), null);
});

test('voice-created customer and credit entry save atomically, retry once, and reject name collisions', async (t) => {
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const transcript = 'Raju ने ₹100 उधार लिया है, रविवार तक चुका देगा।';
  const analysis = analyzeHomeNote(transcript, [], [], '2026-11-27', []);
  const batch = toHomeNoteBatchInput(analysis, 'voice-raju-profile');
  assert.ok(batch?.newCustomer && batch.credit);

  await store.recordHomeNoteBatch('live', 'voice-raju-note', batch);
  await store.recordHomeNoteBatch('live', 'voice-raju-note', batch);
  const [raju] = await store.listCustomers('live');
  assert.equal(raju?.id, 'voice-raju-profile');
  assert.equal(raju?.name, 'Raju');
  assert.equal(raju?.balancePaise, 10_000);
  assert.equal((await store.listCustomerCreditEvents('live', raju!.id)).length, 1);
  const [promise] = await store.listCustomerPromises('live', raju!.id);
  assert.equal(promise?.dueDate, '2026-11-29');

  const collisionTranscript = 'Sita ने ₹40 उधार लिया है।';
  const staleBatch = toHomeNoteBatchInput(analyzeHomeNote(collisionTranscript, [], [], '2026-11-27', []), 'voice-sita-collision');
  assert.ok(staleBatch?.newCustomer && staleBatch.credit);
  await store.createCustomer('live', 'existing-sita', { name: 'Sita Devi', aliases: ['Sita'] });
  await assert.rejects(store.recordHomeNoteBatch('live', 'voice-sita-collision-note', staleBatch), /already be saved as Sita Devi/u);
  assert.equal((await store.listCustomers('live')).length, 2);
});
