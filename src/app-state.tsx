import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { notificationAsync, NotificationFeedbackType } from 'expo-haptics';
import { emptyReceiptDraft, type CatalogItem, type ReceiptDraft, type ReceiptInput } from './domain';
import { answerCustomerQuery, currentShopBusinessDate, planCustomerQuery, type CustomerQueryAnswer } from './customer-query';
import { readWorkspaceLocation } from './workspace-location';
import {
  confirmReceipt,
  confirmDeliveryReconciliation,
  createSupplier as createSupplierInStore,
  listCatalog,
  listStockLevels,
  listDeliveryReconciliations,
  listSuppliers as listSuppliersFromStore,
  listSupplierPaymentEvents,
  listReceipts,
  newOperationId,
  readMode,
  readShopMode,
  readShopProfile,
  listShopProfiles,
  readActiveShopId,
  readWisprSetupStep,
  readOpeningStockPending,
  writeOpeningStockPending,
  reverseReceipt,
  reverseDeliveryReconciliation,
  reverseSupplierPayment as reverseSupplierPaymentInStore,
  recordSupplierPayment as recordSupplierPaymentInStore,
  saveCatalogItem,
  adjustStock as adjustStockInStore,
  writeMode,
  writeShopProfile,
  createShopProfile,
  selectShopProfile,
  setCurrentShopId,
  setStoreDirectory,
  writeWisprSetupStep,
  createCustomer as createCustomerInStore,
  listCustomers as listCustomersFromStore,
  listCustomerCreditEvents,
  listRetailSales,
  confirmCustomerCreditEvent as confirmCustomerCreditEventInStore,
  confirmCustomerCreditEventWithPromise as confirmCustomerCreditEventWithPromiseInStore,
  reverseCustomerCreditEvent as reverseCustomerCreditEventInStore,
  recordRetailSale,
  recordHomeNoteBatch,
  reverseRetailSale,
  reverseHomeNoteBatch,
  createPromiseToPay as createPromiseToPayInStore,
  correctCustomerPromiseDate as correctCustomerPromiseDateInStore,
  listCustomerPromises,
  updateCustomerPromiseStatus as updateCustomerPromiseStatusInStore,
  type SavedReceipt,
  type SavedDeliveryReconciliation,
  type DeliveryReconciliationInput,
  type ShopLanguage,
  type ShopMode,
  type ShopProfile,
  type WisprSetupStep,
  type Customer,
  type CustomerCreditEvent,
  type RetailSaleEvent,
  type HomeNoteBatchInput,
  type CustomerCreditInput,
  type NewCustomerInput,
  type NewPromiseInput,
  type PromiseToPay,
  type SupplierProfile,
  type SupplierPaymentEvent,
  type SupplierPaymentInput,
  type NewSupplierInput,
} from './store';

export type ScreenName = 'setup' | 'shop-setup' | 'new-shop' | 'opening-stock' | 'opening-stock-item' | 'opening-stock-scan' | 'shops' | 'flow' | 'flow-onboarding' | 'deliveries' | 'capture' | 'manual' | 'review' | 'receipt' | 'reconcile' | 'delivery' | 'settings' | 'catalogue' | 'product' | 'product-in-flow' | 'customers' | 'customer' | 'customer-new' | 'customer-record' | 'customer-promise' | 'customer-reminder' | 'suppliers' | 'supplier' | 'supplier-new' | 'supplier-payment';

const routeForScreen: Record<ScreenName, string> = {
  setup: '/[page]',
  'flow-onboarding': '/[page]',
  'opening-stock': '/[page]',
  'opening-stock-item': '/[page]',
  'opening-stock-scan': '/[page]',
  'shop-setup': '/(tabs)/shop/setup',
  'new-shop': '/(tabs)/shop/new-shop',
  shops: '/(tabs)/shop',
  'product-in-flow': '/(tabs)/deliveries/product',
  flow: '/(tabs)/shop/flow',
  deliveries: '/(tabs)/deliveries',
  capture: '/(tabs)/deliveries/capture',
  manual: '/(tabs)/deliveries/manual',
  review: '/(tabs)/deliveries/review',
  receipt: '/(tabs)/deliveries/receipt',
  reconcile: '/(tabs)/deliveries/reconcile',
  delivery: '/(tabs)/deliveries/delivery',
  settings: '/(tabs)/shop/settings',
  catalogue: '/(tabs)/products',
  product: '/(tabs)/products/product',
  customers: '/(tabs)/customers',
  customer: '/(tabs)/customers/customer',
  'customer-new': '/(tabs)/customers/new',
  'customer-record': '/(tabs)/customers/record',
  'customer-promise': '/(tabs)/customers/promise',
  'customer-reminder': '/(tabs)/customers/reminder',
  suppliers: '/(tabs)/suppliers',
  supplier: '/(tabs)/suppliers/supplier',
  'supplier-new': '/(tabs)/suppliers/new',
  'supplier-payment': '/(tabs)/suppliers/payment',
};

export function openScreen(screen: ScreenName) {
  const route = routeForScreen[screen];
  if (route === '/[page]') router.push({ pathname: route, params: { page: screen } });
  else router.push(route as never);
}

export function replaceScreen(screen: ScreenName) {
  const route = routeForScreen[screen];
  if (route === '/[page]') router.replace({ pathname: route, params: { page: screen } });
  else router.replace(route as never);
}

function returnToDeliveries() {
  router.dismissTo('/(tabs)/deliveries');
}

const blankProfile: ShopProfile = { id: 'default', name: '', language: 'en', setupComplete: false };

function useAppModel() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ShopProfile>(blankProfile);
  const [shops, setShops] = useState<ShopProfile[]>([]);
  const [wisprStep, setWisprStep] = useState<WisprSetupStep>('not-started');
  const [mode, setMode] = useState<ShopMode | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [stockLevels, setStockLevels] = useState<{ catalogueItemId: string; quantity: number }[]>([]);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [deliveries, setDeliveries] = useState<SavedDeliveryReconciliation[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [supplierPaymentEvents, setSupplierPaymentEvents] = useState<SupplierPaymentEvent[]>([]);
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerEvents, setCustomerEvents] = useState<CustomerCreditEvent[]>([]);
  const [customerRetailSales, setCustomerRetailSales] = useState<RetailSaleEvent[]>([]);
  const [customerPromises, setCustomerPromises] = useState<(PromiseToPay & { customerName: string })[]>([]);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [activePromiseId, setActivePromiseId] = useState<string | null>(null);
  const [customerSourceText, setCustomerSourceText] = useState('');
  const [customerEventKind, setCustomerEventKind] = useState<'unknown' | 'credit_sale' | 'repayment_received'>('unknown');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft>(emptyReceiptDraft);
  const [transcript, setTranscript] = useState('');
  const [notice, setNotice] = useState<{ id: string; type: 'saved' | 'reversed' | 'retail-sale-saved' | 'retail-sale-reversed' | 'home-note-saved' | 'home-new-customer-saved' | 'home-note-reversed' | 'home-credit-saved'; customerName?: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const shopEpoch = useRef(0);
  const operationId = useRef<string | null>(null);
  const [workspaceMediaDirectory, setWorkspaceMediaDirectory] = useState<string | null>(null);
  const [workspaceRestartRequired, setWorkspaceRestartRequired] = useState(false);
  const [openingStockPending, setOpeningStockPending] = useState(false);
  const scanInvoiceRequested = useRef(false);
  const profileWrite = useRef(Promise.resolve());

  const language = profile.language;
  const t = (english: string, hindi: string) => language === 'hi' ? hindi : english;

  async function initialize() {
    setProblem(null);
    try {
      const location = await readWorkspaceLocation();
      setStoreDirectory(location.sqliteDirectory);
      setWorkspaceMediaDirectory(location.mediaDirectory);
      const registeredShops = await listShopProfiles();
      const requestedActiveId = await readActiveShopId();
      const activeId = registeredShops.some((shop) => shop.id === requestedActiveId)
        ? requestedActiveId
        : registeredShops[0]?.id ?? 'default';
      setCurrentShopId(activeId);
      const [savedProfile, lastMode, savedWisprStep, pendingStock] = await Promise.all([readShopProfile(), readMode(), readWisprSetupStep(), readOpeningStockPending()]);
      setShops(registeredShops);
      if (savedProfile) setProfile(savedProfile);
      setWisprStep(savedWisprStep);
      setOpeningStockPending(pendingStock);
      const nextMode = (lastMode === 'demo' || lastMode === 'live') && savedProfile?.setupComplete
        ? 'live'
        : savedProfile?.setupComplete ? 'live' : null;
      if (lastMode === 'demo' && nextMode === 'live') await writeMode('live');
      if (nextMode) {
        const [nextCatalog, nextReceipts, nextDeliveries, nextStock, nextCustomers, nextPromises, nextSuppliers] = await Promise.all([
          listCatalog(nextMode), listReceipts(nextMode), listDeliveryReconciliations(nextMode), listStockLevels(nextMode),
          listCustomersFromStore(nextMode), listCustomerPromises(nextMode), listSuppliersFromStore(nextMode),
        ]);
        setCatalog(nextCatalog);
        setReceipts(nextReceipts);
        setDeliveries(nextDeliveries);
        setStockLevels(nextStock);
        setCustomers(nextCustomers);
        setCustomerPromises(nextPromises);
        setSuppliers(nextSuppliers);
      }
      setMode(nextMode);
      setReady(true);
    } catch {
      setProblem('Could not open your shop. Try again.');
    }
  }

  useEffect(() => { void initialize(); }, []);

  async function run(action: () => Promise<void>, error: string) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await action();
      return true;
    } catch (cause) {
      if (__DEV__) console.error('DukaanFlow action failed:', cause instanceof Error ? cause.name : 'UnknownError');
      setProblem(error);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function persistProfile(nextProfile: ShopProfile) {
    const write = profileWrite.current.then(() => writeShopProfile(nextProfile));
    profileWrite.current = write.catch(() => {});
    return write;
  }

  function updateSetup(nextProfile: ShopProfile) {
    setProfile(nextProfile);
    if (!nextProfile.name.trim()) return;
    void persistProfile(nextProfile).catch(() => {});
  }

  async function loadShop(nextMode: ShopMode) {
    const epoch = ++shopEpoch.current;
    const [nextCatalog, nextReceipts, nextDeliveries, nextStock, nextCustomers, nextPromises, nextSuppliers] = await Promise.all([
      listCatalog(nextMode), listReceipts(nextMode), listDeliveryReconciliations(nextMode), listStockLevels(nextMode),
      listCustomersFromStore(nextMode), listCustomerPromises(nextMode), listSuppliersFromStore(nextMode),
    ]);
    if (epoch !== shopEpoch.current) return;
    await writeMode(nextMode);
    if (epoch !== shopEpoch.current) return;
    setMode(nextMode);
    setCatalog(nextCatalog);
    setReceipts(nextReceipts);
    setDeliveries(nextDeliveries);
    setStockLevels(nextStock);
    setCustomers(nextCustomers);
    setCustomerPromises(nextPromises);
    setSuppliers(nextSuppliers);
    setCustomerEvents([]);
    setCustomerRetailSales([]);
    setActiveCustomerId(null);
    setActivePromiseId(null);
    setActiveSupplierId(null);
    setSupplierPaymentEvents([]);
    setActiveId(null);
    setActiveDeliveryId(null);
    setNotice(null);
    clearDraft();
  }

  async function refreshStockAndSuppliers() {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) return;
    const [nextStock, nextSuppliers] = await Promise.all([
      listStockLevels(activeMode), listSuppliersFromStore(activeMode),
    ]);
    if (epoch !== shopEpoch.current || activeMode !== mode) return;
    setStockLevels(nextStock);
    setSuppliers(nextSuppliers);
  }

  async function addShop(name = '', shopLanguage: ShopLanguage = language) {
    shopEpoch.current += 1;
    const next = await createShopProfile(name, shopLanguage);
    setProfile(next);
    setOpeningStockPending(false);
    setShops((current) => current.some((shop) => shop.id === next.id) ? current : [...current, next]);
    setMode(null);
    setCatalog([]);
    setStockLevels([]);
    setReceipts([]);
    setDeliveries([]);
    setSuppliers([]);
    setSupplierPaymentEvents([]);
    setCustomers([]);
    setActiveSupplierId(null);
    setCustomerEvents([]);
    setCustomerRetailSales([]);
    setCustomerPromises([]);
    setActiveCustomerId(null);
    setActivePromiseId(null);
    setActiveId(null);
    setActiveDeliveryId(null);
    setNotice(null);
    clearDraft();
    return next;
  }

  async function switchShop(shopId: string) {
    const previousShopId = profile.id;
    shopEpoch.current += 1;
    try {
      const nextProfile = await selectShopProfile(shopId);
      const [savedMode, nextWisprStep, pendingStock] = await Promise.all([readShopMode(shopId), readWisprSetupStep(), readOpeningStockPending()]);
      const activeMode = nextProfile.setupComplete && savedMode ? 'live' : null;
      let nextCatalog: CatalogItem[] = [];
      let nextReceipts: SavedReceipt[] = [];
      let nextDeliveries: SavedDeliveryReconciliation[] = [];
      let nextStock: { catalogueItemId: string; quantity: number }[] = [];
      let nextCustomers: Customer[] = [];
      let nextPromises: (PromiseToPay & { customerName: string })[] = [];
      let nextSuppliers: SupplierProfile[] = [];
      if (activeMode) {
        [nextCatalog, nextReceipts, nextDeliveries, nextStock, nextCustomers, nextPromises, nextSuppliers] = await Promise.all([
          listCatalog(activeMode), listReceipts(activeMode), listDeliveryReconciliations(activeMode), listStockLevels(activeMode),
          listCustomersFromStore(activeMode), listCustomerPromises(activeMode), listSuppliersFromStore(activeMode),
        ]);
      }
      const nextShops = await listShopProfiles();

      // Publish one coherent shop snapshot only after every required read succeeds.
      setProfile(nextProfile);
      setOpeningStockPending(pendingStock);
      setWisprStep(nextWisprStep);
      setCatalog(nextCatalog);
      setReceipts(nextReceipts);
      setDeliveries(nextDeliveries);
      setStockLevels(nextStock);
      setCustomers(nextCustomers);
      setCustomerEvents([]);
      setCustomerRetailSales([]);
      setCustomerPromises(nextPromises);
      setSuppliers(nextSuppliers);
      setSupplierPaymentEvents([]);
      setMode(activeMode);
      setShops(nextShops);
      setActiveId(null);
      setActiveDeliveryId(null);
      setActiveCustomerId(null);
      setActiveSupplierId(null);
      setActivePromiseId(null);
      setNotice(null);
      clearDraft();
      return nextProfile;
    } catch (error) {
      // Selection updates the storage pointer before the UI snapshot is loaded.
      // Restore it if any read fails so the old screen cannot target the new DB.
      setCurrentShopId(previousShopId);
      try {
        await selectShopProfile(previousShopId);
      } catch {
        setCurrentShopId(previousShopId);
      }
      throw error;
    }
  }

  async function refreshShopProfiles() {
    setShops(await listShopProfiles());
  }

  async function refreshCustomerData() {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) return;
    const [nextCustomers, nextPromises] = await Promise.all([listCustomersFromStore(activeMode), listCustomerPromises(activeMode)]);
    if (epoch !== shopEpoch.current || activeMode !== mode) return;
    setCustomers(nextCustomers);
    setCustomerPromises(nextPromises);
  }

  async function refreshSupplierData() {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) return;
    const nextSuppliers = await listSuppliersFromStore(activeMode);
    if (epoch !== shopEpoch.current || activeMode !== mode) return;
    setSuppliers(nextSuppliers);
  }

  async function openSupplier(id: string) {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) {
      if (epoch !== shopEpoch.current) return;
      setActiveSupplierId(id);
      setSupplierPaymentEvents([]);
      return;
    }
    const nextEvents = await listSupplierPaymentEvents(activeMode, id);
    if (epoch !== shopEpoch.current || activeMode !== mode) return;
    setActiveSupplierId(id);
    setSupplierPaymentEvents(nextEvents);
  }

  async function addSupplier(input: NewSupplierInput) {
    if (!mode) throw new Error('No active shop');
    const supplier = await createSupplierInStore(mode, input);
    await refreshSupplierData();
    setActiveSupplierId(supplier.id);
    setSupplierPaymentEvents([]);
    return supplier;
  }

  async function saveSupplierPayment(operationId: string, input: SupplierPaymentInput) {
    if (!mode) throw new Error('No active shop');
    const payment = await recordSupplierPaymentInStore(mode, operationId, input);
    await refreshSupplierData();
    await openSupplier(input.supplierId);
    return payment;
  }

  async function reverseSupplierPayment(paymentId: string, operationId: string) {
    if (!mode) throw new Error('No active shop');
    const reversal = await reverseSupplierPaymentInStore(mode, paymentId, operationId);
    await refreshSupplierData();
    if (activeSupplierId) await openSupplier(activeSupplierId);
    return reversal;
  }

  async function openCustomer(id: string) {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) {
      if (epoch !== shopEpoch.current) return;
      setActiveCustomerId(id);
      setCustomerEvents([]);
      return;
    }
    const [events, promises, sales] = await Promise.all([listCustomerCreditEvents(activeMode, id), listCustomerPromises(activeMode, id), listRetailSales(activeMode, id)]);
    if (epoch !== shopEpoch.current || activeMode !== mode) return;
    setActiveCustomerId(id);
    setCustomerEvents(events);
    setCustomerRetailSales(sales);
    setCustomerPromises((current) => [...current.filter((promise) => promise.customerId !== id), ...promises]);
  }

  async function answerCustomerQuestion(question: string): Promise<CustomerQueryAnswer> {
    const epoch = shopEpoch.current;
    const activeMode = mode;
    if (!activeMode) return { kind: 'unsupported' };
    const [freshCustomers, promises] = await Promise.all([
      listCustomersFromStore(activeMode),
      listCustomerPromises(activeMode),
    ]);
    if (epoch !== shopEpoch.current || activeMode !== mode) return { kind: 'unsupported' };
    const plan = planCustomerQuery(question, freshCustomers);
    const customerId = plan.kind === 'customer-balance' || plan.kind === 'customer-history' ? plan.customerId : null;
    const events = customerId ? await listCustomerCreditEvents(activeMode, customerId) : [];
    if (epoch !== shopEpoch.current || activeMode !== mode) return { kind: 'unsupported' };
    return answerCustomerQuery(plan, { customers: freshCustomers, promises, events }, currentShopBusinessDate());
  }

  function startCustomerCapture(sourceText: string) {
    setCustomerSourceText(sourceText.trim());
    setActiveCustomerId(null);
    setCustomerEventKind('unknown');
    openScreen('customer-record');
  }

  function startCustomerEvent(id: string, kind: 'credit_sale' | 'repayment_received', sourceText = '') {
    setActiveCustomerId(id);
    setCustomerEventKind(kind);
    setCustomerSourceText(sourceText);
    openScreen('customer-record');
  }

  function startCustomerPromise(id: string) {
    setActiveCustomerId(id);
    setActivePromiseId(null);
    openScreen('customer-promise');
  }

  function startCustomerReminder(customerId: string, promiseId: string) {
    setActiveCustomerId(customerId);
    setActivePromiseId(promiseId);
    openScreen('customer-reminder');
  }

  async function addCustomer(input: NewCustomerInput) {
    if (!mode) throw new Error('No active shop');
    const customer = await createCustomerInStore(mode, newOperationId(), input);
    await refreshCustomerData();
    setActiveCustomerId(customer.id);
    setCustomerEvents([]);
    return customer;
  }

  async function saveCustomerEvent(operationId: string, input: CustomerCreditInput) {
    if (!mode) throw new Error('No active shop');
    const event = await confirmCustomerCreditEventInStore(mode, operationId, input);
    setStockLevels(await listStockLevels(mode));
    await refreshCustomerData();
    await openCustomer(input.customerId);
    return event;
  }

  async function saveRetailSaleFromNote(operationId: string, input: Parameters<typeof recordRetailSale>[2]) {
    if (!mode) throw new Error('No active shop');
    const sale = await recordRetailSale(mode, operationId, input);
    setStockLevels(await listStockLevels(mode));
    await refreshCustomerData();
    setNotice({ id: sale.id, type: 'retail-sale-saved' });
    return sale;
  }

  async function saveHomeNoteBatch(operationId: string, input: HomeNoteBatchInput) {
    if (!mode) throw new Error('No active shop');
    const activeMode = mode;
    await recordHomeNoteBatch(activeMode, operationId, input);
    setNotice({ id: operationId, type: input.newCustomer ? 'home-new-customer-saved' : 'home-note-saved', ...(input.newCustomer ? { customerName: input.newCustomer.name } : {}) });
    try {
      const [nextStock, nextReceipts, nextSuppliers] = await Promise.all([
        listStockLevels(activeMode), listReceipts(activeMode), listSuppliersFromStore(activeMode),
      ]);
      setStockLevels(nextStock);
      setReceipts(nextReceipts);
      setSuppliers(nextSuppliers);
      await refreshCustomerData();
    } catch {
      const message = t(
        'Note saved. Some lists could not refresh. Reopen the app to see the latest records.',
        'नोट सहेजा गया। कुछ सूचियाँ अपडेट नहीं हो सकीं। नए रिकॉर्ड देखने के लिए ऐप फिर खोलें।',
      );
      setProblem(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    AccessibilityInfo.announceForAccessibility(t('Note saved. Shop records are updated.', 'नोट सहेजा गया। दुकान के रिकॉर्ड अपडेट हो गए।'));
  }

  async function undoHomeNoteBatch(operationId: string) {
    if (!mode) throw new Error('No active shop');
    const activeMode = mode;
    await reverseHomeNoteBatch(activeMode, operationId);
    const [nextStock, nextReceipts, nextSuppliers] = await Promise.all([
      listStockLevels(activeMode), listReceipts(activeMode), listSuppliersFromStore(activeMode),
    ]);
    setStockLevels(nextStock);
    setReceipts(nextReceipts);
    setSuppliers(nextSuppliers);
    await refreshCustomerData();
    setNotice({ id: operationId, type: 'home-note-reversed' });
    AccessibilityInfo.announceForAccessibility(t('The note was reversed. Shop records were corrected.', 'नोट वापस लिया गया। दुकान के रिकॉर्ड ठीक किए गए।'));
  }

  async function undoRetailSale(id: string) {
    if (!mode) throw new Error('No active shop');
    await reverseRetailSale(mode, id, newOperationId());
    setStockLevels(await listStockLevels(mode));
    await refreshCustomerData();
    setNotice({ id, type: 'retail-sale-reversed' });
  }

  async function saveCustomerEventWithPromise(
    eventOperationId: string,
    promiseOperationId: string,
    input: CustomerCreditInput,
    promise: { amountPaise: number | null; dueDate: string | null; note: string | null },
  ) {
    if (!mode) throw new Error('No active shop');
    const saved = await confirmCustomerCreditEventWithPromiseInStore(mode, eventOperationId, input, promiseOperationId, promise);
    setStockLevels(await listStockLevels(mode));
    await refreshCustomerData();
    await openCustomer(input.customerId);
    return saved;
  }

  async function reverseCustomerEvent(eventId: string, operationId: string) {
    if (!mode) throw new Error('No active shop');
    const event = await reverseCustomerCreditEventInStore(mode, eventId, operationId);
    setStockLevels(await listStockLevels(mode));
    await refreshCustomerData();
    await openCustomer(event.customerId);
    return event;
  }

  async function savePromiseToPay(operationId: string, input: NewPromiseInput) {
    if (!mode) throw new Error('No active shop');
    const promise = await createPromiseToPayInStore(mode, operationId, input);
    await refreshCustomerData();
    await openCustomer(input.customerId);
    return promise;
  }

  async function correctPromiseDate(promiseId: string, operationId: string, dueDate: string) {
    if (!mode) throw new Error('No active shop');
    const promise = await correctCustomerPromiseDateInStore(mode, promiseId, operationId, dueDate);
    await refreshCustomerData();
    await openCustomer(promise.customerId);
    return promise;
  }

  async function updatePromiseStatus(promiseId: string, status: PromiseToPay['status']) {
    if (!mode) throw new Error('No active shop');
    await updateCustomerPromiseStatusInStore(mode, promiseId, status);
    await refreshCustomerData();
    if (activeCustomerId) await openCustomer(activeCustomerId);
  }

  async function updateWisprStep(next: WisprSetupStep) {
    await writeWisprSetupStep(next);
    setWisprStep(next);
  }

  const clearDraft = useCallback(() => {
    setDraft(emptyReceiptDraft());
    setTranscript('');
    operationId.current = null;
  }, []);

  function startReceipt() {
    if (locked.current) return;
    scanInvoiceRequested.current = false;
    clearDraft();
    operationId.current = newOperationId();
    setProblem(null);
    openScreen('reconcile');
  }

  function startInvoiceScan() {
    if (locked.current) return;
    scanInvoiceRequested.current = true;
    clearDraft();
    operationId.current = newOperationId();
    setProblem(null);
    openScreen('reconcile');
  }

  function consumeInvoiceScanRequest() {
    const requested = scanInvoiceRequested.current;
    scanInvoiceRequested.current = false;
    return requested;
  }

  async function saveDelivery(next: DeliveryReconciliationInput, evidenceUris: string[] = [], onPersisted?: () => void) {
    const activeMode = mode;
    if (!activeMode) return;
    const id = operationId.current ?? newOperationId();
    operationId.current = id;
    await run(async () => {
      const delivery = await confirmDeliveryReconciliation(activeMode, id, { ...next, invoiceEvidenceUris: evidenceUris });
      onPersisted?.();
      setStockLevels(await listStockLevels(activeMode));
      setSuppliers(await listSuppliersFromStore(activeMode));
      setDeliveries((current) => [delivery, ...current.filter((row) => row.id !== delivery.id)]);
      setNotice({ id: delivery.id, type: 'saved' });
      operationId.current = null;
      returnToDeliveries();
      void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(t('Delivery confirmed and saved', 'डिलीवरी की पुष्टि करके सहेजी गई'));
    }, t('Could not save the delivery. Try again.', 'डिलीवरी सहेजी नहीं जा सकी। फिर कोशिश करें।'));
  }

  function reverseDelivery(id: string, onSuccess?: () => void) {
    const activeMode = mode;
    if (!activeMode) return;
    void run(async () => {
      const delivery = await reverseDeliveryReconciliation(activeMode, id);
      setStockLevels(await listStockLevels(activeMode));
      setSuppliers(await listSuppliersFromStore(activeMode));
      setDeliveries((current) => current.map((row) => row.id === id ? delivery : row));
      setNotice({ id, type: 'reversed' });
      onSuccess?.();
      void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(t('Delivery reversed', 'डिलीवरी वापस ली गई'));
    }, t('Could not reverse the delivery. Try again.', 'डिलीवरी वापस नहीं ली जा सकी। फिर कोशिश करें।'));
  }

  function save(next: ReceiptInput) {
    const activeMode = mode;
    if (!activeMode) return;
    const id = operationId.current ?? newOperationId();
    operationId.current = id;
    void run(async () => {
      const receipt = await confirmReceipt(activeMode, id, next);
      setStockLevels(await listStockLevels(activeMode));
      setReceipts((current) => [receipt, ...current.filter((row) => row.id !== receipt.id)]);
      setNotice({ id: receipt.id, type: 'saved' });
      clearDraft();
      returnToDeliveries();
      void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(t('Receipt saved', 'रसीद सहेजी गई'));
    }, t('Could not save the receipt. Try again.', 'रसीद सहेजी नहीं जा सकी। फिर कोशिश करें।'));
  }

  function reverse(id: string, onSuccess?: () => void) {
    const activeMode = mode;
    if (!activeMode) return;
    void run(async () => {
      const receipt = await reverseReceipt(activeMode, id);
      setStockLevels(await listStockLevels(activeMode));
      setReceipts((current) => current.map((row) => row.id === id ? receipt : row));
      setNotice({ id, type: 'reversed' });
      onSuccess?.();
      void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
      AccessibilityInfo.announceForAccessibility(t('Receipt reversed', 'रसीद वापस ली गई'));
    }, t('Could not reverse the receipt. Try again.', 'रसीद वापस नहीं ली जा सकी। फिर कोशिश करें।'));
  }

  return {
    ready, initialize, mode, profile, shops, addShop, switchShop, refreshShopProfiles, updateSetup, persistProfile, loadShop, wisprStep, updateWisprStep, catalog, stockLevels, workspaceMediaDirectory, workspaceRestartRequired, setWorkspaceRestartRequired,
    customers, customerEvents, customerRetailSales, customerPromises, activeCustomerId, setActiveCustomerId, activePromiseId, openCustomer, addCustomer, saveCustomerEvent, saveRetailSaleFromNote, saveHomeNoteBatch, undoHomeNoteBatch, undoRetailSale, saveCustomerEventWithPromise, reverseCustomerEvent, savePromiseToPay, correctPromiseDate, updatePromiseStatus, answerCustomerQuestion,
    suppliers, supplierPaymentEvents, activeSupplierId, setActiveSupplierId, openSupplier, addSupplier, saveSupplierPayment, reverseSupplierPayment,
    customerSourceText, setCustomerSourceText, customerEventKind, setCustomerEventKind, startCustomerCapture, startCustomerEvent, startCustomerPromise, startCustomerReminder,
    receipts, deliveries, notice, setNotice, activeId, setActiveId, activeDeliveryId, setActiveDeliveryId, draft, setDraft, transcript, setTranscript,
    problem, setProblem, busy, run, startReceipt, startInvoiceScan, consumeInvoiceScanRequest, saveDelivery, reverseDelivery, clearDraft, save, reverse, t,
    refreshStockAndSuppliers,
    openingStockPending,
    async updateOpeningStockPending(pending: boolean) {
      await writeOpeningStockPending(pending);
      setOpeningStockPending(pending);
    },
    updateProfile(next: ShopProfile) { setProfile(next); },
    async addProduct(input: Omit<CatalogItem, 'id'> & { id?: string }, openingQuantity?: number) {
      if (!mode) throw new Error('No active shop');
      const item = await saveCatalogItem(mode, input, openingQuantity);
      setCatalog((current) => [...current.filter((row) => row.id !== item.id), item]);
      if (openingQuantity !== undefined) setStockLevels(await listStockLevels(mode));
      return item;
    },
    async adjustProductStock(catalogueItemId: string, quantityDelta: number, reason: string) {
      if (!mode) throw new Error('No active shop');
      await adjustStockInStore(mode, newOperationId(), catalogueItemId, quantityDelta, reason);
      setStockLevels(await listStockLevels(mode));
    },
  };
}

const AppContext = createContext<ReturnType<typeof useAppModel> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppModel();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppProvider is missing');
  return app;
}

export type { ShopLanguage };
