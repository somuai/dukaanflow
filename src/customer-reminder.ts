import { formatPaise } from './domain.ts';
import type { ShopLanguage } from './store.ts';

export type CustomerReminderInput = {
  customerName: string;
  balancePaise: number;
  dueDateLabel: string | null;
  shopName: string;
  language: ShopLanguage;
};

export function buildCustomerReminderMessage(input: CustomerReminderInput): string | null {
  const customerName = input.customerName.trim();
  const shopName = input.shopName.trim();
  if (!customerName || !shopName || !Number.isSafeInteger(input.balancePaise) || input.balancePaise <= 0) return null;

  const amount = formatPaise(input.balancePaise);
  if (input.language === 'hi') {
    const due = input.dueDateLabel ? ` आपने ${input.dueDateLabel} तक देने की बात कही थी।` : '';
    return `नमस्ते ${customerName}, दुकान के पुष्ट हिसाब में ${amount} बाकी दिख रहा है।${due} सुविधा होने पर कृपया बताएं; अगर हिसाब अलग हो तो हमें बताइए। धन्यवाद, ${shopName}।`;
  }

  const due = input.dueDateLabel ? ` You had asked us to follow up by ${input.dueDateLabel}.` : '';
  return `Namaste ${customerName}, your confirmed shop ledger shows ${amount} still open.${due} When convenient, please let me know if this matches your records. Thank you, ${shopName}.`;
}
