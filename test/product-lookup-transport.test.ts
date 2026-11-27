import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupBarcodeProduct } from '../src/product-lookup.ts';

type XhrHandlers = {
  onprogress: ((event: ProgressEvent) => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
};

class FakeXMLHttpRequest implements XhrHandlers {
  static latest: FakeXMLHttpRequest | null = null;
  onprogress: XhrHandlers['onprogress'] = null;
  onload: XhrHandlers['onload'] = null;
  onerror: XhrHandlers['onerror'] = null;
  ontimeout: XhrHandlers['ontimeout'] = null;
  onabort: XhrHandlers['onabort'] = null;
  responseType = '';
  responseText = '';
  status = 0;
  timeout = 0;
  aborted = false;

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open() {}
  setRequestHeader() {}
  getResponseHeader() { return null; }
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

async function withFakeXMLHttpRequest<T>(run: () => Promise<T>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  FakeXMLHttpRequest.latest = null;
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeXMLHttpRequest });
  try {
    return await run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'XMLHttpRequest', descriptor);
    else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
  }
}

test('barcode lookup returns an editable suggestion from a successful XHR response', async () => {
  await withFakeXMLHttpRequest(async () => {
    const resultPromise = lookupBarcodeProduct('8901058000290');
    const request = FakeXMLHttpRequest.latest;
    assert.ok(request, 'lookup should start an XHR');
    request.status = 200;
    request.responseText = JSON.stringify({ product: { product_name: 'Maggi', quantity: '70 g' } });
    request.onload?.();

    assert.deepEqual(await resultPromise, {
      barcode: '8901058000290', name: 'Maggi', brand: null, packageContent: '70 g', source: 'open_food_facts',
    });
  });
});

test('barcode lookup aborts and returns no suggestion when progress exceeds the response cap', async () => {
  await withFakeXMLHttpRequest(async () => {
    const resultPromise = lookupBarcodeProduct('8901058000290');
    const request = FakeXMLHttpRequest.latest;
    assert.ok(request, 'lookup should start an XHR');
    request.responseText = 'x'.repeat(65 * 1024);
    request.onprogress?.({ loaded: 65 * 1024 } as ProgressEvent);

    assert.equal(request.aborted, true);
    assert.equal(await resultPromise, null);
  });
});
