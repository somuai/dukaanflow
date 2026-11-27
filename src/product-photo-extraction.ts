import type { InvoiceOCRResult } from '../modules/invoice-ocr/src';

export type ProductPhotoSuggestions = { name: string | null; packSize: string | null };

const NON_PRODUCT_LABEL = /(?:\b(?:best before|use by|expiry|mfg|manufactured|ingredients?|nutrition|nutritional|barcode|fssai|mrp|maximum retail price|net weight|net wt|net quantity|batch|lot|customer care|address|website|www\.)\b|(?:उपयोग से पहले|समाप्ति|निर्मित|सामग्री|पोषण|अधिकतम खुदरा मूल्य|शुद्ध मात्रा|बैच))/iu;
const SIZE_PATTERN = /(?:^|[^\p{L}\p{N}])([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(kg|kgs|kilograms?|g|gm|gms|grams?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|quintals?|किलोग्राम|किलो|ग्राम|मिलीलीटर|मिलीलीटर|मिली|लीटर|क्विंटल)(?=$|[^\p{L}\p{N}])/giu;

function canonicalPackSize(value: string, spokenUnit: string) {
  const amount = String(Number(value));
  const unit = spokenUnit.toLocaleLowerCase('en-IN');
  if (/^(?:kg|kgs|kilo|kilogram|kilograms|किलो|किलोग्राम)$/u.test(unit)) return `${amount} kg`;
  if (/^(?:g|gm|gms|gram|grams|ग्राम)$/u.test(unit)) return `${amount} g`;
  if (/^(?:ml|milliliter|milliliters|millilitre|millilitres|मिली|मिलीलीटर)$/u.test(unit)) return `${amount} ml`;
  if (/^(?:l|liter|liters|litre|litres|लीटर)$/u.test(unit)) return `${amount} L`;
  if (/^(?:quintal|quintals|क्विंटल)$/u.test(unit)) return `${amount} quintal`;
  return null;
}

/** Make cautious, editable suggestions from local package OCR; never treats OCR as an authority. */
export function extractProductPhotoSuggestions(result: InvoiceOCRResult): ProductPhotoSuggestions {
  const blocks = result.blocks.filter((block) => block.confidence >= 0.55 && block.text.trim());
  const name = blocks
    .filter((block) => /[\p{L}]{2}/u.test(block.text)
      && !/^[\d\s.,:/-]+$/u.test(block.text)
      && !NON_PRODUCT_LABEL.test(block.text)
      && block.text.trim().length <= 60)
    .sort((a, b) => b.bounds.height - a.bounds.height || b.bounds.y - a.bounds.y)[0]
    ?.text.trim().replace(/\s+/gu, ' ') ?? null;

  const sizeText = [result.text, ...blocks.map((block) => block.text)].join('\n');
  const sizes = new Set<string>();
  for (const match of sizeText.matchAll(SIZE_PATTERN)) {
    const value = canonicalPackSize(match[1], match[2]);
    if (value) sizes.add(value);
  }

  return { name, packSize: sizes.size === 1 ? [...sizes][0] : null };
}
