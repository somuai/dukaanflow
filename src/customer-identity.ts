import type { Customer } from './store.ts';

export function normalizeCustomerText(value: string) {
  return value.normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966))
    // Shopkeepers often dictate a Latin name with the Hindi honorific: "Sharma जी".
    // Normalize both spellings so saved aliases still resolve across code-switching.
    .replace(/(^|[^\p{L}\p{M}\p{N}])ji(?=$|[^\p{L}\p{M}\p{N}])/giu, '$1जी')
    .replace(/[‐‑–—-]/gu, ' ')
    // Devanagari vowel signs and virama are combining marks. Keep them attached
    // to the surrounding letters or Hindi words such as "उधार" are split.
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function includesPhrase(text: string, phrase: string) {
  const key = normalizeCustomerText(phrase);
  if (!key) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escaped}($|[^\\p{L}\\p{M}\\p{N}])`, 'u').test(text);
}

export function findCustomersMentioned(text: string, customers: Customer[]) {
  const key = normalizeCustomerText(text);
  const found = new Map<string, Customer>();
  for (const customer of customers) {
    if ([customer.name, ...customer.aliases].some((label) => includesPhrase(key, label))) found.set(customer.id, customer);
  }
  return [...found.values()];
}
