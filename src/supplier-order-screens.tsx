import { useCallback, useMemo, useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useApp } from './app-state';
import { formatPaise, parseRupees } from './domain';
import {
  cancelSupplierOrder,
  linkDeliveryToSupplierOrder,
  listSupplierOrderLinkedDeliveryIds,
  listSupplierOrders,
  markSupplierOrderPlaced,
  newOperationId,
  readSupplierOrder,
  recordSupplierOrder,
  type SupplierOrder,
  type SupplierOrderLineInput,
  type SupplierOrderStatus,
} from './store';
import { Back, unitLabel } from './screens';
import { Action, Banner, Hint, Input, Nav, Row, Screen, Section, Title, Warning, colors, styles } from './ui';

const quantityLimit = 1_000_000;

function statusName(status: SupplierOrderStatus, t: (english: string, hindi: string) => string) {
  switch (status) {
    case 'draft': return t('Draft · not sent', 'ड्राफ़्ट · नहीं भेजा');
    case 'placed': return t('Placed', 'ऑर्डर दर्ज');
    case 'partially_received': return t('Part received', 'कुछ माल आया');
    case 'received': return t('Received', 'पूरा माल आया');
    case 'cancelled': return t('Cancelled', 'रद्द');
  }
}

function sameName(left: string, right: string) {
  return normalizeName(left) === normalizeName(right);
}

function normalizeName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function SupplierBack() {
  return <Back />;
}

export function SupplierOrders() {
  const app = useApp();
  const { t } = app;
  const supplier = app.suppliers.find((item) => item.id === app.activeSupplierId);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!app.mode || !supplier) return;
    setOrders(await listSupplierOrders(app.mode, supplier.id));
  }, [app.mode, supplier]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(() => setError(t('Could not load these orders.', 'ऑर्डर नहीं खुल सके।')));
  }, [refresh, t]));

  if (!supplier) return <Screen nav={<Nav left={<SupplierBack />} />}><Hint>{t('Select a supplier first.', 'पहले सप्लायर चुनें।')}</Hint></Screen>;
  return <Screen
    nav={<Nav left={<SupplierBack />} />}
    footer={<Action title={t('New order note', 'नया ऑर्डर नोट')} icon="plus" testID="supplier-order-new" disabled={app.busy} onPress={() => router.push('/(tabs)/suppliers/order-new')} />}
  >
    <Title title={t('Orders', 'ऑर्डर')} subtitle={supplier.name} />
    <Hint>{t('Save an order note first. Mark it placed only after you have actually placed it with the supplier. No supplier message is sent.', 'पहले ऑर्डर का नोट सेव करें। सप्लायर को वास्तव में ऑर्डर देने के बाद ही इसे दिया गया चिह्नित करें। कोई संदेश नहीं भेजा जाता।')}</Hint>
    {orders.length ? orders.map((order, index) => <Row
      key={order.id}
      title={`${order.lines.length} ${t('products', 'उत्पाद')} · ${statusName(order.status, t)}`}
      subtitle={`${order.expectedDate ? `${t('Expected', 'उम्मीद')} ${order.expectedDate} · ` : ''}${order.lines.reduce((total, line) => total + line.outstandingQuantity, 0)} ${t('still outstanding', 'अभी बाकी')}`}
      value={order.quotedTotalPaise === null ? undefined : formatPaise(order.quotedTotalPaise)}
      border={index < orders.length - 1}
      testID={`supplier-order-${order.id}`}
      onPress={() => router.push({ pathname: '/(tabs)/suppliers/order', params: { id: order.id } })}
    />) : <View style={orderStyles.empty}>
      <Text style={orderStyles.emptyTitle}>{t('No orders recorded', 'अभी कोई ऑर्डर दर्ज नहीं')}</Text>
      <Text style={orderStyles.body}>{t('Keep the quantities you intend to order here. Nothing is sent to the supplier.', 'ऑर्डर करने की इच्छित मात्रा यहाँ रखें। सप्लायर को कुछ नहीं भेजा जाता।')}</Text>
    </View>}
    <Hint>{t('Quoted value is an estimate. Only the confirmed invoice changes the supplier balance.', 'ऑर्डर की कीमत अनुमान है। सप्लायर का बाकी खाता केवल पुष्ट बिल से बदलेगा।')}</Hint>
    {error || app.problem ? <Warning>{error ?? app.problem}</Warning> : null}
  </Screen>;
}

export function SupplierOrderNew() {
  const app = useApp();
  const { t } = app;
  const supplier = app.suppliers.find((item) => item.id === app.activeSupplierId);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [expectedDate, setExpectedDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectedCount = Object.values(quantities).filter((value) => value.trim() && value !== '0').length;

  function submit() {
    if (!app.mode || !supplier) return;
    Keyboard.dismiss();
    const lines: SupplierOrderLineInput[] = [];
    for (const item of app.catalog) {
      const rawQuantity = quantities[item.id]?.trim() ?? '';
      if (!rawQuantity) continue;
      if (!/^\d+$/u.test(rawQuantity)) {
        setError(t('Enter whole-number quantities using each product’s listed unit.', 'हर उत्पाद की दिखाई गई इकाई में पूरी संख्या लिखें।'));
        return;
      }
      const quantity = Number(rawQuantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > quantityLimit) {
        setError(t('Enter a quantity from 1 to 10,00,000.', '1 से 10,00,000 तक की मात्रा लिखें।'));
        return;
      }
      const rawPrice = prices[item.id]?.trim() ?? '';
      const quotedUnitPricePaise = rawPrice ? parseRupees(rawPrice) : null;
      if (rawPrice && quotedUnitPricePaise === null) {
        setError(t('Check the quoted unit price or leave it blank.', 'भाव जाँचें या खाली छोड़ें।'));
        return;
      }
      lines.push({ catalogueItemId: item.id, quantity, quotedUnitPricePaise });
    }
    if (!lines.length) {
      setError(t('Enter at least one product quantity.', 'कम से कम एक उत्पाद की मात्रा लिखें।'));
      return;
    }
    setError(null);
    void app.run(async () => {
      const order = await recordSupplierOrder(app.mode!, newOperationId(), {
        supplierId: supplier.id,
        expectedDate: expectedDate.trim() || null,
        note: note.trim() || null,
        lines,
      });
      router.replace({ pathname: '/(tabs)/suppliers/order', params: { id: order.id } });
    }, t('Could not record this supplier order. Check the details and try again.', 'सप्लायर का ऑर्डर दर्ज नहीं हुआ। विवरण जाँचें।'));
  }

  if (!supplier) return <Screen nav={<Nav left={<SupplierBack />} />}><Hint>{t('Select a supplier first.', 'पहले सप्लायर चुनें।')}</Hint></Screen>;
  return <Screen nav={<Nav left={<SupplierBack />} />} footer={<Action title={t('Save draft', 'ड्राफ़्ट सेव करें')} testID="save-supplier-order" disabled={app.busy || selectedCount === 0} onPress={submit} />}>
    <Title title={t('New order note', 'नया ऑर्डर नोट')} subtitle={supplier.name} />
    <Banner title={t('Draft only · nothing is sent to the supplier', 'सिर्फ़ ड्राफ़्ट · सप्लायर को कुछ नहीं भेजा जाता')} />
    <Input label={t('Expected delivery · optional (YYYY-MM-DD)', 'माल आने की तारीख · वैकल्पिक (YYYY-MM-DD)')} value={expectedDate} onChangeText={setExpectedDate} placeholder="2026-11-28" maxLength={10} testID="order-expected-date" />
    <Input label={t('Note · optional', 'नोट · वैकल्पिक')} value={note} onChangeText={setNote} maxLength={500} testID="order-note" />
    <Section>{t('Products and ordered quantities', 'उत्पाद और ऑर्डर की मात्रा')}</Section>
    {app.catalog.length ? <View style={orderStyles.lines}>{app.catalog.map((item) => <View key={item.id} style={orderStyles.line}>
      <Text style={orderStyles.name}>{item.name}</Text>
      <Text style={orderStyles.meta}>{item.packSize} · {unitLabel(item.unit, 2, app.profile.language === 'hi')}</Text>
      <Input label={t(`Quantity (${unitLabel(item.unit, 2, app.profile.language === 'hi')})`, `मात्रा (${unitLabel(item.unit, 2, true)})`)} keyboardType="number-pad" value={quantities[item.id] ?? ''} onChangeText={(value) => setQuantities((current) => ({ ...current, [item.id]: value }))} maxLength={8} testID={`ordered-quantity-${item.id}`} />
      <Input label={t('Quoted unit price · optional (₹)', 'बताया गया प्रति इकाई भाव · वैकल्पिक (₹)')} keyboardType="decimal-pad" value={prices[item.id] ?? ''} onChangeText={(value) => setPrices((current) => ({ ...current, [item.id]: value }))} maxLength={16} testID={`order-quote-${item.id}`} />
    </View>)}</View> : <Hint>{t('Add products to the shop catalogue before recording an order.', 'ऑर्डर दर्ज करने से पहले उत्पाद सूची में उत्पाद जोड़ें।')}</Hint>}
    <Hint>{t('The quoted price is not an invoice and does not create a payable. No supplier message is sent.', 'बताया गया भाव बिल नहीं है और देय रकम नहीं बनाता। सप्लायर को कोई संदेश नहीं जाता।')}</Hint>
    {error || app.problem ? <Warning>{error ?? app.problem}</Warning> : null}
  </Screen>;
}

export function SupplierOrderDetail() {
  const app = useApp();
  const { t } = app;
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [linkedDeliveries, setLinkedDeliveries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!app.mode || !orderId) return;
    const [nextOrder, linked] = await Promise.all([
      readSupplierOrder(app.mode, orderId), listSupplierOrderLinkedDeliveryIds(app.mode),
    ]);
    setOrder(nextOrder);
    setLinkedDeliveries(linked);
  }, [app.mode, orderId]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(() => setError(t('Could not load this order.', 'ऑर्डर नहीं खुला।')));
  }, [refresh, t]));

  const candidates = useMemo(() => {
    if (!order) return [];
    const supplier = app.suppliers.find((item) =>
      [item.name, ...item.aliases].some((name) => sameName(name, order.supplier)));
    return app.deliveries.filter((delivery) => {
      const matchesSupplier = supplier
        ? [supplier.name, ...supplier.aliases].some((name) => sameName(name, delivery.supplier))
        : sameName(delivery.supplier, order.supplier);
      return matchesSupplier && !delivery.reversedAt && !linkedDeliveries.includes(delivery.id);
    });
  }, [app.deliveries, app.suppliers, linkedDeliveries, order]);

  function markPlaced() {
    if (!order || !app.mode) return;
    Alert.alert(
      t('Mark this order as placed?', 'क्या यह ऑर्डर दिया जा चुका है?'),
      t('This only updates your record. DukaanFlow will not contact the supplier.', 'इससे सिर्फ़ आपका रिकॉर्ड बदलेगा। DukaanFlow सप्लायर से संपर्क नहीं करेगा।'),
      [
        { text: t('Not yet', 'अभी नहीं'), style: 'cancel' },
        { text: t('Yes, placed', 'हाँ, दे दिया'), onPress: () => void app.run(async () => {
          await markSupplierOrderPlaced(app.mode!, order.id, newOperationId());
          await refresh();
        }, t('Could not update this order.', 'ऑर्डर अपडेट नहीं हुआ।')) },
      ],
    );
  }

  function cancel() {
    if (!order || !app.mode) return;
    Alert.alert(
      t(order.status === 'draft' ? 'Discard this draft?' : 'Cancel the remaining order?', order.status === 'draft' ? 'यह ड्राफ़्ट हटाएँ?' : 'बाकी ऑर्डर रद्द करें?'),
      t('Confirmed receipts and their stock and invoice records stay unchanged.', 'पुष्ट डिलीवरी, स्टॉक और बिल का रिकॉर्ड जस का तस रहेगा।'),
      [
        { text: t('Keep order', 'ऑर्डर रहने दें'), style: 'cancel' },
        { text: t(order.status === 'draft' ? 'Discard draft' : 'Cancel remaining', order.status === 'draft' ? 'ड्राफ़्ट हटाएँ' : 'बाकी रद्द करें'), style: 'destructive', onPress: () => void app.run(async () => {
          await cancelSupplierOrder(app.mode!, order.id, newOperationId());
          await refresh();
        }, t('Could not cancel the order.', 'ऑर्डर रद्द नहीं हो सका।')) },
      ],
    );
  }

  if (!order) return <Screen nav={<Nav left={<SupplierBack />} />}><Title title={t('Supplier order', 'सप्लायर ऑर्डर')} /><Hint>{error ?? t('Loading order…', 'ऑर्डर खुल रहा है…')}</Hint></Screen>;
  const canLink = order.status === 'placed' || order.status === 'partially_received';
  const canCancel = order.status === 'draft' || canLink;
  const totalOutstanding = order.lines.reduce((total, line) => total + line.outstandingQuantity, 0);
  return <Screen
    nav={<Nav left={<SupplierBack />} />}
    footer={order.status === 'draft' ? <View style={orderStyles.actions}>
      <Action title={t('Mark as placed', 'ऑर्डर दिया')} testID="mark-supplier-order-placed" disabled={app.busy} onPress={markPlaced} />
      <Action title={t('Discard draft', 'ड्राफ़्ट हटाएँ')} kind="outline" testID="cancel-supplier-order" disabled={app.busy} onPress={cancel} />
    </View> : canCancel ? <Action title={t('Cancel remaining order', 'बाकी ऑर्डर रद्द करें')} kind="outline" testID="cancel-supplier-order" disabled={app.busy} onPress={cancel} /> : undefined}
  >
    <Title title={t('Supplier order', 'सप्लायर ऑर्डर')} subtitle={`${order.supplier} · ${statusName(order.status, t)}`} />
    {order.status === 'draft' ? <Banner title={t('Draft · supplier has not been contacted', 'ड्राफ़्ट · सप्लायर से संपर्क नहीं हुआ')} /> : null}
    <View style={orderStyles.summary}>
      <Text style={orderStyles.eyebrow}>{order.status === 'cancelled' ? t('REMAINING WHEN CANCELLED', 'रद्द करते समय बाकी') : t('STILL OUTSTANDING', 'अभी बाकी')}</Text>
      <Text style={orderStyles.summaryValue}>{totalOutstanding} {t('units', 'इकाइयाँ')}</Text>
      {order.expectedDate ? <Text style={orderStyles.meta}>{t('Expected', 'उम्मीद')} · {order.expectedDate}</Text> : null}
      {order.note ? <Text style={orderStyles.meta}>{order.note}</Text> : null}
    </View>
    <Section>{t('Ordered products', 'ऑर्डर किए उत्पाद')}</Section>
    {order.lines.map((line, index) => <View key={line.position} style={orderStyles.line} testID={`order-line-${line.position}`}>
      <Text style={orderStyles.name}>{line.name} · {line.packSize}</Text>
      <Text style={orderStyles.meta}>{t('Ordered', 'ऑर्डर')}: {line.quantity} {unitLabel(line.unit, line.quantity, app.profile.language === 'hi')}</Text>
      <Text style={orderStyles.meta}>{t('Physically arrived', 'माल आया')}: {line.receivedQuantity} · {t('Still expected', 'अभी अपेक्षित')}: {line.outstandingQuantity}</Text>
      {line.excessQuantity > 0 ? <Text style={orderStyles.warning}>{t(`Extra beyond order: ${line.excessQuantity}`, `ऑर्डर से अधिक: ${line.excessQuantity}`)}</Text> : null}
      {line.quotedUnitPricePaise !== null ? <Text style={orderStyles.meta}>{t('Quoted unit price', 'बताया गया प्रति इकाई भाव')}: {formatPaise(line.quotedUnitPricePaise)}</Text> : null}
      {index < order.lines.length - 1 ? <View style={orderStyles.divider} /> : null}
    </View>)}
    {order.quotedTotalPaise !== null ? <Banner title={`${t('Quoted estimate', 'बताया गया अनुमान')} · ${formatPaise(order.quotedTotalPaise)}`} /> : null}
    <Hint>{t('Quotes are not supplier payables. Each confirmed invoice is recorded separately and determines the supplier balance.', 'बताया गया भाव देय रकम नहीं है। हर पुष्ट बिल अलग दर्ज होगा और सप्लायर का बाकी खाता उससे बनेगा।')}</Hint>
    {canLink ? <>
      <Section>{t('Link an existing confirmed receipt', 'पहले से पुष्ट रसीद जोड़ें')}</Section>
      {candidates.length ? candidates.map((delivery) => <Row
        key={delivery.id}
        title={delivery.invoiceNumber ? t(`Invoice ${delivery.invoiceNumber}`, `बिल ${delivery.invoiceNumber}`) : t('Supplier delivery', 'सप्लायर डिलीवरी')}
        subtitle={`${delivery.businessDate} · ${delivery.lines.length} ${t('items', 'उत्पाद')}`}
        value={formatPaise(delivery.invoiceTotalPaise)}
        border
        testID={`link-receipt-${delivery.id}`}
        onPress={() => void app.run(async () => {
          await linkDeliveryToSupplierOrder(app.mode!, newOperationId(), order.id, delivery.id);
          await refresh();
        }, t('Could not link this receipt. Check that supplier and product units match the order.', 'रसीद नहीं जुड़ी। सप्लायर और उत्पाद की इकाइयाँ जाँचें।'))}
      />) : <Hint>{t('No unlinked confirmed receipts from this supplier are available.', 'इस सप्लायर की कोई बिना जोड़ी पुष्ट रसीद नहीं है।')}</Hint>}
      <Hint>{t('Matching uses exact catalogue product and unit. Unmatched or substituted lines stay in the receipt history but are not counted against this order.', 'मिलान में वही उत्पाद और इकाई लगती है। अलग उत्पाद या बदली वस्तु रसीद में रहेगी, लेकिन इस ऑर्डर में नहीं गिनी जाएगी।')}</Hint>
    </> : null}
    {error || app.problem ? <Warning>{error ?? app.problem}</Warning> : null}
  </Screen>;
}

const orderStyles = StyleSheet.create({
  actions: { gap: 8 },
  empty: { gap: 7, paddingVertical: 24 },
  emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  lines: { gap: 12, marginTop: 10 },
  line: { gap: 6, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  warning: { color: colors.action, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  summary: { padding: 14, borderRadius: 12, backgroundColor: '#EFEEE9', gap: 4, marginTop: 12, marginBottom: 18 },
  eyebrow: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
  summaryValue: { color: colors.ink, fontSize: 24, lineHeight: 31, fontWeight: '600', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: 8 },
});
