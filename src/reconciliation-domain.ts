import {
  MAX_MONEY_PAISE,
  MAX_QUANTITY,
  type PaymentMethod,
  type StockUnit,
} from './domain.ts';

export type DeliveryLineKind = 'invoice' | 'extra' | 'substitution';

/** A field extracted from an invoice. OCR text and confidence remain evidence, not authority. */
export type InvoiceEvidence<T> = {
  value: T | null;
  sourceText: string | null;
  confidence: number | null;
};

export type DeliveryLineDraft = {
  id: string;
  kind: DeliveryLineKind;
  relatedInvoiceLineId: string | null;
  description: string;
  catalogItemId: string | null;
  catalogName: string | null;
  packSize: string | null;
  unit: StockUnit | null;
  billedQuantity: number;
  receivedGoodQuantity: number;
  damagedQuantity: number;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  evidenceText: string | null;
  evidenceConfidence: number | null;
};

export type DeliveryReconciliationDraft = {
  id: string;
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceTotalPaise: number | null;
  amountPaidPaise: number | null;
  paymentMethod: PaymentMethod | null;
  documentUri: string | null;
  lines: DeliveryLineDraft[];
};

export type DeliveryReconciliationInput = Omit<DeliveryReconciliationDraft, 'lines'> & {
  lines: (DeliveryLineDraft & {
    catalogItemId: string;
    catalogName: string;
    packSize: string;
    unit: StockUnit;
  })[];
};

export type LineDifference = {
  lineId: string;
  missingQuantity: number;
  extraQuantity: number;
  damagedQuantity: number;
};

export const RECEIVED_GOOD_STOCK_RULE =
  'Only the owner-confirmed good quantity increases saleable stock.';

export function missingQuantity(line: Pick<DeliveryLineDraft, 'kind' | 'billedQuantity' | 'receivedGoodQuantity' | 'damagedQuantity'>) {
  if (line.kind !== 'invoice') return 0;
  return Math.max(0, line.billedQuantity - line.receivedGoodQuantity - line.damagedQuantity);
}

export function extraQuantity(line: Pick<DeliveryLineDraft, 'kind' | 'billedQuantity' | 'receivedGoodQuantity' | 'damagedQuantity'>) {
  if (line.kind !== 'invoice') return line.receivedGoodQuantity + line.damagedQuantity;
  return Math.max(0, line.receivedGoodQuantity + line.damagedQuantity - line.billedQuantity);
}

export function lineDifference(line: DeliveryLineDraft): LineDifference {
  return {
    lineId: line.id,
    missingQuantity: missingQuantity(line),
    extraQuantity: extraQuantity(line),
    damagedQuantity: line.damagedQuantity,
  };
}

export function validateDeliveryReconciliation(
  draft: DeliveryReconciliationDraft,
  catalog: ReadonlyMap<string, { name: string; packSize: string; unit: StockUnit }>,
): string[] {
  const issues: string[] = [];
  if (!draft.id.trim()) issues.push('A confirmation ID is required.');
  if (draft.invoiceTotalPaise !== null && !validMoney(draft.invoiceTotalPaise)) {
    issues.push('Check the invoice total or mark it unknown.');
  }
  if (draft.amountPaidPaise !== null && !validMoney(draft.amountPaidPaise)) {
    issues.push('Check the amount paid or mark it unknown.');
  }
  if (draft.paymentMethod !== null && !['cash', 'upi', 'card', 'bank_transfer', 'other'].includes(draft.paymentMethod)) {
    issues.push('Choose a valid payment method or mark it unknown.');
  }
  if (!draft.lines.length) issues.push('Add at least one invoice or received item.');

  const seen = new Set<string>();
  for (const line of draft.lines) {
    const prefix = `Line ${line.id || '(unnamed)'}`;
    if (!line.id.trim() || seen.has(line.id)) issues.push(`${prefix} needs a unique line ID.`);
    seen.add(line.id);
    if (!line.description.trim()) issues.push(`${prefix} needs its invoice description.`);
    if (!Number.isSafeInteger(line.billedQuantity) || line.billedQuantity < 0 || line.billedQuantity > MAX_QUANTITY) {
      issues.push(`${prefix} has an invalid billed quantity.`);
    }
    for (const [name, quantity] of [
      ['good', line.receivedGoodQuantity], ['damaged', line.damagedQuantity],
    ] as const) {
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
        issues.push(`${prefix} has an invalid ${name} quantity.`);
      }
    }
    if (line.kind === 'invoice' && line.billedQuantity < 1) {
      issues.push(`${prefix} needs a billed quantity.`);
    }
    if (line.kind !== 'invoice' && line.billedQuantity !== 0) {
      issues.push(`${prefix} must not add to the invoice quantity.`);
    }
    if (line.kind === 'substitution' && !line.relatedInvoiceLineId) {
      issues.push(`${prefix} must identify the invoice line it substitutes.`);
    }
    if (line.relatedInvoiceLineId && !draft.lines.some((candidate) =>
      candidate.id === line.relatedInvoiceLineId && candidate.kind === 'invoice')) {
      issues.push(`${prefix} refers to a missing invoice line.`);
    }
    if (line.unitPricePaise !== null && !validMoney(line.unitPricePaise)) {
      issues.push(`${prefix} has an invalid unit price.`);
    }
    if (line.lineTotalPaise !== null && !validMoney(line.lineTotalPaise)) {
      issues.push(`${prefix} has an invalid line total.`);
    }
    if (line.evidenceConfidence !== null &&
      (!Number.isFinite(line.evidenceConfidence) || line.evidenceConfidence < 0 || line.evidenceConfidence > 1)) {
      issues.push(`${prefix} has invalid OCR confidence.`);
    }

    const item = line.catalogItemId ? catalog.get(line.catalogItemId) : undefined;
    if (!item) {
      issues.push(`${prefix} must be matched to an exact catalogue item before confirmation.`);
    } else if (item.name !== line.catalogName || item.packSize !== line.packSize || item.unit !== line.unit) {
      issues.push(`${prefix} catalogue details changed; review the item and unit again.`);
    }
  }
  return [...new Set(issues)];
}

function validMoney(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY_PAISE;
}
