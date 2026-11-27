import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSavedInvoicePage, resolveSavedProductPhoto } from '../src/invoice-evidence.ts';

const page = 'invoice-scans/6F9619FF-8B86-D011-B42D-00C04FC964FF/page-2.jpg';
const documents = 'file:///new-container/Documents/';

test('saved invoice pages reopen in the current iOS Documents container', () => {
  assert.equal(resolveSavedInvoicePage(page, documents), documents + page);
  assert.equal(resolveSavedInvoicePage(`file:///old-container/Documents/${page}`, documents), documents + page);
  assert.equal(resolveSavedInvoicePage(documents + page, documents), documents + page);
});

test('managed product photos rebase to the current container without accepting invoice paths', () => {
  const photo = 'product-photos/product-6F9619FF-8B86-D011-B42D-00C04FC964FF.jpg';
  assert.equal(resolveSavedProductPhoto(`file:///old-container/Documents/${photo}`, documents), documents + photo);
  assert.equal(resolveSavedProductPhoto(page, documents), null);
  assert.equal(resolveSavedProductPhoto(`file:///old-container/Library/${photo}`, documents), null);
});

test('invoice evidence accepts only a managed scan page and an available Documents directory', () => {
  for (const invalid of [
    `https://example.test/Documents/${page}`,
    `file://other-device/Documents/${page}`,
    `file:///old-container/Library/${page}`,
    `../${page}`,
    `${page}?other=true`,
    page.replace('page-2.jpg', '%2e%2e/private.jpg'),
    page.replace('page-2.jpg', 'page-0.jpg'),
  ]) assert.equal(resolveSavedInvoicePage(invalid, documents), null);
  assert.equal(resolveSavedInvoicePage(page, null), null);
});

test('attachments in restored ledgers reopen and can be exported from the selected workspace', () => {
  const generation = 'dukaanflow-workspaces/6F9619FF-8B86-D011-B42D-00C04FC964FF/media/';
  const media = documents + generation;
  const photo = 'product-photos/product-6F9619FF-8B86-D011-B42D-00C04FC964FF.jpg';
  assert.equal(resolveSavedInvoicePage('file:///old-container/Documents/' + page, media), media + page);
  assert.equal(resolveSavedInvoicePage('file:///old-container/Documents/' + generation + page, media), media + page);
  assert.equal(resolveSavedProductPhoto('file:///old-container/Documents/' + generation + photo, media), media + photo);
  assert.equal(resolveSavedProductPhoto(documents + 'dukaanflow-workspaces/other/media/' + photo, media), null);
});
