import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const storeSource = await readFile(new URL('../src/store.ts', import.meta.url), 'utf8');

test('store migration preserves v1 and adds delivery, discrepancy, balance, and reversal tables', () => {
  assert.match(storeSource, /const SCHEMA_VERSION = 17/u);
  assert.match(storeSource, /if \(version === 1\)[\s\S]*?CREATE TABLE delivery_event/u);
  assert.match(storeSource, /invoice_evidence_uris_json TEXT NOT NULL/u);
  assert.match(storeSource, /JSON\.parse\(invoiceEvidenceUrisJson\) as string\[\]/u);
  assert.match(storeSource, /JSON\.stringify\(input\.invoiceEvidenceUris\)/u);
  assert.match(storeSource, /if \(version === 2\)[\s\S]*?CREATE TABLE app_preference/u);
  assert.match(storeSource, /if \(version === 3\)[\s\S]*?CREATE TABLE shop_workspace/u);
  assert.match(storeSource, /wispr_setup_step/u);
  assert.match(storeSource, /if \(version === 4\)[\s\S]*?stock_adjustment/u);
  assert.match(storeSource, /'quintal'/u);
  for (const table of [
    'delivery_line', 'delivery_stock_movement', 'delivery_discrepancy',
    'supplier_balance_entry', 'delivery_reversal', 'delivery_reversal_stock_movement',
    'supplier_profile', 'supplier_alias', 'supplier_payment_event',
  ]) assert.match(storeSource, new RegExp(`CREATE TABLE ${table} \\(`, 'u'));
  assert.match(storeSource, /if \(version === 6\)[\s\S]*?CREATE TABLE supplier_payment_event/u);
  assert.match(storeSource, /if \(version === 7\)[\s\S]*?CREATE TABLE customer_credit_line[\s\S]*?CREATE TABLE customer_credit_stock_movement/u);
  assert.match(storeSource, /if \(version === 8\)[\s\S]*?CREATE TABLE stock_reorder_point[\s\S]*?CREATE TABLE restock_draft_line/u);
  assert.match(storeSource, /if \(version === 9\)[\s\S]*?CREATE TABLE supplier_order[\s\S]*?supplier_order_delivery_line/u);
  assert.match(storeSource, /if \(version === 11\)[\s\S]*?CREATE TABLE supplier_claim[\s\S]*?supplier_claim_stock_movement/u);
  assert.match(storeSource, /if \(version === 12\)[\s\S]*?CREATE TABLE delivery_lot_observation[\s\S]*?CREATE TABLE delivery_lot_stock_movement/u);
  assert.match(storeSource, /if \(version === 10\)[\s\S]*?ALTER TABLE delivery_event ADD COLUMN due_date TEXT[\s\S]*?CREATE TABLE supplier_payment_allocation/u);
  assert.match(storeSource, /kind IN \('receipt', 'reversal'\)/u);
  assert.match(storeSource, /if \(version === 14\)[\s\S]*?CREATE TABLE retail_sale_event[\s\S]*?CREATE TABLE retail_sale_line[\s\S]*?CREATE TABLE retail_sale_stock_movement/u);
  assert.match(storeSource, /payment_state TEXT NOT NULL CHECK \(payment_state IN \('unknown', 'cash', 'credit'\)\)/u);
  assert.match(storeSource, /credit sale requires an amount/u);
  assert.match(storeSource, /UNION ALL SELECT mode, catalogue_item_id, quantity_delta FROM retail_sale_stock_movement/u);
  assert.match(storeSource, /CREATE TABLE retail_sale_reversal[\s\S]*?CREATE TABLE retail_sale_reversal_stock_movement/u);
  assert.match(storeSource, /INSERT INTO retail_sale_reversal_stock_movement[\s\S]*?-quantity_delta/u);
});

test('confirmed delivery transaction validates count partition and posts only saleable stock', () => {
  assert.match(storeSource, /line\.billedQuantity !== line\.goodQuantity \+ line\.damagedQuantity \+ line\.missingQuantity/u);
  assert.match(storeSource, /line\.acceptedExtraQuantity > line\.extraQuantity/u);
  assert.match(storeSource, /return line\.goodQuantity \+ line\.acceptedExtraQuantity/u);
  assert.match(storeSource, /payloadJson !== JSON\.stringify\(input\)/u);
  assert.match(storeSource, /Invoice evidence must use local file references/u);
  assert.match(storeSource, /delivery_discrepancy \(mode, event_id, line_position, kind, quantity, status\)[\s\S]*?'pending'/u);
});

test('compensating reversal records inverse stock and supplier balance entries', () => {
  assert.match(storeSource, /delivery_reversal_stock_movement[\s\S]*?-quantity_delta/u);
  assert.match(storeSource, /-entry\.amountDeltaPaise/u);
  assert.match(storeSource, /UPDATE delivery_discrepancy SET status = 'voided'/u);
});

test('delivery companion uses local static artwork with no Rive runtime dependency', async () => {
  const characterSource = await readFile(new URL('../src/ReceivingCompanion.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(characterSource, /@rive|RiveView|\.riv/u);
  assert.match(characterSource, /characterFallback = require\('\.\.\/assets\/parcel-mascot\.png'\)/u);
  assert.match(characterSource, /return <Image source=\{characterFallback\}/u);
});
