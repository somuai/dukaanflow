import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { openScreen, useApp } from './app-state';
import { normalizeCustomerText } from './customer-identity';
import {
  AMOUNT_PAID_ISSUE,
  MIXED_EVENT_RECEIPT_ISSUE,
  MAX_QUANTITY,
  PAYMENT_METHOD_ISSUE,
  RECEIPT_TOTAL_ISSUE,
  emptyReceiptLine,
  formatPaise,
  parseReceipt,
  parseRupees,
  toReceiptInput,
  type CatalogItem,
  type PaymentMethod,
  type ReceiptInput,
  type ReceiptDraft,
  type ReceiptDraftLine,
  type StockUnit,
} from './domain';
import { newOperationId } from './store';
import { Back, displayDate, stockUnits, unitLabel, variantName } from './screens';
import { Action, Banner, Hint, Icon, IconButton, Input, Nav, Row, Screen, Section, Sheet, Title, Warning, colors, styles } from './ui';

type Localize = ReturnType<typeof useApp>['t'];

export function Capture() {
  const app = useApp();
  const { t } = app;
  const ios = Platform.OS === 'ios';
  const initialTranscript = useRef(app.transcript);
  const transcript = useRef(initialTranscript.current);
  const [hasTranscript, setHasTranscript] = useState(Boolean(transcript.current.trim()));
  useEffect(() => app.clearDraft, [app.clearDraft]);

  return (
    <Screen
      nav={<Nav left={<Back />} right={<IconButton icon="keyboard" label={t('Wispr Flow instructions', 'Wispr Flow के निर्देश')} onPress={() => {
        Keyboard.dismiss();
        openScreen('flow');
      }} />} />}
      footer={<Action title={t('Review receipt', 'रसीद जाँचें')} testID="capture-review" disabled={!hasTranscript} onPress={() => {
        const text = transcript.current;
        if (!text.trim()) return;
        Keyboard.dismiss();
        app.setProblem(null);
        const draft = parseReceipt(text, app.catalog);
        const normalizedTranscript = normalizeCustomerText(text);
        const mentions = app.suppliers.filter((supplier) => [supplier.name, ...supplier.aliases].some((alias) => {
          const normalizedAlias = normalizeCustomerText(alias);
          if (!normalizedAlias) return false;
          const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s+');
          return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])${escapedAlias}($|[^\\p{L}\\p{M}\\p{N}])`, 'u').test(normalizedTranscript);
        }));
        if (mentions.length === 1) draft.supplier = mentions[0].name;
        else if (mentions.length > 1) draft.supplier = null;
        app.setTranscript(text);
        app.setDraft(draft);
        openScreen('review');
      }} />}
    >
      <Title title={t('New receipt', 'नई रसीद')} subtitle={t('Describe what arrived at your shop.', 'बताएँ कि आपकी दुकान में क्या आया।')} />
      <Input
        label={t('Delivery details', 'डिलीवरी का विवरण')}
        testID="delivery-details"
        placeholder={t('e.g. Sharma se Maggi ke 12 packet aaye.', 'जैसे शर्मा से मैगी के 12 पैकेट आए।')}
        defaultValue={initialTranscript.current}
        onChangeText={(text) => {
          const hadText = Boolean(transcript.current.trim());
          const hasText = Boolean(text.trim());
          transcript.current = text;
          if (hadText !== hasText) setHasTranscript(hasText);
        }}
        maxLength={3000}
        autoCorrect={false}
        spellCheck={false}
        multiline
      />
      <View style={local.iconHint}>
        <Icon name={ios ? 'globe' : 'keyboard'} size={17} color={colors.action} />
        <Hint>{ios
          ? t('Select Flow from the globe key to dictate.', 'बोलकर लिखने के लिए ग्लोब बटन से Flow चुनें।')
          : t('Tap the Flow Bubble to dictate into this field.', 'यहाँ बोलकर लिखने के लिए Flow Bubble दबाएँ।')}</Hint>
      </View>
      <Action title={t('Enter items manually', 'उत्पाद खुद दर्ज करें')} icon="next" kind="text" testID="manual-entry" onPress={() => {
        Keyboard.dismiss();
        app.setProblem(null);
        openScreen('manual');
      }} />
    </Screen>
  );
}

function useDraftActions() {
  const app = useApp();
  function updateLine(id: string, patch: Partial<ReceiptDraftLine>) {
    app.setDraft((draft) => ({
      ...draft,
      lines: draft.lines.map((line) => line.id === id ? { ...line, ...patch } : line),
    }));
  }

  function removeLine(id: string) {
    app.setDraft((draft) => ({ ...draft, lines: draft.lines.filter((line) => line.id !== id) }));
  }

  return { updateLine, removeLine };
}

type Panel = { kind: 'product' | 'quantity' | 'unit' | 'line'; id: string } | { kind: 'metadata' };

function quantityValue(raw: string) {
  const normalized = raw.normalize('NFKC').replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966)).trim();
  const value = Number(normalized);
  return /^\d+$/u.test(normalized) && Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUANTITY ? value : null;
}

function ItemChoice({ line, close, useItem }: { line: ReceiptDraftLine; close: () => void; useItem: (item: CatalogItem) => void }) {
  const { t, catalog } = useApp();
  const candidates = catalog.filter((entry) => line.candidateIds.includes(entry.id));
  const [all, setAll] = useState(candidates.length === 0 || !!line.catalogItemId);
  const [selected, setSelected] = useState(line.catalogItemId);
  const [search, setSearch] = useState('');
  const options = (all ? catalog : candidates).filter((entry) => !search.trim() || [
    entry.name, entry.packSize, ...entry.aliases,
  ].some((value) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const chosen = options.find((item) => item.id === selected);
  const variants = !all && candidates.length > 1 && candidates.every((item) => item.name === candidates[0].name);
  const title = variants ? t(`Which ${line.label.charAt(0).toUpperCase() + line.label.slice(1)} pack arrived?`, 'कौन-सा पैक आया?') : t('Choose a product', 'उत्पाद चुनें');
  const chooseLabel = chosen && variants ? t(`Use ${chosen.packSize} pack`, `${chosen.packSize} पैक चुनें`) : t('Use this product', 'यह उत्पाद चुनें');

  return (
    <Sheet title={title} subtitle={line.label || undefined} cancel={t('Cancel', 'रद्द करें')} close={close}>
      {all && catalog.length > 6 ? <Input label={t('Find product', 'उत्पाद खोजें')} value={search} onChangeText={setSearch} /> : null}
      {options.length > 0 ? (
        <View style={styles.group}>
          {options.map((item, index) => (
            <Row
              key={item.id}
              title={variants ? t(`${item.packSize} pack`, `${item.packSize} पैक`) : variantName(item.name, item.packSize)}
              selected={item.id === selected}
              border={index < options.length - 1}
              onPress={() => setSelected(item.id)}
              testID={`catalog-item-${item.id}`}
            />
          ))}
        </View>
      ) : <Hint>{all && search ? t('No matching products.', 'कोई उत्पाद नहीं मिला।') : t('Add this variant to your catalogue first.', 'पहले इसे अपनी उत्पाद सूची में जोड़ें।')}</Hint>}
      {options.length > 0 ? <Action title={chooseLabel} testID="use-catalog-item" disabled={!chosen} onPress={() => { if (chosen) useItem(chosen); }} /> : null}
      {!all
        ? <Action title={t('Show all products', 'सभी उत्पाद देखें')} kind="text" onPress={() => setAll(true)} />
        : <Action title={t('Add a product', 'उत्पाद जोड़ें')} icon="plus" kind="text" onPress={() => {
          Keyboard.dismiss();
          close();
          openScreen('product-in-flow');
        }} />}
    </Sheet>
  );
}

function UnitChoice({ unit, close, useUnit }: { unit: StockUnit | null; close: () => void; useUnit: (unit: StockUnit) => void }) {
  const { t, profile } = useApp();
  const [selected, setSelected] = useState(unit);
  return (
    <Sheet title={t('Choose a unit', 'इकाई चुनें')} cancel={t('Cancel', 'रद्द करें')} close={close}>
      <View style={styles.group}>
        {stockUnits.map((entry, index) => (
          <Row
            key={entry}
            title={unitLabel(entry, 2, profile.language === 'hi')}
            selected={selected === entry}
            onPress={() => setSelected(entry)}
            border={index < stockUnits.length - 1}
            testID={`unit-${entry}`}
          />
        ))}
      </View>
      <Action title={t('Use this unit', 'यह इकाई चुनें')} testID="use-unit" disabled={!selected} onPress={() => { if (selected) useUnit(selected); }} />
    </Sheet>
  );
}

function QuantitySheet({ quantity, close, useQuantity }: { quantity: number | null; close: () => void; useQuantity: (quantity: number) => void }) {
  const { t } = useApp();
  const [raw, setRaw] = useState(quantity === null ? '' : String(quantity));
  const parsed = quantityValue(raw);
  return (
    <Sheet title={t('Check the quantity', 'मात्रा जाँचें')} cancel={t('Cancel', 'रद्द करें')} close={close}>
      <Input label={t('Quantity', 'मात्रा')} keyboardType="number-pad" value={raw} onChangeText={setRaw} maxLength={12} />
      {raw.trim() && parsed === null ? <Hint>{t('Enter a whole number from 1 to 10,00,000.', '1 से 10,00,000 तक पूरी संख्या भरें।')}</Hint> : null}
      <Action title={t('Use this quantity', 'यह मात्रा चुनें')} disabled={parsed === null} onPress={() => {
        if (parsed !== null) useQuantity(parsed);
      }} />
    </Sheet>
  );
}

type MetadataPatch = Pick<ReceiptDraft, 'supplier' | 'receiptTotalPaise' | 'amountPaidPaise' | 'paymentMethod' | 'issues'>;

const payments: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer', 'other'];

function paymentName(method: PaymentMethod, t: Localize) {
  const names: Record<PaymentMethod, string> = {
    cash: t('Cash', 'नकद'),
    upi: 'UPI',
    card: t('Card', 'कार्ड'),
    bank_transfer: t('Bank transfer', 'बैंक ट्रांसफर'),
    other: t('Other', 'अन्य'),
  };
  return names[method];
}

function MetadataForm({ close, apply, draft, embedded = false }: { close: () => void; apply: (next: MetadataPatch) => void; draft: ReceiptDraft; embedded?: boolean }) {
  const { t } = useApp();
  const [supplier, setSupplier] = useState(draft.supplier ?? '');
  const [total, setTotal] = useState(draft.receiptTotalPaise === null ? '' : String(draft.receiptTotalPaise / 100));
  const [paid, setPaid] = useState(draft.amountPaidPaise === null ? '' : String(draft.amountPaidPaise / 100));
  const [method, setMethod] = useState(draft.paymentMethod);
  const [unknownFields, setUnknownFields] = useState<string[]>([]);
  const totalPaise = parseRupees(total);
  const paidPaise = parseRupees(paid);
  const invalidTotal = !!total.trim() && totalPaise === null;
  const invalidPaid = !!paid.trim() && paidPaise === null;

  function allowUnknown(issue: string) {
    setUnknownFields((current) => [...current, issue]);
  }

  function finish() {
    Keyboard.dismiss();
    const resolved = [
      ...unknownFields,
      totalPaise !== null ? RECEIPT_TOTAL_ISSUE : '',
      paidPaise !== null ? AMOUNT_PAID_ISSUE : '',
      method !== null ? PAYMENT_METHOD_ISSUE : '',
    ];
    apply({
      supplier: supplier.trim() || null,
      receiptTotalPaise: totalPaise,
      amountPaidPaise: paidPaise,
      paymentMethod: method,
      issues: draft.issues.filter((issue) => !resolved.includes(issue)),
    });
  }

  function issueVisible(issue: string) {
    return draft.issues.includes(issue) && !unknownFields.includes(issue);
  }

  const contents = (
    <View style={styles.stack}>
      <Input label={t('Supplier (optional)', 'सप्लायर (वैकल्पिक)')} testID="receipt-supplier" value={supplier} onChangeText={setSupplier} maxLength={100} />
      <Input label={t('Receipt total (₹)', 'बिल की कुल राशि (₹)')} testID="receipt-total" value={total} onChangeText={setTotal} keyboardType="decimal-pad" maxLength={16} />
      {invalidTotal ? <Warning>{t('Enter a valid receipt total.', 'बिल की सही कुल राशि भरें।')}</Warning> : null}
      {totalPaise === null && issueVisible(RECEIPT_TOTAL_ISSUE) ? <Action title={t('Mark total unknown', 'कुल राशि अज्ञात रखें')} kind="text" onPress={() => { setTotal(''); allowUnknown(RECEIPT_TOTAL_ISSUE); }} /> : null}
      <Input label={t('Amount paid (₹)', 'दी गई राशि (₹)')} testID="receipt-paid" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" maxLength={16} />
      {invalidPaid ? <Warning>{t('Enter a valid payment amount.', 'सही भुगतान राशि भरें।')}</Warning> : null}
      {paidPaise === null && issueVisible(AMOUNT_PAID_ISSUE) ? <Action title={t('Mark amount paid unknown', 'दी गई राशि अज्ञात रखें')} kind="text" onPress={() => { setPaid(''); allowUnknown(AMOUNT_PAID_ISSUE); }} /> : null}
      <View style={{ gap: 6 }}>
        <Text style={styles.fieldLabel}>{t('Payment method (optional)', 'भुगतान का तरीका (वैकल्पिक)')}</Text>
        <View style={styles.group}>
          <Row title={t('Unknown', 'अज्ञात')} selected={method === null} onPress={() => { setMethod(null); allowUnknown(PAYMENT_METHOD_ISSUE); }} />
          {payments.map((entry, index) => <Row
            title={paymentName(entry, t)}
            selected={method === entry}
            onPress={() => setMethod(entry)}
            border={index < payments.length - 1}
            key={entry}
          />)}
        </View>
      </View>
    </View>
  );
  const done = <Action title={t('Apply details', 'विवरण लागू करें')} testID="apply-metadata" disabled={invalidTotal || invalidPaid} onPress={finish} />;

  useEffect(() => {
    if (!embedded) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      close();
      return true;
    });
    return () => subscription.remove();
  }, [close, embedded]);

  if (embedded) {
    return (
      <Screen nav={<Nav left={<IconButton icon="back" label={t('Back', 'वापस')} onPress={() => { Keyboard.dismiss(); close(); }} />} />} footer={done}>
        <Title title={t('Supplier and payment', 'सप्लायर और भुगतान')} />
        {contents}
      </Screen>
    );
  }
  return <Sheet title={t('Supplier and payment', 'सप्लायर और भुगतान')} cancel={t('Cancel', 'रद्द करें')} close={close}>{contents}{done}</Sheet>;
}

function EditorPanel({ panel, close, setPanel }: {
  panel: Exclude<Panel, { kind: 'metadata' }>;
  close: () => void;
  setPanel?: (panel: Panel) => void;
}) {
  const app = useApp();
  const { updateLine, removeLine } = useDraftActions();
  const { t } = app;
  const line = app.draft.lines.find((item) => item.id === panel.id);
  if (!line) return null;
  if (panel.kind === 'line') {
    return (
      <Sheet title={t('Edit item', 'उत्पाद बदलें')} cancel={t('Cancel', 'रद्द करें')} close={close}>
        <View style={styles.group}>
          <Row title={t('Change product or pack size', 'उत्पाद या पैक का आकार बदलें')} onPress={() => setPanel?.({ kind: 'product', id: line.id })} />
          <Row title={t('Change quantity', 'मात्रा बदलें')} onPress={() => setPanel?.({ kind: 'quantity', id: line.id })} />
          <Row title={t('Change unit', 'इकाई बदलें')} border={false} onPress={() => setPanel?.({ kind: 'unit', id: line.id })} />
        </View>
        {app.draft.lines.length > 1 ? <Action title={t('Remove item', 'उत्पाद हटाएँ')} kind="destructive" onPress={() => { removeLine(line.id); close(); }} /> : null}
      </Sheet>
    );
  }
  if (panel.kind === 'product') return <ItemChoice line={line} close={close} useItem={(item) => {
    updateLine(line.id, { catalogItemId: item.id });
    close();
  }} />;
  if (panel.kind === 'unit') return <UnitChoice unit={line.unit} close={close} useUnit={(unit) => {
    updateLine(line.id, { unit });
    close();
  }} />;
  return <QuantitySheet quantity={line.quantity} close={close} useQuantity={(quantity) => {
    updateLine(line.id, { quantity });
    close();
  }} />;
}

export function Manual() {
  const app = useApp();
  const { t } = app;
  const { updateLine, removeLine } = useDraftActions();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [rawQuantities, setRawQuantities] = useState<Record<string, string>>({});
  const close = () => setPanel(null);
  const hindi = app.profile.language === 'hi';

  if (panel?.kind === 'metadata') return <MetadataForm embedded close={close} draft={app.draft} apply={(next) => {
    app.setDraft((current) => ({ ...current, ...next }));
    close();
  }} />;

  return (
    <Screen nav={<Nav left={<Back />} />} footer={<Action title={t('Review receipt', 'रसीद जाँचें')} testID="manual-review" onPress={() => {
      Keyboard.dismiss();
      app.setProblem(null);
      openScreen('review');
    }} />}>
      <Title title={t('Enter items', 'उत्पाद दर्ज करें')} subtitle={t('Enter the goods you actually received.', 'जो माल आया है, उसका विवरण भरें।')} />
      <View style={styles.stack}>
        {app.draft.lines.map((line, index) => {
          const item = app.catalog.find((entry) => entry.id === line.catalogItemId);
          const raw = rawQuantities[line.id] ?? (line.quantity === null ? '' : String(line.quantity));
          return (
            <View key={line.id} style={local.manualItem}>
              {app.draft.lines.length > 1 ? <Section>{t(`Item ${index + 1}`, `उत्पाद ${index + 1}`)}</Section> : null}
              <View style={local.fieldBlock}>
                <Text style={styles.fieldLabel}>{t('Product', 'उत्पाद')}</Text>
                <View style={local.inputRow}>
                  <Row title={item ? variantName(item.name, item.packSize) : t('Choose a product', 'उत्पाद चुनें')} border={false} testID={`manual-product-${index}`} onPress={() => { Keyboard.dismiss(); setPanel({ kind: 'product', id: line.id }); }} />
                </View>
              </View>
              <Input label={t('Quantity', 'मात्रा')} testID={`manual-quantity-${index}`} value={raw} keyboardType="number-pad" onChangeText={(value) => {
                setRawQuantities((current) => ({ ...current, [line.id]: value }));
                updateLine(line.id, { quantity: quantityValue(value) });
              }} maxLength={12} />
              {raw && quantityValue(raw) === null ? <Hint>{t('Enter a whole number from 1 to 10,00,000.', '1 से 10,00,000 तक पूरी संख्या भरें।')}</Hint> : null}
              <View style={local.fieldBlock}>
                <Text style={styles.fieldLabel}>{t('Unit', 'इकाई')}</Text>
                <View style={local.inputRow}>
                  <Row title={line.unit ? unitLabel(line.unit, 2, hindi) : t('Choose a unit', 'इकाई चुनें')} border={false} testID={`manual-unit-${index}`} onPress={() => { Keyboard.dismiss(); setPanel({ kind: 'unit', id: line.id }); }} />
                </View>
              </View>
              {app.draft.lines.length > 1 ? <Action title={t('Remove item', 'उत्पाद हटाएँ')} kind="text" onPress={() => removeLine(line.id)} /> : null}
            </View>
          );
        })}
      </View>
      <Action title={t('Add another item', 'एक और उत्पाद जोड़ें')} icon="plus" kind="text" onPress={() => {
        const line = emptyReceiptLine(newOperationId());
        app.setDraft((draft) => ({ ...draft, lines: [...draft.lines, line] }));
      }} />
      <Row title={t('Supplier and payment', 'सप्लायर और भुगतान')} subtitle={t('Optional', 'वैकल्पिक')} onPress={() => { Keyboard.dismiss(); setPanel({ kind: 'metadata' }); }} />
      {panel ? <EditorPanel panel={panel} close={close} setPanel={setPanel} /> : null}
    </Screen>
  );
}

function paymentLabels(values: Pick<ReceiptInput, 'receiptTotalPaise' | 'amountPaidPaise' | 'paymentMethod'>, t: Localize) {
  return {
    total: values.receiptTotalPaise === null ? t('Unknown', 'अज्ञात') : formatPaise(values.receiptTotalPaise),
    paid: values.amountPaidPaise === null ? t('Unknown', 'अज्ञात') : formatPaise(values.amountPaidPaise),
    method: values.paymentMethod === null ? t('Amount paid', 'दी गई राशि')
      : values.paymentMethod === 'cash' ? t('Paid in cash', 'नकद दिया')
        : t(`Paid via ${paymentName(values.paymentMethod, t)}`, `${paymentName(values.paymentMethod, t)} से दिया`),
  };
}

function PaymentRows({ values, edit }: { values: Pick<ReceiptInput, 'receiptTotalPaise' | 'amountPaidPaise' | 'paymentMethod'>; edit?: () => void }) {
  const { t } = useApp();
  const labels = paymentLabels(values, t);
  return (
    <View style={local.section}>
      <Section>{t('Payment', 'भुगतान')}</Section>
      <Row title={t('Receipt total', 'बिल की कुल राशि')} value={labels.total} onPress={edit} />
      <Row title={labels.method} value={labels.paid} onPress={edit} />
      {values.paymentMethod === null && values.amountPaidPaise !== null
        ? <Hint>{t('Payment method unknown.', 'भुगतान का तरीका अज्ञात है।')}</Hint>
        : null}
    </View>
  );
}

export function Review() {
  const app = useApp();
  const { t } = app;
  const [panel, setPanel] = useState<Panel | null>(null);
  const { removeLine } = useDraftActions();
  const close = () => setPanel(null);
  const receipt = toReceiptInput(app.draft, app.catalog);
  const hindi = app.profile.language === 'hi';
  const hasPackChoice = app.draft.lines.some((line) => line.catalogItemId === null && line.candidateIds.length > 1);
  const visibleMoneyIssues = [
    app.draft.receiptTotalPaise === null && app.draft.issues.includes(RECEIPT_TOTAL_ISSUE) ? t('Check the receipt total.', 'बिल की कुल राशि जाँचें।') : null,
    app.draft.amountPaidPaise === null && app.draft.issues.includes(AMOUNT_PAID_ISSUE) ? t('Check the amount paid.', 'दी गई राशि जाँचें।') : null,
    app.draft.paymentMethod === null && app.draft.issues.includes(PAYMENT_METHOD_ISSUE) ? t('Check the payment method.', 'भुगतान का तरीका जाँचें।') : null,
  ].filter((value): value is string => value !== null);
  const mixedActivityDetected = app.draft.issues.includes(MIXED_EVENT_RECEIPT_ISSUE);

  if (panel?.kind === 'metadata') return <MetadataForm embedded close={close} draft={app.draft} apply={(next) => {
    app.setDraft((current) => ({ ...current, ...next }));
    close();
  }} />;

  return (
    <Screen nav={(
      <Nav left={<Back />} right={app.transcript ? (
        <Action title={t('Edit text', 'विवरण बदलें')} kind="text" onPress={() => router.dismissTo('/(tabs)/deliveries/capture')} />
      ) : undefined} />
    )} footer={(
      <>
        {app.problem ? <Warning>{app.problem}</Warning> : null}
        {!receipt && !app.problem ? <Hint>{hasPackChoice ? t('Choose a pack size to save.', 'सहेजने के लिए पैक का आकार चुनें।') : t('Check the highlighted fields to save.', 'सहेजने के लिए चिह्नित जगहें जाँचें।')}</Hint> : null}
        <Action title={app.busy ? t('Saving…', 'सहेज रहे हैं…') : t('Save receipt', 'रसीद सहेजें')} testID="save-receipt" disabled={!receipt || app.busy} onPress={() => { if (receipt) app.save(receipt); }} />
      </>
    )}>
      <Title title={t('Review receipt', 'रसीद जाँचें')} subtitle={[app.draft.supplier, t('Today', 'आज')].filter(Boolean).join(' · ')} />
      {mixedActivityDetected ? <Warning testID="mixed-receipt-activity-warning">
        {t('This note includes customer activity. Go back and use the Home note so supplier stock and customer records stay separate.', 'इस नोट में ग्राहक की बात भी है। वापस जाकर Home नोट इस्तेमाल करें, ताकि सप्लायर का स्टॉक और ग्राहक का रिकॉर्ड अलग रहें।')}
      </Warning> : null}
      <Section>{t('Items received', 'आया हुआ माल')}</Section>
      {app.draft.lines.map((line, index) => {
        const item = app.catalog.find((entry) => entry.id === line.catalogItemId);
        const label = item ? variantName(item.name, item.packSize)
          : app.catalog.find((entry) => entry.id === line.candidateIds[0])?.name
            || (line.id === 'line-unclassified' ? t('Unclassified activity', 'वर्गीकृत नहीं हुई बात') : line.label)
            || t(`Item ${index + 1}`, `उत्पाद ${index + 1}`);
        const value = line.quantity === null ? undefined
          : line.unit ? `${line.quantity} ${unitLabel(line.unit, line.quantity, hindi)}` : String(line.quantity);
        const incompatibleUnit = !!item && line.unit !== item.unit;
        return (
          <View key={line.id} style={local.reviewItem}>
            <Row title={label} value={value} onPress={item ? () => setPanel({ kind: 'line', id: line.id }) : undefined} />
            {!item ? <Warning
              testID={`choose-item-${index}`}
              onPress={() => setPanel({ kind: 'product', id: line.id })}
            >{line.candidateIds.length > 1 ? t('Choose pack size', 'पैक का आकार चुनें') : t('Choose the exact product', 'सही उत्पाद चुनें')}</Warning> : null}
            {line.quantity === null ? <Warning onPress={() => setPanel({ kind: 'quantity', id: line.id })}>{t('Check the quantity', 'मात्रा जाँचें')}</Warning> : null}
            {!line.unit || incompatibleUnit ? <Warning onPress={() => setPanel({ kind: 'unit', id: line.id })}>
              {item ? t(`Choose ${unitLabel(item.unit, 2, false)} for this variant`, `इस उत्पाद की इकाई चुनें: ${unitLabel(item.unit, 2, true)}`) : t('Choose the unit', 'इकाई चुनें')}
            </Warning> : null}
            {!item && app.draft.lines.length > 1 ? <Action title={t('Remove item', 'उत्पाद हटाएँ')} kind="text" onPress={() => removeLine(line.id)} /> : null}
          </View>
        );
      })}
      <PaymentRows values={app.draft} edit={() => setPanel({ kind: 'metadata' })} />
      {visibleMoneyIssues.map((issue) => <Warning key={issue} onPress={() => setPanel({ kind: 'metadata' })}>{issue}</Warning>)}
      {app.draft.supplier && app.draft.supplier.length > 100
        ? <Warning onPress={() => setPanel({ kind: 'metadata' })}>{t('Shorten the supplier name to 100 characters.', 'सप्लायर का नाम 100 अक्षर तक रखें।')}</Warning>
        : null}
      <Action title={t('Edit supplier and payment', 'सप्लायर और भुगतान बदलें')} kind="text" onPress={() => setPanel({ kind: 'metadata' })} />
      {panel ? <EditorPanel panel={panel} close={close} setPanel={setPanel} /> : null}
    </Screen>
  );
}

export function ReceiptDetail() {
  const app = useApp();
  const { t } = app;
  const record = app.receipts.find((entry) => entry.id === app.activeId);
  const [reverse, setReverse] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const close = () => setReverse(false);
  useFocusEffect(useCallback(() => () => { void Speech.stop(); }, []));

  if (!record) {
    return <Screen nav={<Nav left={<Back />} />}><Title title={t('Receipt details', 'रसीद का विवरण')} /><Hint>{t('This receipt could not be found.', 'यह रसीद नहीं मिली।')}</Hint></Screen>;
  }

  function speak() {
    if (!record) return;
    setSpeechError(false);
    const hindi = app.profile.language === 'hi';
    const lines = record.lines.map((item) => `${item.name}, ${item.packSize}, ${item.quantity} ${unitLabel(item.unit, item.quantity, hindi)}`);
    const labels = paymentLabels(record, t);
    const parts = [
      record.reversedAt ? t('Reversed receipt.', 'वापस ली गई रसीद।') : t('Saved receipt.', 'सहेजी गई रसीद।'),
      record.supplier,
      ...lines,
      record.receiptTotalPaise === null ? null : `${t('Receipt total', 'बिल की कुल राशि')} ${labels.total}.`,
      record.amountPaidPaise === null ? null : `${labels.method} ${labels.paid}.`,
    ];
    void Speech.stop().then(() => Speech.speak(parts.filter(Boolean).join(' '), {
      language: hindi ? 'hi-IN' : 'en-IN',
      onError: () => setSpeechError(true),
    })).catch(() => setSpeechError(true));
  }

  const hindi = app.profile.language === 'hi';
  return (
    <Screen nav={<Nav left={<Back />} />} footer={!record.reversedAt ? (
      <Action title={t('Reverse receipt', 'रसीद वापस लें')} kind="outline" testID="reverse-receipt" onPress={() => { app.setProblem(null); setReverse(true); }} />
    ) : undefined}>
      <Title title={t('Receipt details', 'रसीद का विवरण')} subtitle={[record.supplier, displayDate(record.businessDate, hindi)].filter(Boolean).join(' · ')} />
      <Banner title={record.reversedAt ? t('Receipt reversed', 'रसीद वापस ली गई') : t('Saved on this device', 'इस डिवाइस पर सहेजी गई')} />
      <View style={local.section}>
        <Section>{t('Items received', 'आया हुआ माल')}</Section>
        {record.lines.map((item, index) => <Row key={index} title={variantName(item.name, item.packSize)} value={`${item.quantity} ${unitLabel(item.unit, item.quantity, hindi)}`} />)}
      </View>
      <PaymentRows values={record} />
      <Action title={t('Read receipt aloud', 'रसीद सुनें')} kind="text" onPress={speak} />
      {speechError ? <Hint>{t('Spoken playback is unavailable.', 'रसीद को सुनाना अभी उपलब्ध नहीं है।')}</Hint> : null}
      {reverse ? (
        <Sheet title={t('Reverse this receipt?', 'रसीद वापस लें?')} cancel={t('Cancel', 'रद्द करें')} close={close}>
          <Hint>{t('The receipt stays in history. The quantities recorded by this receipt are reversed.', 'रसीद इतिहास में रहेगी। इस रसीद में दर्ज मात्रा वापस हो जाएगी।')}</Hint>
          {app.problem ? <Warning>{app.problem}</Warning> : null}
          <Action title={app.busy ? t('Reversing…', 'वापस ले रहे हैं…') : t('Reverse receipt', 'रसीद वापस लें')} kind="destructive" disabled={app.busy} onPress={() => app.reverse(record.id, close)} testID="confirm-reversal" />
        </Sheet>
      ) : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  iconHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, marginBottom: 8 },
  fieldBlock: { gap: 6 },
  inputRow: { borderWidth: 1, borderColor: colors.outline, borderRadius: 12, backgroundColor: colors.sheet, overflow: 'hidden' },
  manualItem: { gap: 12 },
  reviewItem: { gap: 5, marginBottom: 4 },
  section: { marginTop: 19, marginBottom: 4 },
});
