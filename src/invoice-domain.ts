import type { CatalogItem } from './domain';

export type ExtractedInvoiceLine = {
  id: string;
  rawDescription: string;
  catalogueItemId: string | null;
  billedQuantity: number | null;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  evidence: string;
  confidence: 'review' | 'matched';
};

export type ExtractedInvoice = {
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalPaise: number | null;
  paidPaise: number | null;
  paymentMethod: 'cash' | null;
  lines: ExtractedInvoiceLine[];
  rawText: string;
};

export type PositionedInvoiceText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Rebuilds OCR lines from Vision's spatial text blocks before table parsing. */
export function joinInvoiceOCRBlocks(blocks: readonly PositionedInvoiceText[]): string {
  const ordered = [...blocks].filter((block) => block.text.trim()).sort((a, b) =>
    (b.y + b.height / 2) - (a.y + a.height / 2));
  const rows: { centerY: number; height: number; blocks: PositionedInvoiceText[] }[] = [];

  for (const block of ordered) {
    const centerY = block.y + block.height / 2;
    const row = rows.find((candidate) =>
      Math.abs(candidate.centerY - centerY) <= Math.max(candidate.height, block.height) * 0.7);
    if (row) {
      row.blocks.push(block);
      row.centerY = row.blocks.reduce((sum, part) => sum + part.y + part.height / 2, 0) / row.blocks.length;
      row.height = Math.max(row.height, block.height);
    } else {
      rows.push({ centerY, height: block.height, blocks: [block] });
    }
  }

  return rows
    .sort((a, b) => b.centerY - a.centerY)
    .map((row) => row.blocks.sort((a, b) => a.x - b.x).map((block) => block.text.trim()).join(' '))
    .join('\n');
}

function moneyPaise(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/u.test(value)) return null;
  const [rupees, fraction = ''] = value.split('.');
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function matchCatalogue(description: string, catalogue: readonly CatalogItem[]) {
  const normalized = normalize(description);
  const candidates = catalogue.filter((item) => {
    const itemName = normalize(item.name);
    const size = normalize(item.packSize);
    const normalizedSize = size.replace(/\b(\d+)\s*(g|kg|l)\b/u, '$1 $2');
    const descriptionWithoutSpaces = normalized.replace(/\s+/gu, '');
    const sizeWithoutSpaces = normalizedSize.replace(/\s+/gu, '');
    return normalized.includes(itemName) && descriptionWithoutSpaces.includes(sizeWithoutSpaces);
  });
  if (!candidates.length) return null;
  const mostSpecificLength = Math.max(...candidates.map((item) => normalize(item.name).length));
  const mostSpecific = candidates.filter((item) => normalize(item.name).length === mostSpecificLength);
  return mostSpecific.length === 1 ? mostSpecific[0].id : null;
}

/**
 * Conservative first-pass parser for native Vision OCR text. It returns
 * suggestions only: quantity, price, and identity remain reviewable fields.
 * Unknown or ambiguous rows are retained with a null catalogue match.
 */
export function extractInvoice(text: string, catalogue: readonly CatalogItem[]): ExtractedInvoice {
  const rawText = text.trim();
  const rows = rawText.split(/\r?\n/u).map((line) => line.replace(/\s+/gu, ' ').trim()).filter(Boolean);
  const supplier = rows.find((line) => /^supplier\s*:/iu.test(line))?.replace(/^supplier\s*:\s*/iu, '')
    ?? rows.find((line) => /\b(?:grocers|kirana supply)\b/iu.test(line))
    ?? null;
  const invoiceNumber = rawText.match(/\binvoice\s*(?:no\.?|number|#)\s*[:.]?\s*([A-Z0-9-]+)/iu)?.[1] ?? null;
  const invoiceDate = rawText.match(/\bdate\s*[:.]?\s*(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}|\d{4}-\d{2}-\d{2})/iu)?.[1] ?? null;
  const totalPaise = moneyPaise(rawText.match(/\btotal\s+(?:INR\s*)?(\d+(?:\.\d{1,2})?)/iu)?.[1]);
  const paid = rawText.match(/\bpaid\s+by\s+cash\s+(\d+(?:\.\d{1,2})?)/iu);
  const lines: ExtractedInvoiceLine[] = [];

  for (const [index, evidence] of rows.entries()) {
    if (/^(?:ITEM|QTY|RATE|AMOUNT|SUBTOTAL|TOTAL|PAID|BALANCE|SUPPLIER|BILL TO|INVOICE|DATE)\b/iu.test(evidence)) continue;
    const match = evidence.match(/^(.+?)\s+(\d+)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)$/u);
    if (!match) continue;
    const [, rawDescription, billed, rate, amount] = match;
    const catalogueItemId = matchCatalogue(rawDescription, catalogue);
    lines.push({
      id: `ocr-line-${index + 1}`,
      rawDescription,
      catalogueItemId,
      billedQuantity: Number(billed),
      unitPricePaise: moneyPaise(rate),
      lineTotalPaise: moneyPaise(amount),
      evidence,
      confidence: catalogueItemId ? 'matched' : 'review',
    });
  }

  return {
    supplier,
    invoiceNumber,
    invoiceDate,
    totalPaise,
    paidPaise: moneyPaise(paid?.[1]),
    paymentMethod: paid ? 'cash' : null,
    lines,
    rawText,
  };
}
