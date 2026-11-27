import assert from 'node:assert/strict';
import test from 'node:test';
import { extractProductPhotoSuggestions } from '../src/product-photo-extraction.ts';
import type { InvoiceOCRResult } from '../modules/invoice-ocr/src';

function block(text: string, y: number, height = 0.08, confidence = 0.95) {
  return { text, confidence, bounds: { x: 0.1, y, width: 0.7, height } };
}

test('package photo OCR suggests a clear product name and one unambiguous net size', () => {
  const result: InvoiceOCRResult = {
    text: 'Maggi\nMasala Noodles\nNet Weight 70 g',
    blocks: [block('Maggi', 0.82, 0.2), block('Masala Noodles', 0.65, 0.1), block('Net Weight 70 g', 0.18)],
  };

  assert.deepEqual(extractProductPhotoSuggestions(result), { name: 'Maggi', packSize: '70 g' });
});

test('package photo OCR leaves pack size blank when the image contains conflicting quantities', () => {
  const result: InvoiceOCRResult = {
    text: 'Amul\n500 ml\nNutrition per 100 ml',
    blocks: [block('Amul', 0.8, 0.18), block('500 ml', 0.5), block('Nutrition per 100 ml', 0.2)],
  };

  assert.deepEqual(extractProductPhotoSuggestions(result), { name: 'Amul', packSize: null });
});

test('package photo OCR ignores weak or non-product text instead of inventing a name', () => {
  const result: InvoiceOCRResult = {
    text: 'BEST BEFORE\n1234567890',
    blocks: [block('BEST BEFORE', 0.8, 0.08, 0.3), block('1234567890', 0.5, 0.1, 0.99)],
  };

  assert.deepEqual(extractProductPhotoSuggestions(result), { name: null, packSize: null });
});
