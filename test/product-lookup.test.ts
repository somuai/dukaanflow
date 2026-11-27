import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeBarcode, parseBarcodeSuggestion, parseBarcodeSuggestionBody } from '../src/product-lookup.ts';

test('a scanned EAN keeps the returned product name, brand, and pack quantity as editable suggestions', () => {
  const barcode = '8901058000290';
  const suggestion = parseBarcodeSuggestion(barcode, {
    status: 'success',
    product: {
      product_name: 'maggi',
      product_name_en: 'maggi',
      brands: 'Nestlé',
      quantity: '70',
    },
  });

  assert.deepEqual(suggestion, {
    barcode,
    name: 'maggi',
    brand: 'Nestlé',
    packageContent: '70',
    source: 'open_food_facts',
  });
  assert.equal(normalizeBarcode(` ${barcode}\n`), barcode);
});

test('incomplete barcode records do not guess a product or unit', () => {
  assert.equal(parseBarcodeSuggestion('4000000000000', { status: 'failure', product: { brands: 'Nestlé', quantity: '70' } }), null);
  assert.equal(parseBarcodeSuggestion('4000000000000', { status: 'success', product: { product_name: 'Tea' } })?.packageContent, null);
  assert.equal(normalizeBarcode('12345'), null);
});

test('barcode response parsing rejects oversized or malformed response bodies', () => {
  assert.equal(parseBarcodeSuggestionBody('4000000000000', 'x'.repeat(65 * 1024)), null);
  assert.equal(parseBarcodeSuggestionBody('4000000000000', '{not-json'), null);
  assert.deepEqual(parseBarcodeSuggestionBody('4000000000000', JSON.stringify({
    product: { product_name: 'Tea', quantity: '250 g' },
  })), {
    barcode: '4000000000000', name: 'Tea', brand: null, packageContent: '250 g', source: 'open_food_facts',
  });
});
