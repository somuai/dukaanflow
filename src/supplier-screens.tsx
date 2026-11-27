import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { openScreen, useApp } from './app-state';
import { formatPaise, parseRupees, type PaymentMethod } from './domain';
import { Action, Hint, Icon, Input, Nav, Row, Screen, Section, Title, Warning, colors, styles } from './ui';
import { listSupplierInvoices, newOperationId, type SupplierInvoice, type SupplierPaymentAllocationInput } from './store';

function SupplierBack() {
  const { t, busy } = useApp();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={t('Back', 'वापस')}
    onPress={() => { if (!busy && router.canGoBack()) router.back(); else if (!busy) router.replace('/(tabs)/suppliers'); }}
    style={({ pressed }) => [supplierStyles.back, pressed && { opacity: 0.55 }]}
  ><Icon name="back" size={21} /></Pressable>;
}

function normalized(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function payableLabel(balancePaise: number, t: (en: string, hi: string) => string) {
  if (balancePaise > 0) return t('Payable', 'देय');
  if (balancePaise < 0) return t('Supplier credit', 'सप्लायर के पास जमा');
  return t('Settled', 'चुकता');
}

function supplierAmount(balancePaise: number) {
  return formatPaise(Math.abs(balancePaise));
}

export function SupplierDirectory() {
  const app = useApp();
  const { t } = app;
  const totalPayable = app.suppliers.reduce((total, supplier) => total + Math.max(supplier.balancePaise, 0), 0);
  const suppliersWithPayable = app.suppliers.filter((supplier) => supplier.balancePaise > 0).length;
  return <Screen
    nav={<Nav left={<SupplierBack />} />}
    footer={app.suppliers.length ? <Action title={t('Add supplier', 'सप्लायर जोड़ें')} icon="plus" testID="add-supplier" disabled={app.busy} onPress={() => openScreen('supplier-new')} /> : undefined}
  >
    <Title title={t('Suppliers', 'सप्लायर')} subtitle={t('Deliveries, payments and what remains.', 'डिलीवरी, भुगतान और बाकी रकम।')} />
    {app.suppliers.length ? <View style={supplierStyles.summary}>
      <View><Text style={supplierStyles.eyebrow}>{t('OPEN PAYABLES', 'बाकी देय')}</Text><Text style={supplierStyles.summaryAmount}>{formatPaise(totalPayable)}</Text></View>
      <Text style={supplierStyles.summaryMeta}>{t(`${suppliersWithPayable} supplier${suppliersWithPayable === 1 ? '' : 's'} with an open payable`, `${suppliersWithPayable} सप्लायर को पैसे देने बाकी`)}</Text>
    </View> : null}
    {app.suppliers.length ? <View>
      <View style={supplierStyles.listHeading}><Section>{t('Supplier accounts', 'सप्लायर खाते')}</Section><Text style={supplierStyles.count}>{app.suppliers.length}</Text></View>
      {app.suppliers.map((supplier, index) => (
        <Row
          key={supplier.id}
          title={supplier.name}
          subtitle={`${payableLabel(supplier.balancePaise, t)} · ${supplier.deliveryCount} ${t('deliveries', 'डिलीवरी')}${supplier.aliases.length ? ` · ${supplier.aliases.join(', ')}` : ''}`}
          value={supplierAmount(supplier.balancePaise)}
          border={index < app.suppliers.length - 1}
          testID={`supplier-${supplier.id}`}
          onPress={() => {
            void app.run(async () => { await app.openSupplier(supplier.id); router.push('/(tabs)/suppliers/supplier'); }, t('Could not open this supplier. Try again.', 'सप्लायर खाता नहीं खुला। फिर कोशिश करें।'));
          }}
        />
      ))}
    </View> : <View style={supplierStyles.empty}>
      <Text style={supplierStyles.emptyTitle}>{t('Keep each seller’s account together', 'हर सप्लायर का हिसाब एक जगह रखें')}</Text>
      <Text style={supplierStyles.emptyText}>{t('Confirm a delivery or add a supplier profile to start a shop-specific invoice and payment history.', 'दुकान के बिल और भुगतान का इतिहास शुरू करने के लिए डिलीवरी की पुष्टि करें या सप्लायर प्रोफ़ाइल जोड़ें।')}</Text>
      <Action title={t('Add first supplier', 'पहला सप्लायर जोड़ें')} icon="plus" testID="add-supplier" onPress={() => openScreen('supplier-new')} />
    </View>}
    <View style={supplierStyles.note}><Hint>{t('Balances use confirmed invoices and payments. A supplier credit is shown separately from money owed.', 'बाकी रकम पुष्ट बिल और भुगतान से निकलती है। सप्लायर के पास जमा रकम अलग दिखाई जाती है।')}</Hint></View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function SupplierDetail() {
  const app = useApp();
  const { t } = app;
  const supplier = app.suppliers.find((item) => item.id === app.activeSupplierId);
  const deliveries = useMemo(() => supplier
    ? app.deliveries.filter((delivery) => normalized(delivery.supplier) === normalized(supplier.name)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [], [app.deliveries, supplier]);
  const stockReceipts = useMemo(() => supplier
    ? app.receipts.filter((receipt) => normalized(receipt.supplier ?? '') === normalized(supplier.name)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [], [app.receipts, supplier]);
  const reversedPaymentIds = new Set(app.supplierPaymentEvents.filter((event) => event.kind === 'reversal' && event.reversesEventId).map((event) => event.reversesEventId));
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const openInvoices = invoices.filter((invoice) => invoice.openPaise > 0);
  useEffect(() => {
    let active = true;
    if (supplier && app.mode) {
      void listSupplierInvoices(app.mode, supplier.id).then((next) => { if (active) setInvoices(next); }).catch(() => { if (active) setInvoices([]); });
    } else setInvoices([]);
    return () => { active = false; };
  }, [app.mode, app.deliveries, supplier?.id, app.supplierPaymentEvents]);

  if (!supplier) return <Screen nav={<Nav left={<SupplierBack />} />}><Text style={supplierStyles.emptyText}>{t('Select a supplier from the list first.', 'पहले सूची से सप्लायर चुनें।')}</Text></Screen>;
  return <Screen nav={<Nav left={<SupplierBack />} />} footer={<Action title={t('Record payment', 'भुगतान दर्ज करें')} icon="plus" testID="record-supplier-payment" disabled={app.busy} onPress={() => openScreen('supplier-payment')} />}>
    <Title title={supplier.name} subtitle={supplier.aliases.length ? `${t('Also known as', 'दूसरे नाम')} · ${supplier.aliases.join(', ')}` : t('Supplier account', 'सप्लायर खाता')} />
    <View style={supplierStyles.detailBalance}>
      <Text style={supplierStyles.eyebrow}>{supplier.balancePaise < 0 ? t('SUPPLIER CREDIT', 'सप्लायर के पास जमा') : t('OPEN PAYABLE', 'बाकी देय')}</Text>
      <Text style={supplierStyles.summaryAmount}>{supplierAmount(supplier.balancePaise)}</Text>
      <Text style={supplierStyles.summaryMeta}>{t('Calculated from confirmed invoices and payments', 'पुष्ट बिल और भुगतान से गणना')}</Text>
    </View>

    <Action title={t('Purchase orders', 'खरीद ऑर्डर')} icon="notes" kind="outline" testID="supplier-orders" onPress={() => router.push('/(tabs)/suppliers/orders')} />

    <Section>{t('Invoices and due dates', 'बिल और भुगतान की तारीखें')}</Section>
    {openInvoices.length ? openInvoices.map((invoice, index) => <Row
      key={invoice.invoiceId}
      title={invoice.invoiceNumber ? t(`Invoice ${invoice.invoiceNumber}`, `बिल ${invoice.invoiceNumber}`) : t('Supplier invoice', 'सप्लायर बिल')}
      subtitle={`${invoice.dueDate ? `${t('Due', 'अंतिम तारीख')} ${invoice.dueDate}` : t('No due date recorded', 'भुगतान की तारीख दर्ज नहीं')}${invoice.status === 'overdue' ? ` · ${t('Overdue', 'देरी से बाकी')}` : invoice.status === 'due_today' ? ` · ${t('Due today', 'आज देय')}` : ''}`}
      value={invoice.openPaise === 0 ? t('Settled', 'चुकता') : formatPaise(invoice.openPaise)}
      border={index < openInvoices.length - 1}
      testID={`supplier-invoice-${invoice.invoiceId}`}
    />) : <Text style={supplierStyles.emptyText}>{t('No open invoices.', 'कोई खुला बिल नहीं।')}</Text>}

    <Section>{t('Delivery history', 'डिलीवरी का इतिहास')}</Section>
    {deliveries.map((delivery, index) => <Row
      key={delivery.id}
      title={delivery.invoiceNumber ? t(`Invoice ${delivery.invoiceNumber}`, `बिल ${delivery.invoiceNumber}`) : t('Supplier delivery', 'सप्लायर डिलीवरी')}
      subtitle={`${delivery.businessDate} · ${delivery.lines.length} ${t('items', 'उत्पाद')}${delivery.reversedAt ? ` · ${t('Reversed', 'वापस ली')}` : ''}`}
      value={formatPaise(delivery.invoiceTotalPaise)}
      border={index < deliveries.length - 1 || stockReceipts.length > 0 || app.supplierPaymentEvents.length > 0}
      testID={`supplier-delivery-${delivery.id}`}
      onPress={() => { app.setActiveDeliveryId(delivery.id); openScreen('delivery'); }}
    />)}
    {stockReceipts.map((receipt, index) => <Row
      key={receipt.id}
      title={t('Stock receipt', 'स्टॉक रसीद')}
      subtitle={`${receipt.businessDate} · ${receipt.lines.length} ${t('items', 'उत्पाद')}${receipt.reversedAt ? ` · ${t('Reversed', 'वापस ली')}` : ''}`}
      value={t('Stock', 'स्टॉक')}
      border={index < stockReceipts.length - 1 || app.supplierPaymentEvents.length > 0}
      testID={`supplier-stock-receipt-${receipt.id}`}
    />)}
    {!deliveries.length && !stockReceipts.length ? <Text style={supplierStyles.emptyText}>{t('No confirmed deliveries yet.', 'अभी कोई पुष्टि की गई डिलीवरी नहीं।')}</Text> : null}

    {app.supplierPaymentEvents.length ? <View style={supplierStyles.paymentSection}>
      <Section>{t('Payments', 'भुगतान')}</Section>
      {app.supplierPaymentEvents.map((event, index) => {
        const reversed = event.kind === 'payment' && reversedPaymentIds.has(event.id);
        const canReverse = event.kind === 'payment' && !reversed;
        return <View key={event.id} style={supplierStyles.paymentRow}>
          <View style={supplierStyles.paymentCopy}>
            <Text style={supplierStyles.rowTitle}>{event.kind === 'reversal' ? t('Payment reversal', 'भुगतान वापस लिया') : t('Payment recorded', 'भुगतान दर्ज')}</Text>
            <Text style={supplierStyles.rowMeta}>{event.businessDate}{event.paymentMethod ? ` · ${event.paymentMethod.toUpperCase()}` : ''}{event.note ? ` · ${event.note}` : ''}{reversed ? ` · ${t('Reversed', 'वापस ली')}` : ''}</Text>
          </View>
          <Text style={[supplierStyles.paymentAmount, event.amountDeltaPaise > 0 && supplierStyles.reversalAmount]}>{event.amountDeltaPaise > 0 ? '+' : '−'}{formatPaise(event.amountPaise)}</Text>
          {canReverse ? <Pressable accessibilityRole="button" accessibilityLabel={t('Reverse supplier payment', 'सप्लायर भुगतान वापस लें')} testID={`reverse-supplier-payment-${event.id}`} onPress={() => Alert.alert(
            t('Reverse this payment?', 'यह भुगतान वापस लें?'),
            t('A linked correction will restore the supplier balance. The original entry stays in the history.', 'जुड़ा हुआ सुधार सप्लायर का खाता ठीक करेगा। पुरानी प्रविष्टि इतिहास में रहेगी।'),
            [{ text: t('Cancel', 'रद्द करें'), style: 'cancel' }, { text: t('Reverse', 'वापस लें'), style: 'destructive', onPress: () => void app.run(async () => { await app.reverseSupplierPayment(event.id, newOperationId()); }, t('Could not reverse this payment. Try again.', 'भुगतान वापस नहीं लिया जा सका। फिर कोशिश करें。')) }],
          )} style={supplierStyles.reverseButton}><Text style={supplierStyles.reverseText}>{t('Reverse', 'वापस लें')}</Text></Pressable> : null}
          {index < app.supplierPaymentEvents.length - 1 ? <View style={supplierStyles.rowDivider} /> : null}
        </View>;
      })}
    </View> : null}
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function SupplierNew() {
  const app = useApp();
  const { t } = app;
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const submit = () => {
    Keyboard.dismiss();
    void app.run(async () => {
      const supplier = await app.addSupplier({ name, aliases: aliases.split(/[,،\n]/u).map((value) => value.trim()).filter(Boolean) });
      router.replace('/(tabs)/suppliers/supplier');
      await app.openSupplier(supplier.id);
    }, t('Could not save this supplier. Check its name and aliases, then try again.', 'सप्लायर सेव नहीं हुआ। नाम और दूसरे नाम जाँचकर फिर कोशिश करें।'));
  };
  return <Screen nav={<Nav left={<SupplierBack />} />} footer={<Action title={t('Save supplier', 'सप्लायर सेव करें')} testID="save-supplier" disabled={app.busy || !name.trim()} onPress={submit} />}>
    <Title title={t('Add supplier', 'सप्लायर जोड़ें')} subtitle={t('Use the name your shop recognizes.', 'दुकान में पहचाने जाने वाला नाम लिखें।')} />
    <View style={styles.stack}>
      <Input label={t('Supplier name', 'सप्लायर का नाम')} placeholder={t('e.g. Sharma Wholesale', 'जैसे शर्मा होलसेल')} value={name} onChangeText={setName} maxLength={120} autoCorrect={false} spellCheck={false} testID="supplier-name" />
      <Input label={t('Spoken names or aliases · optional', 'बोलचाल के नाम · वैकल्पिक')} placeholder={t('Sharma ji, Sharma Foods', 'शर्मा जी, शर्मा फूड्स')} value={aliases} onChangeText={setAliases} maxLength={500} autoCorrect={false} spellCheck={false} testID="supplier-aliases" />
      <Hint>{t('An alias already linked to another supplier cannot be reused. DukaanFlow will not merge supplier accounts silently.', 'किसी दूसरे सप्लायर से जुड़ा नाम दोबारा नहीं जोड़ सकते। DukaanFlow खाते अपने-आप नहीं मिलाएगा।')}</Hint>
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

const paymentMethods: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer', 'other'];

export function SupplierPayment() {
  const app = useApp();
  const { t } = app;
  const supplier = app.suppliers.find((item) => item.id === app.activeSupplierId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [allocationInputs, setAllocationInputs] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (supplier && app.mode) {
      void listSupplierInvoices(app.mode, supplier.id).then((next) => { if (active) setInvoices(next.filter((invoice) => invoice.openPaise > 0)); }).catch(() => { if (active) setInvoices([]); });
    } else setInvoices([]);
    return () => { active = false; };
  }, [app.mode, supplier?.id]);
  const amountPaise = parseRupees(amount);
  const allocations: SupplierPaymentAllocationInput[] = invoices.flatMap((invoice) => {
    const entered = allocationInputs[invoice.invoiceId]?.trim();
    const parsed = entered ? parseRupees(entered) : null;
    return parsed !== null && parsed > 0 ? [{ invoiceId: invoice.invoiceId, amountPaise: parsed }] : [];
  });
  const allocatedPaise = allocations.reduce((total, entry) => total + entry.amountPaise, 0);
  const invalidAllocationInput = invoices.some((invoice) => allocationInputs[invoice.invoiceId]?.trim() && parseRupees(allocationInputs[invoice.invoiceId]) === null);
  const validAllocations = !invalidAllocationInput && allocations.every((entry) => entry.amountPaise <= (invoices.find((invoice) => invoice.invoiceId === entry.invoiceId)?.openPaise ?? 0))
    && (amountPaise === null || allocatedPaise <= amountPaise);
  const methodLabel = (entry: PaymentMethod) => entry === 'bank_transfer'
    ? t('Bank transfer', 'बैंक ट्रांसफर')
    : entry === 'cash' ? t('Cash', 'नकद') : entry.toUpperCase();

  const submit = () => {
    if (!supplier || amountPaise === null || amountPaise <= 0 || !method || !validAllocations) return;
    Keyboard.dismiss();
    void app.run(async () => {
      await app.saveSupplierPayment(newOperationId(), {
        supplierId: supplier.id, amountPaise, paymentMethod: method, note: note.trim() || null, allocations,
      });
      router.replace('/(tabs)/suppliers/supplier');
    }, t('Could not record this supplier payment. Check the amount and try again.', 'सप्लायर का भुगतान दर्ज नहीं हुआ। रकम जाँचकर फिर कोशिश करें।'));
  };

  if (!supplier) return <Screen nav={<Nav left={<SupplierBack />} />}><Text style={supplierStyles.emptyText}>{t('Select a supplier first.', 'पहले सप्लायर चुनें।')}</Text></Screen>;
  return <Screen nav={<Nav left={<SupplierBack />} />} footer={<Action title={t('Confirm payment', 'भुगतान की पुष्टि करें')} testID="confirm-supplier-payment" disabled={app.busy || amountPaise === null || amountPaise <= 0 || !method || !validAllocations} onPress={submit} />}>
    <Title title={t('Record payment', 'भुगतान दर्ज करें')} subtitle={supplier.name} />
    <View style={supplierStyles.paymentBalance}>
      <Text style={supplierStyles.eyebrow}>{t('CURRENT PAYABLE', 'अभी बाकी')}</Text>
      <Text style={supplierStyles.detailCaption}>{formatPaise(Math.max(supplier.balancePaise, 0))}</Text>
    </View>
    <View style={styles.stack}>
      <Input label={t('Amount paid (₹)', 'दिया गया भुगतान (₹)')} placeholder="0" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} testID="supplier-payment-amount" />
      {amount.trim() && amountPaise === null ? <Text style={supplierStyles.validation}>{t('Enter a valid amount.', 'सही रकम लिखें।')}</Text> : null}
      <Section>{t('Payment method', 'भुगतान का तरीका')}</Section>
      <View style={styles.group}>{paymentMethods.map((entry, index) => <Row key={entry} title={methodLabel(entry)} selected={method === entry} border={index < paymentMethods.length - 1} testID={`supplier-payment-method-${entry}`} onPress={() => setMethod(entry)} />)}</View>
      {invoices.length ? <>
        <Section>{t('Allocate to invoices · optional', 'बिलों में बाँटें · वैकल्पिक')}</Section>
        <Hint>{t('Enter amounts for the invoices this payment covers. Leave blank to keep all or part as unallocated supplier credit. No automatic FIFO allocation is applied.', 'इस भुगतान से चुकाए जा रहे बिलों की रकम भरें। सप्लायर क्रेडिट को बिना बाँटे रखने के लिए खाली छोड़ें। अपने-आप FIFO बाँट लागू नहीं होगा।')}</Hint>
        {invoices.map((invoice) => <Input key={invoice.invoiceId} label={`${invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : t('Invoice', 'बिल')} · ${invoice.dueDate ?? t('no due date', 'तारीख नहीं')} · ${t('open', 'बाकी')} ${formatPaise(invoice.openPaise)}`} placeholder="0" keyboardType="decimal-pad" value={allocationInputs[invoice.invoiceId] ?? ''} onChangeText={(value) => setAllocationInputs((current) => ({ ...current, [invoice.invoiceId]: value }))} testID={`payment-allocation-${invoice.invoiceId}`} />)}
        {amountPaise !== null && allocatedPaise < amountPaise ? <Hint>{t(`${formatPaise(amountPaise - allocatedPaise)} will remain unallocated supplier credit.`, `${formatPaise(amountPaise - allocatedPaise)} सप्लायर क्रेडिट के रूप में बिना बाँटी रहेगी।`)}</Hint> : null}
        {!validAllocations ? <Text style={supplierStyles.validation}>{invalidAllocationInput ? t('Enter a valid amount for each invoice allocation.', 'हर बिल में बाँटी गई रकम सही भरें।') : t('Allocations cannot exceed this payment or an invoice’s remaining amount.', 'बाँटी गई रकम भुगतान या बिल की बाकी रकम से अधिक नहीं हो सकती।')}</Text> : null}
      </> : null}
      <Input label={t('Note · optional', 'नोट · वैकल्पिक')} placeholder={t('Reference or context', 'संदर्भ या जानकारी')} value={note} onChangeText={setNote} maxLength={500} testID="supplier-payment-note" />
      {amountPaise !== null && amountPaise > Math.max(supplier.balancePaise, 0) ? <View style={supplierStyles.creditNote}><Text style={supplierStyles.creditNoteText}>{t('This is more than the open payable. The remaining amount will appear as supplier credit.', 'यह बाकी देय रकम से ज़्यादा है। अतिरिक्त रकम सप्लायर के पास जमा के रूप में दिखेगी।')}</Text></View> : null}
      <Hint>{t('This records the amount you confirm paying. It does not verify a bank or UPI transaction.', 'यह आपके द्वारा पुष्ट दिया गया भुगतान दर्ज करता है। बैंक या UPI लेन-देन की जाँच नहीं करता।')}</Hint>
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

const supplierStyles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  summary: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: -8, marginBottom: 16 },
  detailBalance: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: -8, marginBottom: 20 },
  paymentBalance: { padding: 14, borderRadius: 12, backgroundColor: '#EFEEE9', gap: 4, marginTop: -7, marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
  summaryAmount: { color: colors.ink, fontSize: 28, lineHeight: 35, fontWeight: '600', letterSpacing: -0.7, fontVariant: ['tabular-nums'], marginTop: 3 },
  summaryMeta: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'right' },
  detailCaption: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '500', fontVariant: ['tabular-nums'] },
  listHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 },
  count: { color: colors.muted, fontSize: 12 },
  empty: { gap: 10, marginTop: 18, paddingVertical: 12 },
  emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 18, marginVertical: 6 },
  note: { marginTop: 18, marginBottom: 12 },
  paymentSection: { marginTop: 22 },
  paymentRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  paymentCopy: { flex: 1, minWidth: 155, gap: 3 },
  rowTitle: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  rowMeta: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  paymentAmount: { color: colors.green, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  reversalAmount: { color: colors.action },
  reverseButton: { paddingHorizontal: 6, paddingVertical: 6 },
  reverseText: { color: colors.red, fontSize: 11, fontWeight: '600' },
  rowDivider: { height: 0 },
  validation: { color: colors.red, fontSize: 12, lineHeight: 16 },
  creditNote: { backgroundColor: '#F5EEE7', borderRadius: 10, padding: 10 },
  creditNoteText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
