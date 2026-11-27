export type BarcodeProductSuggestion = {
  barcode: string;
  name: string;
  brand: string | null;
  packageContent: string | null;
  source: 'open_food_facts';
};

type OpenFoodFactsResponse = {
  product?: {
    product_name?: unknown;
    product_name_en?: unknown;
    brands?: unknown;
    quantity?: unknown;
  };
};

const MAX_LOOKUP_RESPONSE_CHARS = 64 * 1024;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.replace(/\s+/gu, ' ').trim();
  return result.length > 0 ? result.slice(0, 120) : null;
}

export function normalizeBarcode(value: string): string | null {
  const barcode = value.replace(/\s+/gu, '');
  return /^(?:\d{8}|\d{12,14})$/u.test(barcode) ? barcode : null;
}

export function equivalentProductBarcodes(value: string): string[] {
  const barcode = normalizeBarcode(value);
  if (!barcode) return [];
  if (barcode.length === 8) return [barcode];
  const padded = barcode.padStart(14, '0');
  return [padded, ...(padded.startsWith('0') ? [padded.slice(1)] : []),
    ...(padded.startsWith('00') ? [padded.slice(2)] : [])];
}

export function parseBarcodeSuggestion(barcode: string, payload: unknown): BarcodeProductSuggestion | null {
  if (!payload || typeof payload !== 'object') return null;
  const product = (payload as OpenFoodFactsResponse).product;
  if (!product || typeof product !== 'object') return null;
  const name = clean(product.product_name) ?? clean(product.product_name_en);
  if (!name) return null;
  return {
    barcode,
    name,
    brand: clean(product.brands)?.split(',')[0]?.trim() ?? null,
    packageContent: clean(product.quantity),
    source: 'open_food_facts',
  };
}

export function parseBarcodeSuggestionBody(barcode: string, body: string): BarcodeProductSuggestion | null {
  if (body.length > MAX_LOOKUP_RESPONSE_CHARS) return null;
  try {
    return parseBarcodeSuggestion(barcode, JSON.parse(body));
  } catch {
    return null;
  }
}

function requestBarcodePayload(barcode: string): Promise<string | null> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (body: string | null) => {
      if (settled) return;
      settled = true;
      resolve(body);
    };
    const fail = () => finish(null);

    request.open('GET', `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,quantity`);
    request.timeout = 7000;
    request.responseType = 'text';
    request.setRequestHeader('User-Agent', 'DukaanFlow/0.1 (product barcode lookup)');
    request.onprogress = (event) => {
      const decodedLength = typeof request.responseText === 'string' ? request.responseText.length : 0;
      if (event.loaded > MAX_LOOKUP_RESPONSE_CHARS || decodedLength > MAX_LOOKUP_RESPONSE_CHARS) request.abort();
    };
    request.onload = () => {
      const declaredLength = Number(request.getResponseHeader('content-length'));
      if (request.status < 200 || request.status >= 300
        || (Number.isFinite(declaredLength) && declaredLength > MAX_LOOKUP_RESPONSE_CHARS)
        || typeof request.responseText !== 'string'
        || request.responseText.length > MAX_LOOKUP_RESPONSE_CHARS) {
        fail();
        return;
      }
      finish(request.responseText);
    };
    request.onerror = fail;
    request.ontimeout = fail;
    request.onabort = fail;
    try {
      request.send();
    } catch {
      fail();
    }
  });
}

export async function lookupBarcodeProduct(barcodeValue: string): Promise<BarcodeProductSuggestion | null> {
  const barcode = normalizeBarcode(barcodeValue);
  if (!barcode) throw new Error('This barcode does not look valid. Scan an 8 to 14 digit product code.');
  const body = await requestBarcodePayload(barcode);
  return body === null ? null : parseBarcodeSuggestionBody(barcode, body);
}
