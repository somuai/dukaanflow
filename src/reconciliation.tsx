import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Device from 'expo-device';
import { extractInvoice, joinInvoiceOCRBlocks, type ExtractedInvoice, type ExtractedInvoiceLine } from './invoice-domain';
import { discardUncommittedScan, resolveSavedInvoicePage } from './invoice-evidence';
import { openScreen, useApp } from './app-state';
import { MAX_QUANTITY, formatPaise, parseRupees } from './domain';
import {
  closeSupplierClaim, createSupplierClaim, listDeliveryLotReceipts, listDeliveryLotRejections, listSupplierClaims, newOperationId,
  recordSupplierClaimCreditNote, recordSupplierClaimReplacement, recordSupplierClaimResponse,
  recordSupplierClaimReturn, rejectDeliveryLot, reverseDeliveryLotRejection,
  reverseSupplierClaimCreditNote, reverseSupplierClaimReturn,
  type DeliveryLotReceiptSummary, type DeliveryLotRejectionEvent, type DeliveryReconciliationLineInput, type SupplierClaim, type SupplierClaimKind,
} from './store';
import { suggestDictatedDeliveryCounts } from './wispr-reconciliation';
import { deleteInvoiceScan, resolveInvoiceFixtureUri, recognizeInvoiceImage, scanInvoice } from '../modules/invoice-ocr/src';
import { Back, displayDate, variantName } from './screens';
import { Action, Banner, Hint, Input, Nav, Row, Screen, Section, Sheet, Title, Warning, colors, styles } from './ui';

type LotFields = { quantity: string; batchCode: string; expiryDate: string };
type CountFields = { billed: string; good: string; damaged: string; missing: string; extra: string; acceptedExtra: string; lots: LotFields[] };
type InvoiceFields = { supplier: string; invoiceNumber: string; invoiceDate: string; dueDate: string; total: string; paid: string; paymentMethod: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other' | null };
type Phase = 'source' | 'count' | 'review';

function count(raw: string): number | null {
  if (!/^\d+$/u.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY ? value : null;
}

function invoiceFields(invoice: ExtractedInvoice): InvoiceFields {
  return {
    supplier: invoice.supplier ?? '',
    invoiceNumber: invoice.invoiceNumber ?? '',
    invoiceDate: invoice.invoiceDate ?? '',
    dueDate: '',
    total: invoice.totalPaise === null ? '' : String(invoice.totalPaise / 100),
    paid: invoice.paidPaise === null ? '' : String(invoice.paidPaise / 100),
    paymentMethod: invoice.paymentMethod,
  };
}

function countFields(lines: ExtractedInvoiceLine[]): Record<string, CountFields> {
  return Object.fromEntries(lines.map((line) => [line.id, {
    billed: line.billedQuantity === null ? '' : String(line.billedQuantity),
    good: '', damaged: '0', missing: '', extra: '0', acceptedExtra: '0', lots: [],
  }]));
}

export function Reconciliation() {
  const app = useApp();
  const { t } = app;
  const [phase, setPhase] = useState<Phase>('source');
  const [invoice, setInvoice] = useState<ExtractedInvoice | null>(null);
  const [fields, setFields] = useState<InvoiceFields | null>(null);
  const [counts, setCounts] = useState<Record<string, CountFields>>({});
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [voiceNote, setVoiceNote] = useState('');
  const [voiceSuggestionApplied, setVoiceSuggestionApplied] = useState(false);
  const [working, setWorking] = useState(false);
  const [choosingLineId, setChoosingLineId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const mounted = useRef(true);
  const activeScan = useRef<{ id: string; committed: boolean } | null>(null);
  const deliverySave = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const scan = activeScan.current;
      if (scan) {
        void discardUncommittedScan(
          deliverySave.current,
          () => scan.committed,
          async () => { await deleteInvoiceScan(scan.id); },
        ).catch(() => {});
      }
    };
  }, []);

  async function discardScan(scanId: string, showFailure: boolean) {
    try {
      await deleteInvoiceScan(scanId);
      if (activeScan.current?.id === scanId) activeScan.current = null;
      return true;
    } catch {
      if (showFailure && mounted.current) setLocalError(t('The temporary invoice scan could not be removed from this device.', 'इस डिवाइस से अस्थायी बिल स्कैन हटाया नहीं जा सका।'));
      return false;
    }
  }

  const resolved = useMemo(() => {
    if (!invoice) return [];
    return invoice.lines.map((line) => {
      const fields = counts[line.id];
      const billed = count(fields?.billed ?? '');
      const good = count(fields?.good ?? '');
      const damaged = count(fields?.damaged ?? '');
      const missing = count(fields?.missing ?? '');
      const extra = count(fields?.extra ?? '');
      const acceptedExtra = count(fields?.acceptedExtra ?? '');
      const valid = billed !== null && good !== null && damaged !== null && missing !== null && extra !== null && acceptedExtra !== null
        && billed === good + damaged + missing && acceptedExtra <= extra && !!line.catalogueItemId;
      const item = app.catalog.find((entry) => entry.id === line.catalogueItemId);
      const lotInputs = fields?.lots ?? [];
      const lotsValid = lotInputs.every((lot) => {
        const quantity = count(lot.quantity);
        return quantity !== null && quantity > 0 && (!lot.expiryDate.trim() || /^\d{4}-\d{2}-\d{2}$/u.test(lot.expiryDate.trim()));
      });
      const lots = lotInputs.flatMap((lot) => {
        const quantity = count(lot.quantity);
        return quantity !== null && quantity > 0 ? [{ quantity, batchCode: lot.batchCode.trim() || null, expiryDate: lot.expiryDate.trim() || null }] : [];
      });
      const value: DeliveryReconciliationLineInput | null = valid && item ? {
        lineId: line.id,
        catalogItemId: item.id,
        name: item.name,
        packSize: item.packSize,
        unit: item.unit,
        billedQuantity: billed,
        goodQuantity: good,
        damagedQuantity: damaged,
        missingQuantity: missing,
        extraQuantity: extra,
        acceptedExtraQuantity: acceptedExtra,
        lots,
      } : null;
      return { line, value, valid: valid && lotsValid, billed, good, damaged, missing, extra, acceptedExtra, item };
    });
  }, [app.catalog, counts, invoice]);
  const voiceSuggestions = useMemo(() => invoice
    ? suggestDictatedDeliveryCounts(voiceNote, invoice.lines, app.catalog)
    : [], [app.catalog, invoice, voiceNote]);
  async function acceptOCR(nextInvoice: ExtractedInvoice, uris: string[], scanId?: string) {
    if (!nextInvoice.lines.length) {
      setLocalError(t('No invoice item rows were recognized. Try a clearer photo or use quick entry.', 'बिल की उत्पाद पंक्तियाँ नहीं मिलीं। साफ़ फोटो लें या त्वरित प्रविष्टि चुनें।'));
      if (scanId) await discardScan(scanId, true);
      return false;
    }
    if (scanId) {
      activeScan.current = { id: scanId, committed: false };
    }
    setInvoice(nextInvoice);
    setFields(invoiceFields(nextInvoice));
    setCounts(countFields(nextInvoice.lines));
    setEvidenceUris(uris);
    setLocalError(null);
    setPhase('count');
    return true;
  }

  async function useSample() {
    setWorking(true);
    setLocalError(null);
    try {
      const uri = await resolveInvoiceFixtureUri();
      const result = await recognizeInvoiceImage(uri);
      await acceptOCR(extractInvoice(joinInvoiceOCRBlocks(result.blocks.map((block) => ({ text: block.text, ...block.bounds }))), app.catalog), [uri]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('Could not read the sample invoice.', 'नमूना बिल पढ़ा नहीं जा सका।'));
    } finally {
      setWorking(false);
    }
  }

  async function scan() {
    if (deliverySave.current) return;
    if (Platform.OS === 'ios' && !Device.isDevice) {
      setLocalError(t('The document camera is unavailable in the iOS Simulator. Use the note button to record this delivery.', 'iOS Simulator में दस्तावेज़ कैमरा उपलब्ध नहीं है। इस डिलीवरी को दर्ज करने के लिए नोट बटन चुनें।'));
      return;
    }
    setWorking(true);
    setLocalError(null);
    let scanId: string | null = null;
    try {
      const scanned = await scanInvoice();
      scanId = scanned.scanId;
      if (!mounted.current) {
        await discardScan(scanId, false);
        return;
      }
      const pages = await Promise.all(scanned.pages.map((page) => recognizeInvoiceImage(page.uri)));
      if (!mounted.current) {
        await discardScan(scanId, false);
        return;
      }
      const text = pages.map((page) => joinInvoiceOCRBlocks(page.blocks.map((block) => ({ text: block.text, ...block.bounds })))).join('\n');
      await acceptOCR(extractInvoice(text, app.catalog), scanned.pages.map((page) => page.uri), scanId);
    } catch (error) {
      const cleaned = scanId ? await discardScan(scanId, false) : true;
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (mounted.current && code !== 'ERR_SCAN_CANCELED') setLocalError(cleaned
        ? t('Could not open the invoice scanner. Check camera access, or record the delivery with a note.', 'बिल स्कैनर नहीं खुला। कैमरा अनुमति जाँचें या नोट से डिलीवरी दर्ज करें।')
        : t('The scan failed and temporary invoice pages could not be removed from this device.', 'स्कैन विफल हुआ और अस्थायी बिल पन्ने इस डिवाइस से हटाए नहीं जा सके।'));
    } finally {
      if (mounted.current) setWorking(false);
    }
  }

  useFocusEffect(useCallback(() => {
    if (app.consumeInvoiceScanRequest()) void scan();
  }, [app.consumeInvoiceScanRequest, app.catalog]));

  function updateLine(lineId: string, field: keyof CountFields, value: string) {
    if (field === 'lots') return;
    setCounts((current) => ({ ...current, [lineId]: { ...current[lineId], [field]: value } }));
  }

  function updateLot(lineId: string, index: number, field: keyof LotFields, value: string) {
    setCounts((current) => ({ ...current, [lineId]: {
      ...current[lineId], lots: current[lineId].lots.map((lot, lotIndex) => lotIndex === index ? { ...lot, [field]: value } : lot),
    } }));
  }

  function selectProduct(itemId: string) {
    if (!invoice || !choosingLineId) return;
    setInvoice({
      ...invoice,
      lines: invoice.lines.map((line) => line.id === choosingLineId ? { ...line, catalogueItemId: itemId, confidence: 'matched' } : line),
    });
    setChoosingLineId(null);
  }

  function addExtraProduct(itemId: string) {
    if (!invoice) return;
    const item = app.catalog.find((entry) => entry.id === itemId);
    if (!item) return;
    const lineId = newOperationId();
    setInvoice({ ...invoice, lines: [...invoice.lines, {
      id: lineId,
      rawDescription: variantName(item.name, item.packSize),
      catalogueItemId: item.id,
      billedQuantity: 0,
      unitPricePaise: null,
      lineTotalPaise: null,
      evidence: t('Owner-added extra or substitute item', 'दुकानदार द्वारा जोड़ा गया अतिरिक्त या बदला उत्पाद'),
      confidence: 'matched',
    }] });
    setCounts((current) => ({ ...current, [lineId]: { billed: '0', good: '0', damaged: '0', missing: '0', extra: '', acceptedExtra: '', lots: [] } }));
    setChoosingLineId(null);
  }

  function validateAndReview() {
    Keyboard.dismiss();
    if (!fields || !invoice) return;
    const totalPaise = parseRupees(fields.total);
    const paidPaise = fields.paid.trim() ? parseRupees(fields.paid) : null;
    if (!fields.supplier.trim()) return setLocalError(t('Enter the supplier name, or use “Supplier not recorded”.', 'सप्लायर का नाम भरें या “सप्लायर दर्ज नहीं है” चुनें।'));
    if (totalPaise === null) return setLocalError(t('Check the invoice total. Enter the amount shown on the bill.', 'बिल की कुल राशि जाँचें और बिल पर लिखी रकम भरें।'));
    if (fields.paid.trim() && paidPaise === null) return setLocalError(t('Check the amount already paid.', 'पहले से दी गई रकम जाँचें।'));
    if (fields.paid.trim() && !fields.paymentMethod) return setLocalError(t('Choose how the payment was made.', 'भुगतान का तरीका चुनें।'));
    if (resolved.some((entry) => !entry.valid)) return setLocalError(t('Resolve each product and make billed quantity equal good plus damaged plus missing.', 'हर उत्पाद चुनें और बिल मात्रा को सही, खराब और कम माल के बराबर करें।'));
    setLocalError(null);
    setPhase('review');
  }

  function confirm() {
    if (!invoice || !fields || deliverySave.current) return;
    const totalPaise = parseRupees(fields.total);
    const paidPaise = fields.paid.trim() ? parseRupees(fields.paid) : null;
    if (totalPaise === null || resolved.some((entry) => !entry.value)) return;
    const scan = activeScan.current;
    const saving = app.saveDelivery({
      voiceNote,
      supplier: fields.supplier.trim(),
      invoiceNumber: fields.invoiceNumber.trim() || null,
      invoiceDate: fields.invoiceDate.trim() || null,
      dueDate: fields.dueDate.trim() || null,
      invoiceTotalPaise: totalPaise,
      amountPaidPaise: paidPaise,
      paymentMethod: paidPaise !== null && paidPaise > 0 ? fields.paymentMethod : null,
      lines: resolved.flatMap((entry) => entry.value ? [entry.value] : []),
      invoiceEvidenceUris: evidenceUris,
    }, evidenceUris, () => {
      if (scan) scan.committed = true;
    });
    deliverySave.current = saving;
    void saving.finally(() => {
      deliverySave.current = null;
    }).catch(() => {});
  }

  if (!app.mode) return null;
  return (
    <Screen nav={<Nav left={<Back />} />} footer={phase === 'count' ? (
      <Action title={t('Review differences', 'अंतर जाँचें')} testID="reconciliation-review" disabled={working} onPress={validateAndReview} />
    ) : phase === 'review' ? (
      <Action title={t('Confirm delivery and update stock', 'डिलीवरी की पुष्टि करें और स्टॉक अपडेट करें')} testID="confirm-delivery" disabled={app.busy} onPress={confirm} />
    ) : undefined}>
      <Title title={t('Receive delivery', 'डिलीवरी प्राप्त करें')} subtitle={t('Match the supplier bill to what arrived.', 'सप्लायर के बिल का आए हुए माल से मिलान करें।')} />
      {phase === 'source' ? (
        <View style={local.sourceOptions}>
          <View style={local.sourcePrimary}>
            {Platform.OS === 'ios' && Device.isDevice ? (
              <Action title={working ? t('Reading invoice…', 'बिल पढ़ रहे हैं…') : t('Scan supplier invoice', 'सप्लायर का बिल स्कैन करें')} icon="notes" testID="scan-invoice" disabled={working} onPress={() => { void scan(); }} />
            ) : <View style={local.simulatorNotice}>
              <Text style={local.simulatorTitle}>{t('Using the iOS Simulator?', 'iOS Simulator इस्तेमाल कर रहे हैं?')}</Text>
              <Text style={local.simulatorBody}>{t('Invoice scanning needs an iPhone camera. Record the delivery with a note here.', 'बिल स्कैन करने के लिए iPhone कैमरा चाहिए। यहाँ नोट से डिलीवरी दर्ज करें।')}</Text>
            </View>}
            {localError ? <Warning>{localError}</Warning> : null}
            {Platform.OS === 'ios' && Device.isDevice ? <Hint>{t('Pages stay on this device. Check suggested details before saving.', 'पन्ने इसी डिवाइस पर रहते हैं। सहेजने से पहले सुझाव जाँचें।')}</Hint> : null}
          </View>
          <View style={local.sourceSecondary}>
            <Section>{t('No invoice?', 'बिल नहीं है?')}</Section>
            <Text style={local.sourceCaption}>{t('Use your voice or enter the delivery details.', 'आवाज़ से बताएँ या डिलीवरी का विवरण भरें।')}</Text>
            <Action title={t('Record delivery details', 'डिलीवरी का विवरण दर्ज करें')} icon="notes" kind="outline" testID="quick-entry-without-invoice" onPress={() => openScreen('capture')} />
          </View>
          {Platform.OS === 'ios' && app.wisprStep !== 'ready' ? <Action title={t('Set up Wispr Flow', 'Wispr Flow सेट करें')} icon="globe" kind="text" testID="reconciliation-wispr-setup" onPress={() => openScreen('flow')} /> : null}
        </View>
      ) : null}

      {phase === 'count' && invoice && fields ? (
        <>
          <Banner title={t('OCR suggestions · Please verify', 'OCR सुझाव · कृपया जाँचें')} />
          {Platform.OS === 'ios' ? <View style={local.note}>
            <Section>{t('Say what arrived with Wispr Flow', 'Wispr Flow से बताएँ कि क्या आया')}</Section>
            <Hint>{t('Focus this field, switch to Wispr Flow on the keyboard, and describe the good, damaged, or missing units. DukaanFlow will match clear counts to this bill for you to check.', 'इस फ़ील्ड पर टैप करें, कीबोर्ड में Wispr Flow चुनें और सही, खराब या कम माल बताएँ। DukaanFlow बिल से स्पष्ट मात्रा मिलाकर जाँच के लिए दिखाएगा।')}</Hint>
            <Input label={t('Delivery details', 'डिलीवरी का विवरण')} testID="delivery-voice-note" placeholder={t('For example: Maggi, 10 good, 1 damaged, 1 missing', 'उदाहरण: मैगी, 10 सही, 1 खराब, 1 कम')} value={voiceNote} onChangeText={(value) => { setVoiceNote(value); setVoiceSuggestionApplied(false); }} multiline maxLength={3000} />
            {voiceSuggestions.length > 0 ? <Action title={t('Fill counts from Wispr Flow', 'Wispr Flow से मात्रा भरें')} kind="outline" testID="apply-wispr-counts" onPress={() => {
              setCounts((current) => ({
                ...current,
                ...Object.fromEntries(voiceSuggestions.map((suggestion) => [suggestion.lineId, {
                  ...current[suggestion.lineId],
                  billed: String(invoice?.lines.find((line) => line.id === suggestion.lineId)?.billedQuantity ?? ''),
                  good: suggestion.good,
                  damaged: suggestion.damaged,
                  missing: suggestion.missing,
                  extra: current[suggestion.lineId]?.extra ?? '0',
                  acceptedExtra: current[suggestion.lineId]?.acceptedExtra ?? '0',
                }]))
              }));
              setVoiceSuggestionApplied(true);
            }} /> : null}
            {voiceNote.trim() && voiceSuggestions.length === 0 ? <Hint>{t('No safe match yet. Say the exact product and pack, then give counts for each condition. You can always enter the numbers below.', 'अभी सुरक्षित मिलान नहीं मिला। सही उत्पाद और पैक बोलकर हर स्थिति की मात्रा बताएँ। नीचे संख्याएँ खुद भी भर सकते हैं।')}</Hint> : null}
            {voiceSuggestionApplied ? <Banner title={t('Suggested counts filled · check each item below', 'सुझाई गई मात्रा भरी · नीचे हर उत्पाद जाँचें')} /> : null}
          </View> : null}
          <Input label={t('Supplier', 'सप्लायर')} testID="invoice-supplier" value={fields.supplier} onChangeText={(supplier) => setFields({ ...fields, supplier })} />
          <Input label={t('Invoice number', 'बिल नंबर')} value={fields.invoiceNumber} onChangeText={(invoiceNumber) => setFields({ ...fields, invoiceNumber })} />
          <Input label={t('Invoice date', 'बिल की तारीख')} value={fields.invoiceDate} onChangeText={(invoiceDate) => setFields({ ...fields, invoiceDate })} />
          <Input label={t('Payment due date · optional (YYYY-MM-DD)', 'भुगतान की अंतिम तारीख · वैकल्पिक (YYYY-MM-DD)')} testID="invoice-due-date" placeholder="2026-12-15" value={fields.dueDate} onChangeText={(dueDate) => setFields({ ...fields, dueDate })} />
          <Input label={t('Invoice total (₹)', 'बिल की कुल राशि (₹)')} keyboardType="decimal-pad" value={fields.total} onChangeText={(total) => setFields({ ...fields, total })} />
          <Input label={t('Already paid (₹), if any', 'पहले से दिया (₹), अगर हो')} keyboardType="decimal-pad" value={fields.paid} onChangeText={(paid) => setFields({ ...fields, paid, paymentMethod: paid ? fields.paymentMethod ?? 'cash' : null })} />
          {fields.paid ? <Row title={t('Payment method', 'भुगतान का तरीका')} value={fields.paymentMethod?.toUpperCase() ?? ''} onPress={() => setFields({ ...fields, paymentMethod: fields.paymentMethod === 'cash' ? 'upi' : 'cash' })} /> : null}
          <View style={local.lines}>
            <Section>{t('What arrived', 'क्या आया')}</Section>
            {resolved.map(({ line, valid, item }) => (
              <View key={line.id} style={local.lineCard}>
                <Text style={styles.rowTitle}>{item ? variantName(item.name, item.packSize) : line.rawDescription}</Text>
                <Row title={item ? variantName(item.name, item.packSize) : t('Choose exact product and pack', 'सही उत्पाद और पैक चुनें')} subtitle={item ? t('Catalogue match · verify count below', 'सूची से मिलान · नीचे मात्रा जाँचें') : t('Unmatched OCR suggestion · choose product', 'OCR मेल नहीं खाया · उत्पाद चुनें')} border={false} testID={`match-${line.id}`} onPress={() => setChoosingLineId(line.id)} />
                <Input label={t('Billed quantity', 'बिल की मात्रा')} testID={`billed-${line.id}`} keyboardType="number-pad" value={counts[line.id]?.billed ?? ''} onChangeText={(value) => updateLine(line.id, 'billed', value)} />
                <View style={local.countGrid}>
                  <Input label={t('Good', 'सही')} testID={`good-${line.id}`} keyboardType="number-pad" value={counts[line.id]?.good ?? ''} onChangeText={(value) => updateLine(line.id, 'good', value)} />
                  <Input label={t('Damaged', 'खराब')} testID={`damaged-${line.id}`} keyboardType="number-pad" value={counts[line.id]?.damaged ?? ''} onChangeText={(value) => updateLine(line.id, 'damaged', value)} />
                  <Input label={t('Missing', 'कम')} testID={`missing-${line.id}`} keyboardType="number-pad" value={counts[line.id]?.missing ?? ''} onChangeText={(value) => updateLine(line.id, 'missing', value)} />
                </View>
                <View style={local.countGrid}>
                  <Input label={t('Extra arrived', 'अतिरिक्त आया')} keyboardType="number-pad" value={counts[line.id]?.extra ?? ''} onChangeText={(value) => updateLine(line.id, 'extra', value)} />
                  <Input label={t('Accept into stock', 'स्टॉक में जोड़ें')} keyboardType="number-pad" value={counts[line.id]?.acceptedExtra ?? ''} onChangeText={(value) => updateLine(line.id, 'acceptedExtra', value)} />
                </View>
                <View style={local.lotInputs}>
                  <Section>{t('Batch and expiry · optional', 'बैच और एक्सपायरी · वैकल्पिक')}</Section>
                  <Hint>{t('Enter only what you can read or observe on the pack. Any accepted quantity you do not tag stays explicitly untracked.', 'पैक पर जो साफ़ दिखे वही भरें। जिस स्वीकार की गई मात्रा को टैग नहीं करेंगे, वह बिना ट्रैक की रहेगी।')}</Hint>
                  {(counts[line.id]?.lots ?? []).map((lot, lotIndex) => <View key={`${line.id}-lot-${lotIndex}`} style={local.lotInput}>
                    <Input label={t('Quantity in this lot', 'इस बैच की मात्रा')} keyboardType="number-pad" value={lot.quantity} onChangeText={(value) => updateLot(line.id, lotIndex, 'quantity', value)} testID={`lot-quantity-${line.id}-${lotIndex}`} />
                    <Input label={t('Batch code · optional', 'बैच कोड · वैकल्पिक')} value={lot.batchCode} onChangeText={(value) => updateLot(line.id, lotIndex, 'batchCode', value)} maxLength={120} />
                    <Input label={t('Expiry · optional (YYYY-MM-DD)', 'एक्सपायरी · वैकल्पिक (YYYY-MM-DD)')} placeholder="2026-12-31" value={lot.expiryDate} onChangeText={(value) => updateLot(line.id, lotIndex, 'expiryDate', value)} />
                    <Action title={t('Remove lot row', 'बैच पंक्ति हटाएँ')} kind="text" onPress={() => setCounts((current) => ({ ...current, [line.id]: { ...current[line.id], lots: current[line.id].lots.filter((_, index) => index !== lotIndex) } }))} />
                  </View>)}
                  <Action title={t('Add observed lot', 'देखा गया बैच जोड़ें')} icon="plus" kind="text" testID={`add-lot-${line.id}`} onPress={() => setCounts((current) => ({ ...current, [line.id]: { ...current[line.id], lots: [...current[line.id].lots, { quantity: '', batchCode: '', expiryDate: '' }] } }))} />
                </View>
                {!valid ? <Hint>{t('Billed must equal good + damaged + missing. Decide whether any extra item is accepted.', 'बिल मात्रा = सही + खराब + कम। अतिरिक्त माल स्वीकार करना चुनें।')}</Hint> : null}
              </View>
            ))}
            <Action title={t('Add extra or substituted item', 'अतिरिक्त या बदला उत्पाद जोड़ें')} icon="plus" kind="text" onPress={() => setChoosingLineId('__extra__')} />
          </View>
          <Hint>{t('Only good units and explicitly accepted extra units enter usable stock. Short or damaged goods remain a pending claim and do not reduce the amount due.', 'सिर्फ सही और स्वीकार किया अतिरिक्त माल इस्तेमाल योग्य स्टॉक में जाएगा। कम या खराब माल का दावा लंबित रहेगा और देय राशि अपने आप कम नहीं होगी।')}</Hint>
        </>
      ) : null}

      {phase === 'review' && fields && invoice ? (
        <>
          {voiceSuggestionApplied ? <Hint>{t('Speech filled editable count suggestions. Your confirmation is still required to update stock.', 'बोली गई जानकारी से संपादन योग्य मात्रा भरी गई। स्टॉक बदलने के लिए आपकी पुष्टि ज़रूरी है।')}</Hint> : null}
          <View style={local.summary}>
            <Section>{t('Supplier invoice', 'सप्लायर का बिल')}</Section>
            <Row title={fields.supplier} subtitle={[fields.invoiceNumber, fields.invoiceDate].filter(Boolean).join(' · ')} value={formatPaise(parseRupees(fields.total) ?? 0)} />
            <Row title={t('Payment recorded', 'दर्ज भुगतान')} value={fields.paid ? `${formatPaise(parseRupees(fields.paid) ?? 0)} · ${fields.paymentMethod?.toUpperCase() ?? ''}` : t('None', 'नहीं')} />
          </View>
          {Platform.OS === 'ios' && voiceNote.trim() ? <View style={local.summary}><Section>{t('Wispr Flow transcript', 'Wispr Flow ट्रांसक्रिप्ट')}</Section><Hint>{voiceNote.trim()}</Hint><Hint>{t('This note is retained with the delivery; only the values above change stock and supplier balances.', 'यह नोट डिलीवरी के साथ रहेगा; स्टॉक और सप्लायर खाते को सिर्फ ऊपर की संख्याएँ बदलेंगी।')}</Hint></View> : null}
          <View style={local.summary}>
            <Section>{t('Confirmed physical count', 'पुष्ट भौतिक मात्रा')}</Section>
            {resolved.map(({ line, value, item }) => value ? (
              <View key={line.id} style={local.reviewLine}>
                <Text style={styles.rowTitle}>{item ? variantName(item.name, item.packSize) : line.rawDescription}</Text>
                <Hint>{t(`Billed ${value.billedQuantity} · Good ${value.goodQuantity} · Damaged ${value.damagedQuantity} · Missing ${value.missingQuantity}`, `बिल ${value.billedQuantity} · सही ${value.goodQuantity} · खराब ${value.damagedQuantity} · कम ${value.missingQuantity}`)}</Hint>
                {value.extraQuantity > 0 ? <Hint>{t(`Extra ${value.extraQuantity} · accepted into stock ${value.acceptedExtraQuantity}`, `अतिरिक्त ${value.extraQuantity} · स्टॉक में स्वीकार ${value.acceptedExtraQuantity}`)}</Hint> : null}
                {(value.lots?.length ?? 0) > 0 ? <Hint>{t(`Observed lot quantities ${value.lots?.reduce((sum, lot) => sum + lot.quantity, 0)} · remaining untracked ${Math.max(0, value.goodQuantity + value.acceptedExtraQuantity - (value.lots?.reduce((sum, lot) => sum + lot.quantity, 0) ?? 0))}`, `देखे गए बैच ${value.lots?.reduce((sum, lot) => sum + lot.quantity, 0)} · बाकी बिना ट्रैक ${Math.max(0, value.goodQuantity + value.acceptedExtraQuantity - (value.lots?.reduce((sum, lot) => sum + lot.quantity, 0) ?? 0))}`)}</Hint> : <Hint>{t(`${value.goodQuantity + value.acceptedExtraQuantity} accepted units will remain untracked.`, `${value.goodQuantity + value.acceptedExtraQuantity} स्वीकार की गई इकाइयाँ बिना ट्रैक रहेंगी।`)}</Hint>}
              </View>
            ) : null)}
          </View>
          <View style={local.note}>
            <Text style={styles.rowTitle}>{t('Supplier balance effect', 'सप्लायर खाते पर असर')}</Text>
            <Hint>{t(`Invoice ${formatPaise(parseRupees(fields.total) ?? 0)} less recorded payment ${formatPaise(parseRupees(fields.paid) ?? 0)}. Short or damaged goods remain separate pending claims until a supplier credit is confirmed.`, `बिल ${formatPaise(parseRupees(fields.total) ?? 0)} में से दर्ज भुगतान ${formatPaise(parseRupees(fields.paid) ?? 0)} घटेगा। कम या खराब माल का दावा सप्लायर क्रेडिट की पुष्टि तक अलग रहेगा।`)}</Hint>
          </View>
          <Action title={t('Back to counts', 'मात्रा पर वापस जाएँ')} kind="text" onPress={() => setPhase('count')} />
        </>
      ) : null}
      {localError && phase !== 'source' ? <Warning>{localError}</Warning> : null}
      {app.problem ? <Warning>{app.problem}</Warning> : null}
      {choosingLineId ? (
        <Sheet title={choosingLineId === '__extra__' ? t('Choose extra or substitute product', 'अतिरिक्त या बदले उत्पाद चुनें') : t('Choose exact product and pack', 'सही उत्पाद और पैक चुनें')} cancel={t('Cancel', 'रद्द करें')} close={() => setChoosingLineId(null)}>
          <Action title={t('Add new product', 'नया उत्पाद जोड़ें')} icon="plus" kind="outline" onPress={() => {
            setChoosingLineId(null);
            openScreen('product-in-flow');
          }} />
          {app.catalog.map((item) => <Row key={item.id} title={variantName(item.name, item.packSize)} testID={`catalog-choice-${item.id}`} onPress={() => choosingLineId === '__extra__' ? addExtraProduct(item.id) : selectProduct(item.id)} />)}
        </Sheet>
      ) : null}
    </Screen>
  );
}

function InvoiceEvidence({ pages }: { pages: readonly string[] }) {
  const { t, workspaceMediaDirectory } = useApp();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const uri = selected === null ? null : resolveSavedInvoicePage(pages[selected], workspaceMediaDirectory);

  if (!pages.length) return null;

  return (
    <View style={local.claimsSection}>
      <Section>{t('Saved invoice', 'सहेजा गया बिल')}</Section>
      {pages.map((_, index) => (
        <Row key={index} title={t(`View page ${index + 1}`, `पेज ${index + 1} देखें`)} testID={`invoice-evidence-page-${index + 1}`} onPress={() => {
          setUnavailable(false);
          setSelected(index);
        }} />
      ))}
      {selected !== null ? (
        <Sheet title={t(`Invoice page ${selected + 1}`, `बिल का पेज ${selected + 1}`)} cancel={t('Done', 'हो गया')} close={() => setSelected(null)}>
          {uri && !unavailable ? (
            <Image key={uri} source={{ uri }} resizeMode="contain" accessible accessibilityLabel={t('Scanned invoice page', 'स्कैन किया गया बिल पेज')} style={{ width: '100%', height: Math.max(220, height * 0.56) }} onError={() => setUnavailable(true)} />
          ) : (
            <Warning>{t('This invoice page is unavailable on this device. The saved delivery details are still available.', 'इस डिवाइस पर बिल का यह पेज उपलब्ध नहीं है। सहेजी गई डिलीवरी का विवरण अब भी उपलब्ध है।')}</Warning>
          )}
        </Sheet>
      ) : null}
    </View>
  );
}

export function DeliveryDetail() {
  const app = useApp();
  const { t } = app;
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [lotReceipts, setLotReceipts] = useState<DeliveryLotReceiptSummary[]>([]);
  const [lotRejections, setLotRejections] = useState<DeliveryLotRejectionEvent[]>([]);
  const [lotDraft, setLotDraft] = useState<{ lotId: string; maxQuantity: number } | null>(null);
  const [lotQuantity, setLotQuantity] = useState('1');
  const [lotNote, setLotNote] = useState('');
  const [claimDraft, setClaimDraft] = useState<{ lineId: string; kind: SupplierClaimKind; maxQuantity: number } | null>(null);
  const [claimQuantity, setClaimQuantity] = useState('1');
  const [claimNote, setClaimNote] = useState('');
  const [creditClaimId, setCreditClaimId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReference, setCreditReference] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const delivery = app.deliveries.find((entry) => entry.id === app.activeDeliveryId);
  const refreshClaims = useCallback(async () => {
    if (!app.mode || !delivery) return;
    setClaims(await listSupplierClaims(app.mode, delivery.id));
  }, [app.mode, delivery]);
  const refreshLots = useCallback(async () => {
    if (!app.mode || !delivery) return;
    const [receipts, rejections] = await Promise.all([
      listDeliveryLotReceipts(app.mode, delivery.id), listDeliveryLotRejections(app.mode, delivery.id),
    ]);
    setLotReceipts(receipts); setLotRejections(rejections);
  }, [app.mode, delivery]);
  useFocusEffect(useCallback(() => { void refreshClaims().catch(() => {}); void refreshLots().catch(() => {}); }, [refreshClaims, refreshLots]));
  async function runClaimAction(action: () => Promise<unknown>, error: string) {
    await app.run(async () => { await action(); await refreshClaims(); await app.refreshStockAndSuppliers(); }, error);
  }
  async function runLotAction(action: () => Promise<unknown>, error: string) {
    await app.run(async () => { await action(); await refreshLots(); await app.refreshStockAndSuppliers(); }, error);
  }
  function submitLotRejection() {
    if (!app.mode || !lotDraft) return;
    const quantity = Number(lotQuantity.trim());
    if (!/^\d+$/u.test(lotQuantity.trim()) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > lotDraft.maxQuantity) return;
    Keyboard.dismiss();
    void runLotAction(async () => {
      await rejectDeliveryLot(app.mode!, newOperationId(), lotDraft.lotId, quantity, lotNote.trim() || null);
      setLotDraft(null); setLotQuantity('1'); setLotNote('');
    }, t('Could not mark this lot rejected. Check its remaining quantity.', 'बैच को अस्वीकृत नहीं कर सके। बाकी मात्रा जाँचें।'));
  }
  function startClaim(lineId: string, kind: SupplierClaimKind, maxQuantity: number) {
    setClaimDraft({ lineId, kind, maxQuantity }); setClaimQuantity('1'); setClaimNote('');
  }
  function submitClaim() {
    if (!delivery || !app.mode || !claimDraft) return;
    const quantity = Number(claimQuantity.trim());
    if (!/^\d+$/u.test(claimQuantity.trim()) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > claimDraft.maxQuantity) return;
    Keyboard.dismiss();
    void runClaimAction(async () => {
      await createSupplierClaim(app.mode!, newOperationId(), { deliveryId: delivery.id, lineId: claimDraft.lineId, kind: claimDraft.kind, quantity, note: claimNote.trim() || null });
      setClaimDraft(null);
    }, t('Could not save this supplier claim. Check its quantity and try again.', 'सप्लायर दावा सेव नहीं हुआ। मात्रा जाँचकर फिर कोशिश करें।'));
  }
  function submitCreditNote() {
    if (!creditClaimId || !app.mode) return;
    const amountPaise = parseRupees(creditAmount);
    if (amountPaise === null || amountPaise <= 0) return;
    Keyboard.dismiss();
    void runClaimAction(async () => {
      await recordSupplierClaimCreditNote(app.mode!, newOperationId(), creditClaimId, { amountPaise, reference: creditReference.trim() || null, note: creditNote.trim() || null });
      setCreditClaimId(null); setCreditAmount(''); setCreditReference(''); setCreditNote('');
    }, t('Could not confirm this credit note. Check that it matches an open invoice.', 'क्रेडिट नोट की पुष्टि नहीं हुई। जाँचें कि वह खुले बिल से मेल खाता है।'));
  }
  if (!delivery) return <Screen nav={<Nav left={<Back />} />}><Title title={t('Delivery details', 'डिलीवरी का विवरण')} /><Hint>{t('This delivery could not be found.', 'यह डिलीवरी नहीं मिली।')}</Hint></Screen>;

  const claimStatusName = (claim: SupplierClaim) => ({
    open: t('Open · no ledger change', 'खुला · खाते में बदलाव नहीं'), credit_promised: t('Credit promised · not received', 'क्रेडिट का वादा · मिला नहीं'),
    replacement_promised: t('Replacement promised · not received', 'बदलने का वादा · माल मिला नहीं'), disputed: t('Supplier disputes claim', 'सप्लायर दावे से सहमत नहीं'),
    resolved_credit_note: t('Credit note confirmed', 'क्रेडिट नोट की पुष्टि'), resolved_replacement: t('Replacement receipt linked', 'बदली रसीद जोड़ी गई'),
    closed: t('Closed by owner', 'मालिक ने बंद किया'), voided: t('Voided', 'निरस्त'),
  })[claim.status];
  const returnedQuantity = (claim: SupplierClaim) => claim.events.filter((event) => event.kind === 'return_handed_over' || event.kind === 'return_reversed').reduce((total, event) => total + (event.quantity ?? 0), 0);
  const unclaimedQuantity = (lineId: string, kind: SupplierClaimKind, maximum: number) => Math.max(0, maximum - claims
    .filter((claim) => claim.lineId === lineId && claim.kind === kind)
    .reduce((total, claim) => total + claim.quantity, 0));
  const unresolved = (claim: SupplierClaim) => !['closed', 'voided', 'resolved_credit_note', 'resolved_replacement'].includes(claim.status);
  const replacementCandidates = (claim: SupplierClaim) => app.deliveries.filter((candidate) => candidate.supplier === claim.supplier && !candidate.reversedAt && candidate.id !== claim.deliveryId && candidate.lines.some((line) => line.catalogItemId === delivery.lines.find((origin) => origin.lineId === claim.lineId)?.catalogItemId && line.unit === claim.unit && line.goodQuantity + line.acceptedExtraQuantity >= claim.quantity));
  const recordResponse = (claim: SupplierClaim, response: 'credit_promised' | 'replacement_promised' | 'rejected') => {
    if (app.mode) void runClaimAction(() => recordSupplierClaimResponse(app.mode!, newOperationId(), claim.id, response, null), t('Could not update the supplier claim.', 'सप्लायर दावा अपडेट नहीं हुआ।'));
  };

  return (
    <Screen nav={<Nav left={<Back />} />} footer={delivery.reversedAt ? undefined : <Action title={t('Reverse confirmed delivery', 'पुष्ट डिलीवरी वापस लें')} kind="outline" testID="reverse-delivery" onPress={() => setConfirmReverse(true)} />}>
      <Title title={t('Delivery details', 'डिलीवरी का विवरण')} subtitle={[delivery.supplier, displayDate(delivery.businessDate, app.profile.language === 'hi')].filter(Boolean).join(' · ')} />
      <Banner title={delivery.reversedAt ? t('Delivery reversed', 'डिलीवरी वापस ली गई') : t('Confirmed on this device', 'इस डिवाइस पर पुष्टि की गई')} />
      {delivery.invoiceNumber ? <Row title={t('Invoice', 'बिल')} value={delivery.invoiceNumber} /> : null}
      {delivery.invoiceDate ? <Row title={t('Invoice date', 'बिल की तारीख')} value={delivery.invoiceDate} /> : null}
      <Row title={t('Invoice total', 'बिल की कुल राशि')} value={formatPaise(delivery.invoiceTotalPaise)} />
      <Row title={t('Paid', 'दिया')} value={delivery.amountPaidPaise === null ? t('Not recorded', 'दर्ज नहीं') : formatPaise(delivery.amountPaidPaise)} />
      <InvoiceEvidence key={delivery.id} pages={delivery.invoiceEvidenceUris} />
      {Platform.OS === 'ios' && delivery.voiceNote?.trim() ? <View style={local.note}><Text style={styles.rowTitle}>{t('Dictated delivery note', 'बोला गया डिलीवरी नोट')}</Text><Hint>{delivery.voiceNote}</Hint></View> : null}
      <View style={local.summary}>
        <Section>{t('Invoice and received goods', 'बिल और आया हुआ माल')}</Section>
        {delivery.lines.map((line) => <View key={line.lineId} style={local.reviewLine}>
          <Text style={styles.rowTitle}>{variantName(line.name, line.packSize)}</Text>
          <Hint>{t(`Billed ${line.billedQuantity} · Good ${line.goodQuantity} · Damaged ${line.damagedQuantity} · Missing ${line.missingQuantity}`, `बिल ${line.billedQuantity} · सही ${line.goodQuantity} · खराब ${line.damagedQuantity} · कम ${line.missingQuantity}`)}</Hint>
          {line.extraQuantity ? <Hint>{t(`Extra ${line.extraQuantity} · accepted ${line.acceptedExtraQuantity}`, `अतिरिक्त ${line.extraQuantity} · स्वीकार ${line.acceptedExtraQuantity}`)}</Hint> : null}
        </View>)}
      </View>
      {lotReceipts.some((receipt) => receipt.trackedQuantity > 0) ? <View style={local.claimsSection}>
        <Section>{t('Observed batch and expiry', 'देखे गए बैच और एक्सपायरी')}</Section>
        <Hint>{t('These are owner-read receipt observations. Untracked quantity stays separate; this prototype does not allocate sales to lots or promise FEFO.', 'ये मालिक द्वारा पढ़े गए माल के रिकॉर्ड हैं। बिना ट्रैक मात्रा अलग है; यह प्रोटोटाइप बिक्री को बैचों से नहीं जोड़ता और FEFO का दावा नहीं करता।')}</Hint>
        {lotReceipts.map((summary) => <View key={`${summary.deliveryId}-${summary.lineId}`} style={local.claimCard}>
          <Text style={styles.rowTitle}>{variantName(summary.name, summary.packSize)}</Text>
          <Hint>{t(`Accepted ${summary.acceptedQuantity} · tracked ${summary.trackedQuantity} · untracked ${summary.untrackedQuantity}`, `स्वीकार ${summary.acceptedQuantity} · ट्रैक ${summary.trackedQuantity} · बिना ट्रैक ${summary.untrackedQuantity}`)}</Hint>
          <Hint>{t(`Usable observed ${summary.usableObservedQuantity} · expired ${summary.expiredQuantity} · rejected ${summary.rejectedQuantity}`, `उपयोग योग्य दर्ज ${summary.usableObservedQuantity} · एक्सपायर्ड ${summary.expiredQuantity} · अस्वीकृत ${summary.rejectedQuantity}`)}</Hint>
          {summary.lots.map((lot) => <View key={lot.id} style={local.claimEvent}>
            <View style={{ flex: 1 }}>
              <Text style={local.claimEventTitle}>{lot.batchCode ?? t('Batch not recorded', 'बैच दर्ज नहीं')} · {lot.quantity} {lot.unit}</Text>
              <Text style={local.claimEventMeta}>{lot.expiryDate ? `${t('Expiry', 'एक्सपायरी')} ${lot.expiryDate}` : t('Expiry not recorded', 'एक्सपायरी दर्ज नहीं')} · {t(`usable ${lot.usableQuantity}, expired ${lot.expiredQuantity}, rejected ${lot.rejectedQuantity}`, `उपयोग योग्य ${lot.usableQuantity}, एक्सपायर्ड ${lot.expiredQuantity}, अस्वीकृत ${lot.rejectedQuantity}`)}</Text>
            </View>
            {!delivery.reversedAt && lot.quantity > lot.rejectedQuantity ? <Action title={t('Mark rejected', 'अस्वीकृत चिह्नित करें')} kind="text" testID={`reject-lot-${lot.id}`} onPress={() => { setLotDraft({ lotId: lot.id, maxQuantity: lot.quantity - lot.rejectedQuantity }); setLotQuantity('1'); setLotNote(''); }} /> : null}
          </View>)}
          {lotRejections.filter((event) => summary.lots.some((lot) => lot.id === event.lotId)).map((event) => <View key={event.id} style={local.claimEvent}>
            <Text style={local.claimEventMeta}>{t(`Rejected ${event.quantity}${event.note ? ` · ${event.note}` : ''}`, `अस्वीकृत ${event.quantity}${event.note ? ` · ${event.note}` : ''}`)}</Text>
            {!delivery.reversedAt ? <Action title={t('Undo', 'वापस लें')} kind="text" testID={`undo-lot-rejection-${event.id}`} onPress={() => void runLotAction(() => reverseDeliveryLotRejection(app.mode!, event.id, newOperationId()), t('Could not undo this lot rejection.', 'बैच अस्वीकृति वापस नहीं हुई।'))} /> : null}
          </View>)}
        </View>)}
      </View> : null}
      <View style={local.claimsSection}>
        <Section>{t('Supplier claims and returns', 'सप्लायर दावे और वापसी')}</Section>
        <Hint>{t('Claims are notes only. Usable stock changes when goods are handed back; payable changes only after a credit note is confirmed.', 'दावे सिर्फ़ नोट हैं। सही माल लौटाने पर स्टॉक बदलेगा; क्रेडिट नोट की पुष्टि के बाद ही देय रकम बदलेगी।')}</Hint>
        {delivery.lines.map((line) => <View key={`claim-actions-${line.lineId}`} style={local.claimActionGroup}>
          <Text style={styles.rowTitle}>{variantName(line.name, line.packSize)}</Text>
          {!delivery.reversedAt && unclaimedQuantity(line.lineId, 'damaged', line.damagedQuantity) > 0 ? <Action title={t(`Claim ${unclaimedQuantity(line.lineId, 'damaged', line.damagedQuantity)} damaged`, `${unclaimedQuantity(line.lineId, 'damaged', line.damagedQuantity)} खराब का दावा`)} kind="outline" onPress={() => startClaim(line.lineId, 'damaged', unclaimedQuantity(line.lineId, 'damaged', line.damagedQuantity))} testID={`claim-damaged-${line.lineId}`} /> : null}
          {!delivery.reversedAt && unclaimedQuantity(line.lineId, 'missing', line.missingQuantity) > 0 ? <Action title={t(`Claim ${unclaimedQuantity(line.lineId, 'missing', line.missingQuantity)} missing`, `${unclaimedQuantity(line.lineId, 'missing', line.missingQuantity)} कम का दावा`)} kind="outline" onPress={() => startClaim(line.lineId, 'missing', unclaimedQuantity(line.lineId, 'missing', line.missingQuantity))} testID={`claim-missing-${line.lineId}`} /> : null}
          {!delivery.reversedAt && unclaimedQuantity(line.lineId, 'return', line.goodQuantity) > 0 ? <Action title={t('Start return of usable goods', 'सही माल लौटाने की शुरुआत')} kind="outline" onPress={() => startClaim(line.lineId, 'return', unclaimedQuantity(line.lineId, 'return', line.goodQuantity))} testID={`claim-return-${line.lineId}`} /> : null}
          {!delivery.reversedAt && unclaimedQuantity(line.lineId, 'extra', line.extraQuantity) > 0 && line.acceptedExtraQuantity > 0 ? <Action title={t(`Claim accepted extra · ${Math.min(unclaimedQuantity(line.lineId, 'extra', line.extraQuantity), line.acceptedExtraQuantity)}`, `स्वीकार अतिरिक्त · ${Math.min(unclaimedQuantity(line.lineId, 'extra', line.extraQuantity), line.acceptedExtraQuantity)} का दावा`)} kind="outline" onPress={() => startClaim(line.lineId, 'extra', Math.min(unclaimedQuantity(line.lineId, 'extra', line.extraQuantity), line.acceptedExtraQuantity))} testID={`claim-extra-${line.lineId}`} /> : null}
        </View>)}
        {claims.length ? claims.map((claim) => <View key={claim.id} style={local.claimCard} testID={`supplier-claim-${claim.id}`}>
          <Text style={styles.rowTitle}>{claim.itemName} · {claim.kind} · {claim.quantity} {claim.unit}</Text>
          <Hint>{claimStatusName(claim)}</Hint>
          {claim.note ? <Hint>{claim.note}</Hint> : null}
          {claim.events.map((event) => <View key={event.id} style={local.claimEvent}>
            <View style={{ flex: 1 }}>
              <Text style={local.claimEventTitle}>{event.kind.replaceAll('_', ' ')}</Text>
              <Text style={local.claimEventMeta}>{event.note ?? event.reference ?? (event.relatedDeliveryId ? t(`Receipt ${event.relatedDeliveryId}`, `रसीद ${event.relatedDeliveryId}`) : '')}</Text>
            </View>
            {event.kind === 'return_handed_over' && !claim.events.some((candidate) => candidate.reversesEventId === event.id)
              ? <Action kind="text" title={t('Undo return', 'वापसी वापस लें')} testID={`reverse-claim-return-${event.id}`} onPress={() => void runClaimAction(() => reverseSupplierClaimReturn(app.mode!, event.id, newOperationId()), t('Could not reverse this return.', 'वापसी ठीक नहीं हुई।'))} /> : null}
            {event.kind === 'credit_note_confirmed' && !claim.events.some((candidate) => candidate.reversesEventId === event.id)
              ? <Action kind="text" title={t('Undo credit', 'क्रेडिट वापस लें')} testID={`reverse-claim-credit-${event.id}`} onPress={() => void runClaimAction(() => reverseSupplierClaimCreditNote(app.mode!, event.id, newOperationId()), t('Could not reverse this credit note.', 'क्रेडिट नोट वापस नहीं हुआ।'))} /> : null}
          </View>)}
          {unresolved(claim) ? <View style={local.claimButtons}>
            <Action title={t('Credit promised', 'क्रेडिट का वादा')} kind="outline" onPress={() => recordResponse(claim, 'credit_promised')} testID={`claim-credit-promised-${claim.id}`} />
            <Action title={t('Replacement promised', 'बदलने का वादा')} kind="outline" onPress={() => recordResponse(claim, 'replacement_promised')} testID={`claim-replacement-promised-${claim.id}`} />
            <Action title={t('Disputed', 'विवादित')} kind="outline" onPress={() => recordResponse(claim, 'rejected')} testID={`claim-disputed-${claim.id}`} />
            {claim.kind !== 'missing' && returnedQuantity(claim) < claim.quantity ? <Action title={t(`Mark ${claim.quantity - returnedQuantity(claim)} returned`, `${claim.quantity - returnedQuantity(claim)} लौटाया चिह्नित करें`)} kind="outline" onPress={() => void runClaimAction(() => recordSupplierClaimReturn(app.mode!, newOperationId(), claim.id, claim.quantity - returnedQuantity(claim), null), t('Could not record the supplier return.', 'सप्लायर की वापसी दर्ज नहीं हुई।'))} testID={`hand-over-claim-${claim.id}`} /> : null}
            <Action title={t('Confirm credit note', 'क्रेडिट नोट की पुष्टि करें')} kind="outline" onPress={() => { setCreditClaimId(claim.id); setCreditAmount(''); setCreditReference(''); setCreditNote(''); }} testID={`confirm-claim-credit-note-${claim.id}`} />
            {replacementCandidates(claim).map((candidate) => <Action key={candidate.id} title={t(`Link replacement · ${candidate.invoiceNumber ?? candidate.businessDate}`, `बदली रसीद जोड़ें · ${candidate.invoiceNumber ?? candidate.businessDate}`)} kind="outline" onPress={() => {
              const replacementLine = candidate.lines.find((line) => line.catalogItemId === delivery.lines.find((origin) => origin.lineId === claim.lineId)?.catalogItemId && line.unit === claim.unit);
              if (replacementLine) void runClaimAction(() => recordSupplierClaimReplacement(app.mode!, newOperationId(), claim.id, candidate.id, replacementLine.lineId), t('Could not link the replacement receipt.', 'बदली रसीद नहीं जुड़ी।'));
            }} testID={`link-claim-replacement-${claim.id}-${candidate.id}`} />)}
            <Action title={t('Close without adjustment', 'बिना बदलाव बंद करें')} kind="text" onPress={() => void runClaimAction(() => closeSupplierClaim(app.mode!, claim.id, newOperationId(), 'Owner closed without stock or payable adjustment'), t('Could not close this claim.', 'दावा बंद नहीं हुआ।'))} testID={`close-claim-${claim.id}`} />
          </View> : null}
        </View>) : <Hint>{t('No claims or returns recorded for this delivery.', 'इस डिलीवरी के लिए कोई दावा या वापसी दर्ज नहीं है।')}</Hint>}
      </View>
      {claimDraft ? <Sheet title={t(`New ${claimDraft.kind} claim`, `नया ${claimDraft.kind} दावा`)} cancel={t('Cancel', 'रद्द करें')} close={() => setClaimDraft(null)}>
        <Input label={t(`Quantity · up to ${claimDraft.maxQuantity}`, `मात्रा · अधिकतम ${claimDraft.maxQuantity}`)} keyboardType="number-pad" value={claimQuantity} onChangeText={setClaimQuantity} testID="supplier-claim-quantity" />
        <Input label={t('Note · optional', 'नोट · वैकल्पिक')} value={claimNote} onChangeText={setClaimNote} maxLength={500} testID="supplier-claim-note" />
        <Hint>{t('Saving this claim changes neither stock nor the supplier balance.', 'दावा सेव करने से स्टॉक या सप्लायर खाते में बदलाव नहीं होता।')}</Hint>
        <Action title={t('Save claim', 'दावा सेव करें')} disabled={app.busy} onPress={submitClaim} testID="save-supplier-claim" />
      </Sheet> : null}
      {lotDraft ? <Sheet title={t('Mark received lot rejected', 'प्राप्त बैच अस्वीकृत करें')} cancel={t('Cancel', 'रद्द करें')} close={() => setLotDraft(null)}>
        <Input label={t(`Quantity · up to ${lotDraft.maxQuantity}`, `मात्रा · अधिकतम ${lotDraft.maxQuantity}`)} keyboardType="number-pad" value={lotQuantity} onChangeText={setLotQuantity} testID="lot-reject-quantity" />
        <Input label={t('Reason · optional', 'कारण · वैकल्पिक')} value={lotNote} onChangeText={setLotNote} maxLength={500} testID="lot-reject-note" />
        <Hint>{t('This posts a separate stock correction and keeps the original receipt. You can undo it from this history.', 'इससे अलग स्टॉक सुधार दर्ज होगा और मूल रसीद बनी रहेगी। इसे इसी इतिहास से वापस ले सकते हैं।')}</Hint>
        <Action title={t('Confirm rejection', 'अस्वीकृति की पुष्टि करें')} disabled={app.busy} onPress={submitLotRejection} testID="confirm-lot-rejection" />
      </Sheet> : null}
      {creditClaimId ? <Sheet title={t('Confirm supplier credit note', 'सप्लायर क्रेडिट नोट की पुष्टि')} cancel={t('Cancel', 'रद्द करें')} close={() => setCreditClaimId(null)}>
        <Input label={t('Credit amount · ₹', 'क्रेडिट राशि · ₹')} keyboardType="decimal-pad" value={creditAmount} onChangeText={setCreditAmount} testID="supplier-credit-note-amount" />
        <Input label={t('Credit-note reference · optional', 'क्रेडिट नोट नंबर · वैकल्पिक')} value={creditReference} onChangeText={setCreditReference} testID="supplier-credit-note-reference" />
        <Input label={t('Note · optional', 'नोट · वैकल्पिक')} value={creditNote} onChangeText={setCreditNote} maxLength={500} testID="supplier-credit-note-note" />
        <Hint>{t('Confirm only after receiving the supplier credit note. It reduces the linked invoice payable and does not change stock.', 'सप्लायर का क्रेडिट नोट मिलने के बाद ही पुष्टि करें। इससे बिल की देय रकम घटेगी, स्टॉक नहीं बदलेगा।')}</Hint>
        <Action title={t('Confirm credit note', 'क्रेडिट नोट की पुष्टि करें')} disabled={app.busy} onPress={submitCreditNote} testID="save-supplier-credit-note" />
      </Sheet> : null}
      {confirmReverse ? <Sheet title={t('Reverse this delivery?', 'यह डिलीवरी वापस लें?')} subtitle={t('This adds compensating stock and supplier-balance entries; the original stays in history.', 'स्टॉक और सप्लायर खाते में उलटी प्रविष्टियाँ जुड़ेंगी; मूल रिकॉर्ड इतिहास में रहेगा।')} cancel={t('Keep delivery', 'डिलीवरी रखें')} close={() => setConfirmReverse(false)}>
        <Action title={t('Reverse delivery', 'डिलीवरी वापस लें')} kind="destructive" testID="confirm-reverse-delivery" onPress={() => app.reverseDelivery(delivery.id, () => setConfirmReverse(false))} />
      </Sheet> : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  sourceOptions: { gap: 22, paddingTop: 8 },
  sourcePrimary: { gap: 10 },
  sourceSecondary: { gap: 8, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  sourceCaption: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: -4, marginBottom: 4 },
  simulatorNotice: { gap: 5, padding: 16, borderRadius: 18, backgroundColor: colors.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  simulatorTitle: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  simulatorBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  lines: { gap: 10, marginTop: 20 },
  lineCard: { padding: 14, gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.sheet },
  countGrid: { flexDirection: 'row', gap: 8 },
  lotInputs: { gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  lotInput: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: '#F7F6F2' },
  summary: { gap: 8, paddingVertical: 14 },
  claimsSection: { gap: 12, paddingVertical: 12 },
  claimActionGroup: { gap: 7, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  claimCard: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.sheet, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  claimButtons: { gap: 7, paddingTop: 4 },
  claimEvent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  claimEventTitle: { color: colors.ink, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  claimEventMeta: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  reviewLine: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, gap: 4 },
  note: { padding: 14, borderRadius: 16, backgroundColor: colors.warning, gap: 7, marginVertical: 8 },
});
