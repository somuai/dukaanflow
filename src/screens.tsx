import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AccessibilityInfo,
  findNodeHandle,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { reloadAppAsync } from 'expo';
import * as Device from 'expo-device';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Reanimated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openScreen, replaceScreen, useApp } from './app-state';
import { formatPaise, MAX_QUANTITY, type StockUnit } from './domain';
import { analyzeHomeNote, classifyHomeCapture, MAX_HOME_NOTE_LENGTH, resolveHomeCreditCapture, toHomeNoteBatchInput } from './home-capture';
import { updateHomeNoteDraft } from './home-note-draft';
import { homeActionLayout, type ActionMenuPoint } from './home-action-layout';
import { equivalentProductBarcodes, lookupBarcodeProduct, normalizeBarcode, type BarcodeProductSuggestion } from './product-lookup';
import { recognizeInvoiceImage } from '../modules/invoice-ocr/src';
import { extractProductPhotoSuggestions } from './product-photo-extraction';
import { resolveSavedInvoicePage, resolveSavedProductPhoto } from './invoice-evidence';
import { checkBackupArchive, exportLocalBackup, restoreLocalBackup } from './local-backup';
import { listOpeningStockItems, listRestockDraft, listRestockPlanning, listRetailSales, listShopProfiles, newOperationId, readShopAttachmentReferences, removeRestockDraftLine, saveRestockDraftLine, setReorderPoint, type CustomerCreditInput, type RestockDraftLine, type RestockPlanningItem, type RetailSaleEvent } from './store';
import { ReceivingCompanion } from './ReceivingCompanion';
import { Action, Banner, Brand, Hint, Icon, IconButton, Input, Nav, Row, Screen, Section, Title, Warning, colors, styles, useReducedMotion } from './ui';

const cover = require('../assets/receipt-paper.jpg');

export function Back() {
  const { t, busy, mode } = useApp();
  return <IconButton icon="back" label={t('Back', 'वापस')} onPress={() => {
    if (busy) return;
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else if (mode) replaceScreen('deliveries');
    else router.replace('/');
  }} />;
}

export function Welcome() {
  const app = useApp();
  const { height } = useWindowDimensions();
  const ios = Platform.OS === 'ios';
  return (
    <Screen
      dark
      avoid={false}
      footer={(
        <>
          {app.problem ? <Warning>{app.problem}</Warning> : null}
          <Action title={ios ? (app.wisprStep === 'not-started' ? 'Set up with Wispr Flow' : 'Continue Wispr setup') : 'Set up my shop'} testID="setup-shop" disabled={app.busy} onPress={() => {
            if (!ios) return openScreen('setup');
            if (app.wisprStep === 'not-started') void app.updateWisprStep('account').catch(() => app.setProblem('Could not save Wispr setup progress. Try again.'));
            openScreen('flow-onboarding');
          }} />
        </>
      )}
    >
      <View style={local.welcomeTop}><Brand dark /></View>
      <Image source={cover} resizeMode="cover" accessible={false} style={[local.cover, { height: Math.min(305, height * 0.36) }]} />
      <Text accessibilityRole="header" style={local.welcomeTitle}>{'Say what\nhappened.'}</Text>
      <Text style={local.welcomeCaption}>Check the shop details, then confirm what to remember.</Text>
    </Screen>
  );
}

export function Setup({ creating = false }: { creating?: boolean }) {
  const app = useApp();
  const { profile, t } = app;
  const [name, setName] = useState(profile.name);
  const [language, setLanguage] = useState(profile.language);
  const editing = !creating && profile.setupComplete;
  const lt = (en: string, hi: string) => language === 'hi' ? hi : en;

  function continueSetup() {
    Keyboard.dismiss();
    const next = { id: profile.id, name: name.trim(), language, setupComplete: true };
    void app.run(async () => {
      if (!editing && Platform.OS === 'ios') await app.updateOpeningStockPending(true);
      await app.persistProfile(next);
      app.updateProfile(next);
      await app.refreshShopProfiles();
      if (editing) {
        router.back();
      } else if (Platform.OS !== 'ios') {
        openScreen('flow-onboarding');
      } else {
        await app.loadShop('live');
        replaceScreen('opening-stock');
      }
    }, t('Could not save your shop profile. Try again.', 'दुकान की जानकारी सहेजी नहीं जा सकी। फिर कोशिश करें।'));
  }

  return (
    <Screen nav={<Nav left={<Back />} />} footer={(
      <Action title={editing ? lt('Save changes', 'बदलाव सहेजें') : lt('Continue', 'आगे बढ़ें')} testID="setup-continue" disabled={app.busy} onPress={continueSetup} />
    )}>
      <Title title={editing ? lt('Shop profile', 'दुकान की जानकारी') : lt('Set up your shop', 'अपनी दुकान सेट करें')} subtitle={lt('Shop data is saved on this device; iOS backups may include it.', 'दुकान का डेटा इस डिवाइस पर सेव होता है; iOS बैकअप में शामिल हो सकता है।')} />
      <View style={styles.stack}>
        <Input
          label={lt('Shop name', 'दुकान का नाम')}
          testID="shop-name"
          placeholder={lt('Optional · e.g. Sharma General Store', 'वैकल्पिक · जैसे शर्मा जनरल स्टोर')}
          value={name}
          maxLength={100}
          onChangeText={(next) => {
            setName(next);
            if (!editing) app.updateSetup({ ...profile, name: next, language });
          }}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
        />
        {!editing ? <Hint>{lt('Optional. You can name this shop later.', 'वैकल्पिक। दुकान का नाम बाद में दे सकते हैं।')}</Hint> : null}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>{lt('Display language', 'ऐप की भाषा')}</Text>
          <View style={styles.group}>
            {(['en', 'hi'] as const).map((choice, index) => (
              <Row
                key={choice}
                title={choice === 'en' ? 'English' : 'हिन्दी'}
                selected={language === choice}
                border={index === 0}
                onPress={() => {
                  setLanguage(choice);
                  if (!editing) app.updateSetup({ ...profile, name, language: choice });
                }}
              />
            ))}
          </View>
        </View>
        {app.problem ? <Warning>{app.problem}</Warning> : null}
      </View>
    </Screen>
  );
}

export function FlowSetup({ onboarding = false }: { onboarding?: boolean }) {
  return Platform.OS === 'ios'
    ? <IOSFlowSetup onboarding={onboarding} />
    : Platform.OS === 'android'
      ? <AndroidFlowSetup onboarding={onboarding} />
      : <WebFlowSetup onboarding={onboarding} />;
}

function WebFlowSetup({ onboarding = false }: { onboarding?: boolean }) {
  const app = useApp();
  const { t } = app;
  async function continueWithTyping() {
    if (!onboarding) return router.back();
    await app.run(async () => {
      await app.updateWisprStep('later');
      await app.loadShop('live');
      replaceScreen('deliveries');
    }, t('Could not open your shop. Try again.', 'दुकान नहीं खुल सकी। फिर कोशिश करें।'));
  }
  return <Screen nav={<Nav left={<Back />} />} footer={(
    <Action title={onboarding ? t('Continue with typing', 'टाइप करके आगे बढ़ें') : t('Done', 'हो गया')} testID="flow-continue" disabled={app.busy} onPress={() => void continueWithTyping()} />
  )}>
      <Title title={t('Explore voice capture', 'वॉइस कैप्चर देखें')} subtitle={t('This browser preview uses typed notes. Set up Wispr Flow in the iPhone app to dictate.', 'इस ब्राउज़र प्रीव्यू में नोट टाइप करें। बोलकर लिखने के लिए iPhone ऐप में Wispr Flow सेट करें।')} />
    <View style={local.note}><Hint>{t('No microphone or Wispr account is used in this preview. Your shop records stay in this browser.', 'इस प्रीव्यू में माइक्रोफ़ोन या Wispr खाते का उपयोग नहीं होता। दुकान के रिकॉर्ड इसी ब्राउज़र में रहते हैं।')}</Hint></View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

function AndroidFlowSetup({ onboarding = false }: { onboarding?: boolean }) {
  const app = useApp();
  const { t } = app;
  const storeListing = 'https://play.google.com/store/apps/details?id=com.wispr.flowapp';
  function done() {
    if (!onboarding) return router.back();
    void app.run(async () => {
      const next = { ...app.profile, setupComplete: true };
      await app.persistProfile(next);
      app.updateProfile(next);
      await app.loadShop('live');
      router.replace('/(tabs)/deliveries');
    }, t('Could not open your shop. Try again.', 'दुकान नहीं खुल सकी। फिर कोशिश करें।'));
  }
  return (
    <Screen nav={<Nav left={<Back />} />} footer={(
      <>
        <Action title={t('Download Wispr Flow', 'Wispr Flow डाउनलोड करें')} onPress={() => {
          void Linking.openURL(storeListing).catch(() => app.setProblem(t('Could not open the app store.', 'ऐप स्टोर नहीं खुल सका।')));
        }} />
        <View style={{ alignItems: 'center' }}>
          <Action title={onboarding ? t('Continue with typing', 'टाइप करके आगे बढ़ें') : t('Done', 'हो गया')} kind="text" disabled={app.busy} onPress={done} />
        </View>
      </>
    )}>
      <Title title={t('Set up Wispr Flow', 'Wispr Flow सेट करें')} subtitle={t('Use the Flow Bubble to dictate here.', 'यहाँ बोलकर लिखने के लिए Flow Bubble चुनें।')} />
      {[
        { icon: 'notes' as const, title: t('Install and sign in', 'इंस्टॉल करें और साइन इन करें'), note: t('After installing, open Flow and sign in with Google or Apple.', 'इंस्टॉल करने के बाद Flow खोलें और Google या Apple से साइन इन करें।') },
        { icon: 'keyboard' as const, title: t('Enable the Flow Bubble', 'Flow Bubble चालू करें'), note: t('Follow Flow’s Android permission setup.', 'Android पर Flow की अनुमति के निर्देश देखें।') },
        { icon: 'globe' as const, title: t('Tap the Bubble to dictate', 'बोलने के लिए Bubble दबाएँ'), note: t('Focus Delivery details, then tap the Bubble.', 'डिलीवरी का विवरण चुनें, फिर Bubble दबाएँ।') },
      ].map((step) => <View key={step.icon} style={local.step}><Icon name={step.icon} color={colors.action} size={21} /><View style={styles.rowText}><Text style={styles.rowTitle}>{step.title}</Text><Hint>{step.note}</Hint></View></View>)}
      <View style={local.note}><Hint>{t('Dictation requires internet. You can type a receipt anytime.', 'बोलकर लिखने के लिए इंटरनेट चाहिए। आप कभी भी रसीद टाइप कर सकते हैं।')}</Hint></View>
      {app.problem ? <Warning>{app.problem}</Warning> : null}
    </Screen>
  );
}

function IOSFlowSetup({ onboarding = false }: { onboarding?: boolean }) {
  const app = useApp();
  const { t } = app;
  const step = app.wisprStep === 'not-started' || app.wisprStep === 'later' ? 'account' : app.wisprStep;
  const [sample, setSample] = useState('');
  const [confirmedFlow, setConfirmedFlow] = useState(false);
  const progress = step === 'account' ? 1 : step === 'keyboard' ? 2 : step === 'dictation' ? 3 : 0;

  async function advance(next: 'keyboard' | 'dictation' | 'ready' | 'later') {
    try {
      await app.updateWisprStep(next);
      if (next === 'ready' || next === 'later') {
        if (onboarding) openScreen('setup');
        else router.back();
      }
    } catch {
      app.setProblem(t('Could not save your setup progress. Try again.', 'सेटअप की प्रगति सहेजी नहीं जा सकी। फिर कोशिश करें।'));
    }
  }

  async function openWisprAppStore() {
    const appStoreApp = 'itms-apps://itunes.apple.com/app/id6497229487';
    const appStoreWeb = 'https://apps.apple.com/app/id6497229487';

    if (!Device.isDevice) {
      app.setProblem(t(
        'The App Store is not available in Simulator. Open this step on your iPhone to download Wispr Flow.',
        'Simulator में App Store उपलब्ध नहीं है। Wispr Flow डाउनलोड करने के लिए यह चरण iPhone पर खोलें।',
      ));
      return;
    }

    try {
      await Linking.openURL(appStoreApp);
    } catch {
      try {
        await Linking.openURL(appStoreWeb);
      } catch {
        app.setProblem(t('Could not open the App Store. Search for “Wispr Flow” there.', 'App Store नहीं खुल सका। वहाँ “Wispr Flow” खोजें।'));
      }
    }
  }

  const title = step === 'account' ? t('Set up voice capture', 'वॉइस कैप्चर सेट करें')
    : step === 'keyboard' ? t('Enable the Flow keyboard', 'Flow कीबोर्ड चालू करें')
      : step === 'dictation' ? t('Try a real dictation', 'डिक्टेशन आज़माएँ')
        : step === 'ready' ? t('Wispr Flow is ready', 'Wispr Flow तैयार है')
          : t('Set up Wispr Flow', 'Wispr Flow सेट करें');
  const subtitle = step === 'account'
    ? t('Use Wispr Flow to dictate shop updates.', 'दुकान की बातें बोलकर लिखने के लिए Wispr Flow इस्तेमाल करें।')
    : step === 'keyboard'
      ? t('Add Flow in iPhone Settings, then allow Full Access so dictation can reach the internet.', 'iPhone Settings में Flow जोड़ें, फिर इंटरनेट डिक्टेशन के लिए Full Access दें।')
      : step === 'dictation'
        ? t('Tap the field, switch to Flow with the globe key, and dictate a short delivery note.', 'फ़ील्ड पर टैप करें, ग्लोब से Flow चुनें और डिलीवरी का छोटा नोट बोलें।')
        : step === 'ready'
          ? t('You can dictate delivery notes into DukaanFlow’s text fields.', 'आप DukaanFlow के टेक्स्ट फ़ील्ड में डिलीवरी नोट बोल सकते हैं।')
          : t('Flow handles sign-in and dictation. DukaanFlow keeps your confirmed delivery ledger.', 'साइन-इन और डिक्टेशन Flow संभालता है। पुष्टि की गई डिलीवरी DukaanFlow में रहती है।');

  return (
    <Screen nav={<Nav left={<Back />} />} footer={(
      <>
        {step === 'account' ? <Action title={t('Download Wispr Flow', 'Wispr Flow डाउनलोड करें')} testID="wispr-download" onPress={() => {
          void openWisprAppStore();
        }} /> : null}
        {step === 'account' ? <Action title={t('Already installed? Continue', 'पहले से इंस्टॉल है? आगे बढ़ें')} testID="wispr-account-done" kind="text" onPress={() => void advance('keyboard')} /> : null}
        {step === 'keyboard' ? <Action title={t('I added Flow and allowed Full Access', 'मैंने Flow जोड़ा और Full Access दिया')} testID="wispr-keyboard-done" onPress={() => void advance('dictation')} /> : null}
        {step === 'dictation' ? <Action title={t('Flow dictation worked', 'Flow डिक्टेशन चल गया')} testID="wispr-dictation-done" disabled={!sample.trim() || !confirmedFlow} onPress={() => void advance('ready')} /> : null}
        {step === 'ready' && onboarding ? <Action title={t('Continue to shop setup', 'दुकान सेटअप जारी रखें')} testID="flow-continue" onPress={() => openScreen('setup')} /> : null}
        {step === 'ready' && !onboarding ? <Action title={t('Test dictation again', 'डिक्टेशन फिर जाँचें')} testID="wispr-test-again" kind="outline" onPress={() => void advance('dictation')} /> : null}
        {onboarding && step !== 'ready' ? <View style={{ alignItems: 'center' }}>
          <Action title={t('Set up later · continue with typing', 'बाद में सेट करें · टाइप करके जारी रखें')} testID="flow-continue" kind="text" onPress={() => void advance('later')} />
        </View> : null}
        {!onboarding ? <View style={{ alignItems: 'center' }}>
          <Action title={t('Done', 'हो गया')} kind="text" onPress={() => router.back()} />
        </View> : null}
      </>
    )}>
      <Title title={title} subtitle={subtitle} />
      {progress > 0 ? <Text style={local.flowProgress}>{t(`STEP ${progress} OF 3`, `चरण ${progress} / 3`)}</Text> : null}
      {step === 'account' ? <>
        <View style={local.flowAccountCard}>
          <View style={local.flowAccountHeader}>
            <View style={local.flowAccountMark}><Icon name="keyboard" color={colors.action} size={20} /></View>
            <View style={local.flowAccountCopy}>
              <Text style={local.flowAccountTitle}>{t('Voice notes with Wispr Flow', 'Wispr Flow से वॉइस नोट')}</Text>
              <Text style={local.flowAccountSubtitle}>{t('Speech becomes editable shop notes.', 'बोली गई बात संपादन योग्य दुकान नोट बनेगी।')}</Text>
            </View>
          </View>
          <View style={local.flowAccountDivider} />
          <View style={local.flowAccountStep}>
            <Icon name="notes" color={colors.action} size={18} />
            <Text style={local.flowAccountStepText}>{t('Install Flow and sign in there.', 'Flow इंस्टॉल करें और वहीं साइन इन करें।')}</Text>
          </View>
          <View style={local.flowAccountStep}>
            <Icon name="keyboard" color={colors.action} size={18} />
            <Text style={local.flowAccountStepText}>{t('Allow microphone access when Flow asks.', 'Flow पूछे तो माइक्रोफ़ोन की अनुमति दें।')}</Text>
          </View>
        </View>
        <View style={local.flowAccountNote}><Text style={local.flowAccountNoteText}>{t('Your Wispr sign-in stays in Flow. Typing is always available.', 'आपका Wispr साइन-इन Flow में ही रहता है। टाइप करना हमेशा उपलब्ध है।')}</Text></View>
      </> : null}
      {step === 'keyboard' ? <>
        <View style={local.step}><Icon name="keyboard" color={colors.action} size={21} /><View style={styles.rowText}><Text style={styles.rowTitle}>{t('Settings → General → Keyboard → Keyboards', 'Settings → General → Keyboard → Keyboards')}</Text><Hint>{t('Tap Add New Keyboard and choose Wispr Flow.', 'Add New Keyboard दबाएँ और Wispr Flow चुनें।')}</Hint></View></View>
        <View style={local.step}><Icon name="globe" color={colors.action} size={21} /><View style={styles.rowText}><Text style={styles.rowTitle}>{t('Turn on Allow Full Access', 'Allow Full Access चालू करें')}</Text><Hint>{t('Confirm Apple’s alert. Flow needs network access for transcription. Microphone access is enabled in the Flow app.', 'Apple का संदेश स्वीकार करें। ट्रांसक्रिप्शन के लिए Flow को इंटरनेट चाहिए। माइक्रोफ़ोन अनुमति Flow ऐप में दें।')}</Hint></View></View>
      </> : null}
      {step === 'dictation' ? <>
        <TextInput accessibilityLabel={t('Wispr Flow dictation trial', 'Wispr Flow डिक्टेशन परीक्षण')} testID="wispr-dictation-field" style={local.dictationField} placeholder={t('Try: Sharma delivered 12 Maggi packets', 'आज़माएँ: शर्मा ने मैगी के 12 पैकेट दिए')} placeholderTextColor={colors.muted} value={sample} onChangeText={setSample} multiline autoCorrect={false} />
        <Hint>{t('Tap the globe key and choose Wispr Flow. A typed trial is fine for exploring, but only confirm this step if you dictated using Flow.', 'ग्लोब बटन से Wispr Flow चुनें। टाइप करके देख सकते हैं, लेकिन इस चरण की पुष्टि तभी करें जब Flow से बोला हो।')}</Hint>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmedFlow }} testID="wispr-confirmed-by-owner" onPress={() => setConfirmedFlow((value) => !value)} style={local.flowConfirm}>
          <View style={[local.flowCheckbox, confirmedFlow && local.flowCheckboxChecked]}><Text style={local.flowCheckmark}>{confirmedFlow ? '✓' : ''}</Text></View>
          <Text style={local.flowConfirmText}>{t('I dictated this with Wispr Flow', 'मैंने Wispr Flow से बोलकर लिखा')}</Text>
        </Pressable>
      </> : null}
      {step !== 'account' ? <View style={local.note}>
        <Hint>{t('Wispr dictation needs internet. DukaanFlow typing remains available, and delivery confirmation always stays in DukaanFlow.', 'Wispr डिक्टेशन के लिए इंटरनेट चाहिए। DukaanFlow में टाइप और डिलीवरी की पुष्टि हमेशा उपलब्ध है।')}</Hint>
        {Platform.OS === 'ios' ? <Hint>{t('For Hindi in Latin script, choose Hinglish in Flow.', 'रोमन में हिन्दी के लिए Flow में Hinglish चुनें।')}</Hint> : null}
      </View> : null}
      {app.problem ? <Warning>{app.problem}</Warning> : null}
    </Screen>
  );
}

function businessDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day'].map((part) => parts.find((entry) => entry.type === part)?.value).join('-');
}

export function displayDate(value: string, hindi: boolean) {
  return new Intl.DateTimeFormat(hindi ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function Deliveries() {
  const app = useApp();
  const { t, notice } = app;
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState(() => new Map<string, string>());
  const shopId = app.profile.id;
  const mode = app.mode;
  const [customerPurchaseHistory, setCustomerPurchaseHistory] = useState<{ shopId: string; sales: RetailSaleEvent[] } | null>(null);
  const [purchaseHistoryError, setPurchaseHistoryError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (mode) void listRetailSales(mode, undefined, 50).then((sales) => {
      if (active) { setCustomerPurchaseHistory({ shopId, sales }); setPurchaseHistoryError(false); }
    }, () => { if (active) setPurchaseHistoryError(true); });
    return () => { active = false; };
  }, [mode, shopId, notice?.id, notice?.type]));
  const customerCapture = noteDrafts.get(shopId) ?? '';
  const canSubmitNote = !app.busy && Boolean(customerCapture.trim());
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const homeEventField = useRef<TextInput>(null);
  const query = search.toLocaleLowerCase().trim();
  const filtered = app.receipts.filter((record) => !query || [
    record.supplier ?? '',
    record.businessDate,
    ...record.lines.map((item) => `${item.name} ${item.packSize}`),
  ].some((field) => field.toLocaleLowerCase().includes(query)));
  const filteredDeliveries = app.deliveries.filter((record) => !query || [
    record.supplier,
    record.invoiceNumber ?? '',
    record.businessDate,
    ...record.lines.map((item) => `${item.name} ${item.packSize}`),
  ].some((field) => field.toLocaleLowerCase().includes(query)));
  const sales = customerPurchaseHistory?.shopId === shopId ? customerPurchaseHistory.sales : [];
  const productsById = new Map(app.catalog.map((item) => [item.id, item]));
  const saleLabel = (sale: RetailSaleEvent) => sale.customerId ? sale.customerLabel : t('Walk-in customer', 'आम ग्राहक');
  const filteredSales = sales.filter((sale) => !query || [saleLabel(sale), sale.sourceText,
    ...sale.lines.map((line) => productsById.get(line.catalogueItemId)?.name ?? ''),
  ].some((field) => field.toLocaleLowerCase().includes(query)));
  const activityCount = app.receipts.length + app.deliveries.length + sales.length;
  const matchCount = filtered.length + filteredDeliveries.length + filteredSales.length;
  const dates = [...new Set([...filtered, ...filteredDeliveries, ...filteredSales].map((record) => record.businessDate))].sort().reverse();
  const savedDelivery = notice?.type === 'saved' ? app.deliveries.find((record) => record.id === notice.id) : undefined;

  function submitHomeNote() {
    const source = customerCapture.trim();
    if (!source) return;
    Keyboard.dismiss();
    if (source.length > MAX_HOME_NOTE_LENGTH) {
      Alert.alert(
        t('This note is too long', 'यह नोट बहुत लंबा है'),
        t('Your full note is still here. Shorten it or submit it in smaller notes. No records were changed.', 'आपका पूरा नोट यहीं है। इसे छोटा करें या अलग नोट में दर्ज करें। कोई रिकॉर्ड नहीं बदला।'),
      );
      return;
    }
    const analysis = analyzeHomeNote(source, app.customers, app.suppliers, businessDate(), app.catalog);
    const supplierEvents = analysis.events.filter((event) => event.kind === 'supplier');
    const customerEvents = analysis.events.filter((event) => event.kind === 'customer');
    const operationId = newOperationId();
    const newCustomerId = customerEvents.find((event) => event.kind === 'customer' && event.newCustomer)
      ? `${operationId}:customer-profile`
      : undefined;
    const batch = toHomeNoteBatchInput(analysis, newCustomerId);
    if (batch) {
      void (async () => {
        const saved = await app.run(
          async () => app.saveHomeNoteBatch(operationId, batch),
          t('Could not save this note. Check stock and try again.', 'नोट सहेजा नहीं जा सका। स्टॉक जाँचकर फिर कोशिश करें।'),
        );
        if (saved) setNoteDrafts((current) => updateHomeNoteDraft(current, shopId, '', customerCapture));
      })();
      return;
    }

    const homeCredit = resolveHomeCreditCapture(source, app.customers, app.suppliers, app.catalog, businessDate());
    if (homeCredit?.customerId && analysis.events.length === 1 && analysis.events[0].kind === 'customer') {
      const operationId = newOperationId();
      const input: CustomerCreditInput = {
        customerId: homeCredit.customerId,
        kind: homeCredit.kind,
        amountPaise: homeCredit.amountPaise,
        paymentMethod: homeCredit.paymentMethod,
        note: null,
        sourceText: homeCredit.sourceText,
      };
      void (async () => {
        let savedEventId: string | null = null;
        const saved = await app.run(async () => {
          if (homeCredit.promise) {
            const result = await app.saveCustomerEventWithPromise(operationId, `${operationId}:promise`, input, {
              amountPaise: homeCredit.promise.amountPaise,
              dueDate: homeCredit.promise.dueDate,
              note: null,
            });
            savedEventId = result.event.id;
          } else {
            const result = await app.saveCustomerEvent(operationId, input);
            savedEventId = result.id;
          }
        }, t('Could not save this customer entry. Check the amount and try again.', 'ग्राहक की यह बात सहेजी नहीं जा सकी। रकम जाँचकर फिर कोशिश करें।'));
        if (saved && savedEventId) {
          setNoteDrafts((current) => updateHomeNoteDraft(current, shopId, '', customerCapture));
          app.setNotice({ id: savedEventId, type: 'home-credit-saved' });
        }
      })();
      return;
    }

    const hasMixedIntent = supplierEvents.length > 0 && customerEvents.length > 0;
    if (analysis.clarification) {
      const { kind, ambiguous, label } = analysis.clarification;
      const detail = label.slice(0, 120);
      const question = kind === 'quantity'
        ? t(`How much “${detail}” was involved? Add the quantity and unit to the note.`, `“${detail}” की कितनी मात्रा थी? नोट में मात्रा और इकाई जोड़ें।`)
        : kind === 'catalog'
        ? ambiguous
          ? t(`Which product or pack size did you mean by “${detail}”?`, `“${detail}” से आपका मतलब कौन-सा उत्पाद या पैक है?`)
          : t(`Which product in this shop matches “${detail}”? Check its name and stock unit in Products.`, `“${detail}” इस दुकान के किस उत्पाद से मिलता है? उत्पाद में नाम और स्टॉक की इकाई जाँचें।`)
        : ambiguous
          ? t(`Which ${kind} did you mean by “${detail}”? Use their full name in the note.`, `“${detail}” से आपका मतलब कौन-सा ${kind === 'supplier' ? 'सप्लायर' : 'ग्राहक'} है? नोट में पूरा नाम लिखें।`)
          : t(`I couldn't match “${detail}” to a ${kind} in this shop. Check their name or alias.`, `“${detail}” इस दुकान के किसी ${kind === 'supplier' ? 'सप्लायर' : 'ग्राहक'} से नहीं मिला। उनका नाम या बोलचाल का नाम जाँचें।`);
      Alert.alert(
        t('Some details need clarification', 'कुछ जानकारी स्पष्ट करें'),
        `${question}\n\n${t('No records changed. Your transcript is still here.', 'कोई रिकॉर्ड नहीं बदला। आपका ट्रांसक्रिप्ट यहीं है।')}`,
      );
      return;
    }
    if (hasMixedIntent || analysis.unresolvedSegments.length > 1) {
      Alert.alert(
        t('Couldn’t safely save this note', 'यह नोट सुरक्षित रूप से सहेजा नहीं जा सका'),
        t('No records were changed. I could not safely extract every customer, supplier, amount, product, quantity, promise, or delivery difference in this note. Your transcript is still here; clarify the uncertain words and submit again.', 'कोई रिकॉर्ड नहीं बदला। इस नोट में ग्राहक, सप्लायर, रकम, सामान, मात्रा, वादा या डिलीवरी का अंतर पूरी तरह सुरक्षित रूप से स्पष्ट नहीं हुआ। आपका ट्रांसक्रिप्ट यहीं है; अस्पष्ट शब्द ठीक करके फिर दर्ज करें।'),
      );
      return;
    }

    const destination = classifyHomeCapture(source, app.customers, app.suppliers, businessDate());
    const issue = destination === 'customer'
      ? t('I found a customer event but could not resolve every amount, item, or promise safely. No record changed; your transcript is still here. Add the missing detail and submit again.', 'ग्राहक की बात मिली, लेकिन हर रकम, सामान या वादा सुरक्षित रूप से स्पष्ट नहीं हुआ। कोई रिकॉर्ड नहीं बदला; आपका ट्रांसक्रिप्ट यहीं है। छूटी जानकारी जोड़कर फिर दर्ज करें।')
      : destination === 'supplier'
        ? t('I found a supplier delivery but could not resolve every product, unit, or invoice detail safely. No record changed; your transcript is still here. Clarify the shop contact or product details and submit again.', 'सप्लायर की डिलीवरी मिली, लेकिन हर सामान, इकाई या बिल की जानकारी सुरक्षित रूप से स्पष्ट नहीं हुई। कोई रिकॉर्ड नहीं बदला; आपका ट्रांसक्रिप्ट यहीं है। संपर्क या सामान की जानकारी स्पष्ट करके फिर दर्ज करें।')
        : t('I could not safely categorize every part of this note. No record changed; your transcript is still here. Add the shop contact or clarify the words that were misheard, then submit again.', 'इस नोट के सभी हिस्सों की श्रेणी सुरक्षित रूप से तय नहीं हो सकी। कोई रिकॉर्ड नहीं बदला; आपका ट्रांसक्रिप्ट यहीं है। दुकान का संपर्क जोड़ें या गलत सुने गए शब्द स्पष्ट करके फिर दर्ज करें।');
    Alert.alert(
      t('Some details need clarification', 'कुछ जानकारी स्पष्ट करें'),
      issue,
      [{ text: t('OK', 'ठीक है'), style: 'default' }],
    );
  }

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => app.setNotice((current) => current === notice ? null : current), 10000);
    return () => clearTimeout(timeout);
  }, [notice, app.setNotice]);

  useEffect(() => { setSearch(''); }, [app.mode, notice]);

  return (
    <Screen
      nav={<Nav left={<Brand />} right={<IconButton icon="settings" label={t('Shop settings', 'दुकान की सेटिंग')} onPress={() => openScreen('settings')} filled testID="shop-settings" />} />}
      footer={<HomeActionRing
        t={t}
        onExpandedChange={setActionMenuOpen}
        onNote={() => homeEventField.current?.focus()}
        onScanInvoice={app.startInvoiceScan}
        onReceiveDelivery={app.startReceipt}
      />}
    >
      <View style={local.homeCenterGroup}>
        <View style={local.homeHeading}>
          <Text style={local.homeEyebrow}>{displayDate(businessDate(), app.profile.language === 'hi')}</Text>
          <Text accessibilityRole="header" style={local.homeHeadline}>{app.profile.name || t('Your shop', 'आपकी दुकान')}</Text>
        </View>
        <View style={local.captureCard}>
          <Text style={local.captureTitle}>{t('New note', 'नई बात')}</Text>
          <TextInput
            ref={homeEventField}
            accessibilityLabel={t('Shop update for Wispr Flow or typing', 'Wispr Flow या टाइप करने के लिए दुकान की बात')}
            accessibilityHint={t('Record a supplier delivery or a customer purchase.', 'सप्लायर की डिलीवरी या ग्राहक की खरीद दर्ज करें।')}
            placeholder={t('“Sharma delivered 12 packets…”', '“शर्मा ने 12 पैकेट भेजे…”')}
            placeholderTextColor={colors.muted}
            value={customerCapture}
            onChangeText={(text) => setNoteDrafts((current) => updateHomeNoteDraft(current, shopId, text))}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            testID="home-event-capture"
            style={local.captureInput}
          />
          <View style={local.captureActions}>
            <Text style={local.captureHint}>{Platform.OS === 'ios'
              ? t('Wispr Flow or type', 'Wispr Flow या टाइप करें')
              : t('Type a note', 'बात लिखें')}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmitNote }} accessibilityLabel={t('Submit note', 'बात दर्ज करें')} testID="submit-home-note" disabled={!canSubmitNote} onPress={submitHomeNote} style={({ pressed }) => [local.reviewEntry, !canSubmitNote && local.reviewEntryDisabled, pressed && local.reviewEntryPressed]}>
              <Text style={local.reviewEntryText}>{t('Submit', 'दर्ज करें')}</Text><Icon name="next" size={16} color={colors.action} />
            </Pressable>
          </View>
        </View>
      </View>
      {notice ? (
        savedDelivery ? (
          <View testID="delivery-confirmation-notice" style={local.savedDeliveryNotice}>
            <ReceivingCompanion
              mood="confirmed"
              inline
              style={{ flex: 1, marginBottom: 0 }}
              detailOverride={t(`${savedDelivery.supplier} · ${savedDelivery.lines.length} items confirmed`, `${savedDelivery.supplier} · ${savedDelivery.lines.length} उत्पाद की पुष्टि`)}
            />
            <Action title={t('Undo', 'वापस लें')} kind="text" testID="undo-confirmed-delivery" onPress={() => app.reverseDelivery(notice.id)} />
          </View>
        ) : (
          <Banner
            title={notice.type === 'home-new-customer-saved' ? t(`${notice.customerName ?? 'Customer'} added · credit recorded`, `${notice.customerName ?? 'ग्राहक'} जोड़े गए · उधार दर्ज`) : notice.type === 'home-note-saved' ? t('Note saved · shop records updated', 'नोट सहेजा गया · दुकान के रिकॉर्ड अपडेट हुए') : notice.type === 'home-note-reversed' ? t('Note reversed · records corrected', 'नोट वापस लिया · रिकॉर्ड ठीक हुए') : notice.type === 'home-credit-saved' ? t('Credit saved · customer balance updated', 'उधार दर्ज · ग्राहक का बाकी अपडेट हुआ') : notice.type === 'retail-sale-saved' ? t('Sale saved · payment not specified', 'बिक्री सहेजी गई · भुगतान नहीं बताया') : notice.type === 'retail-sale-reversed' ? t('Sale reversed', 'बिक्री वापस ली गई') : notice.type === 'saved' ? t('Receipt saved', 'रसीद सहेजी गई') : t('Receipt reversed', 'रसीद वापस ली गई')}
            actionTitle={notice.type === 'saved' || notice.type === 'retail-sale-saved' || notice.type === 'home-note-saved' || notice.type === 'home-new-customer-saved' || notice.type === 'home-credit-saved' ? t('Undo', 'वापस लें') : undefined}
            onAction={notice.type === 'home-note-saved' || notice.type === 'home-new-customer-saved' ? () => void app.run(() => app.undoHomeNoteBatch(notice.id), t('Could not reverse this note. Try again.', 'नोट वापस नहीं लिया जा सका। फिर कोशिश करें।')) : notice.type === 'home-credit-saved' ? () => void app.run(async () => { await app.reverseCustomerEvent(notice.id, newOperationId()); }, t('Could not reverse this customer entry. Try again.', 'ग्राहक की यह प्रविष्टि वापस नहीं ली जा सकी। फिर कोशिश करें।')) : notice.type === 'saved' ? () => app.reverse(notice.id) : notice.type === 'retail-sale-saved' ? () => void app.run(() => app.undoRetailSale(notice.id), t('Could not reverse the sale. Try again.', 'बिक्री वापस नहीं ली जा सकी। फिर कोशिश करें।')) : undefined}
            motion
          />
        )
      ) : null}
      {app.problem ? <Warning>{app.problem}</Warning> : null}
      <View
        pointerEvents={actionMenuOpen ? 'none' : 'auto'}
        accessibilityElementsHidden={actionMenuOpen}
        importantForAccessibility={actionMenuOpen ? 'no-hide-descendants' : 'auto'}
        style={{ opacity: actionMenuOpen ? 0.12 : 1 }}
      >
      {activityCount > 0 ? (
        <View style={[local.search, searchFocused && local.searchFocused]}>
          <Icon name="search" color={colors.muted} size={18} />
          <TextInput
            accessibilityLabel={t('Search recent activity', 'हाल की गतिविधि खोजें')}
            placeholder={t('Search recent activity', 'हाल की गतिविधि खोजें')}
            placeholderTextColor={colors.muted}
            style={local.searchInput}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => Keyboard.dismiss()}
            testID="deliveries-search"
            autoCapitalize="none"
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
          />
          {search ? <Pressable accessibilityRole="button" accessibilityLabel={t('Clear search', 'खोज साफ़ करें')} onPress={() => setSearch('')} style={local.clear}><Text style={styles.body}>×</Text></Pressable> : null}
        </View>
      ) : null}
      {activityCount === 0 ? <View style={local.emptyActivity}>
        <Text style={local.emptyActivityTitle}>{t('Recent activity', 'हाल की गतिविधि')}</Text>
        <Text style={local.emptyActivityCopy}>{t('Supplier deliveries and customer purchases appear here.', 'सप्लायर की डिलीवरी और ग्राहक की खरीद यहाँ दिखेगी।')}</Text>
      </View> : null}
      {purchaseHistoryError ? <Hint>{t('Could not load recent purchases.', 'हाल की खरीद नहीं खुली।')}</Hint> : null}
      {matchCount === 0 ? (
        query ? <View style={local.noResults}>
            <Text style={styles.section}>{t('No matching activity', 'कोई मिलती गतिविधि नहीं मिली')}</Text>
            <Text style={local.centerHint}>{t('Try a supplier, customer, or product name.', 'सप्लायर, ग्राहक या उत्पाद का नाम खोजें।')}</Text>
          </View> : null
      ) : <>
        <View style={local.recentHeading}><Section>{t('Recent activity', 'हाल की गतिविधि')}</Section>{query ? <Text style={local.resultCount}>{matchCount}</Text> : null}</View>
        {dates.map((date) => (
        <View key={date} style={{ marginBottom: 18 }}>
          <Section>{date === businessDate() ? t('Today', 'आज') : displayDate(date, app.profile.language === 'hi')}</Section>
          {filteredDeliveries.filter((record) => record.businessDate === date).map((record) => (
            <Row
              key={`delivery-${record.id}`}
              title={record.supplier || t('Supplier not recorded', 'सप्लायर दर्ज नहीं है')}
              subtitle={[
                record.invoiceNumber ? t(`Invoice ${record.invoiceNumber}`, `बिल ${record.invoiceNumber}`) : null,
                t(`${record.lines.length} ${record.lines.length === 1 ? 'item' : 'items'}`, `${record.lines.length} उत्पाद`),
                record.reversedAt ? t('Reversed', 'वापस ली गई') : null,
              ].filter(Boolean).join(' · ')}
              value={formatPaise(record.invoiceTotalPaise)}
              onPress={() => {
                app.setActiveDeliveryId(record.id);
                Keyboard.dismiss();
                openScreen('delivery');
              }}
              testID="delivery-row"
            />
          ))}
          {filtered.filter((record) => record.businessDate === date).map((record) => (
            <Row
              key={record.id}
              title={record.supplier || t('Supplier not recorded', 'सप्लायर दर्ज नहीं है')}
              subtitle={[
                t(`${record.lines.length} ${record.lines.length === 1 ? 'item' : 'items'}`, `${record.lines.length} उत्पाद`),
                record.amountPaidPaise === null ? null : t(`${formatPaise(record.amountPaidPaise)} paid`, `${formatPaise(record.amountPaidPaise)} दिए`),
                record.reversedAt ? t('Reversed', 'वापस ली गई') : null,
              ].filter(Boolean).join(' · ')}
              onPress={() => {
                app.setActiveId(record.id);
                Keyboard.dismiss();
                openScreen('receipt');
              }}
              testID="receipt-row"
            />
          ))}
          {filteredSales.filter((sale) => sale.businessDate === date).map((sale) => {
            const { customerId } = sale;
            return <Row key={sale.id} title={saleLabel(sale)}
              subtitle={sale.lines.map(({ catalogueItemId, quantity }) => {
                const product = productsById.get(catalogueItemId);
                return product ? `${product.name} × ${quantity}` : t('Archived product', 'पुराना उत्पाद');
              }).join(' · ')}
              value={sale.amountPaise === null ? undefined : formatPaise(sale.amountPaise)}
              onPress={customerId ? () => {
                Keyboard.dismiss();
                void app.run(async () => {
                  await app.openCustomer(customerId);
                  openScreen('customer');
                }, t('Could not open this customer.', 'यह ग्राहक नहीं खुल सका।'));
              } : undefined}
              testID="recent-purchase" />;
          })}
        </View>
        ))}
      </>}
      </View>
    </Screen>
  );
}

export function Settings() {
  const app = useApp();
  const { t } = app;
  const [fileReport, setFileReport] = useState<{ id: string; name: string; checked: number; unavailable: number }[] | null>(null);
  const [backupExported, setBackupExported] = useState(false);
  const [backupChecked, setBackupChecked] = useState<{ shops: number; files: number } | null>(null);

  function verifyBackup() {
    setBackupChecked(null);
    void app.run(async () => {
      const manifest = await checkBackupArchive();
      if (manifest) setBackupChecked({ shops: manifest.databases.filter((entry) => entry.shopId).length, files: manifest.media.length });
    }, t('Could not verify this backup. Choose an intact DukaanFlow backup ZIP.', 'इस बैकअप की जाँच नहीं हुई। सही DukaanFlow बैकअप ZIP चुनें।'));
  }

  function confirmBackupExport() {
    Alert.alert(
      t('Export shop backup?', 'दुकान का बैकअप निकालें?'),
      t('The ZIP contains records and attachments from all shops. It is not password protected. Choose a private folder in Files.', 'ZIP में सभी दुकानों के रिकॉर्ड और अटैचमेंट हैं। इसमें पासवर्ड नहीं है। Files में निजी फ़ोल्डर चुनें।'),
      [
        { text: t('Cancel', 'रद्द करें'), style: 'cancel' },
        { text: t('Continue', 'आगे बढ़ें'), onPress: () => {
          setBackupExported(false);
          void app.run(async () => { setBackupExported(await exportLocalBackup()); },
            t('Could not export the backup. Check saved files and available storage, then try again.', 'बैकअप नहीं निकला। सहेजी गई फ़ाइलें और खाली जगह जाँचकर फिर कोशिश करें।'));
        } },
      ],
    );
  }

  function confirmBackupRestore() {
    Alert.alert(
      t('Restore all shops from a backup?', 'बैकअप से सभी दुकानें बहाल करें?'),
      t('DukaanFlow will verify the ZIP and reopen with its shops, records, and attachments. Export your current shops first if you need to return to them.', 'DukaanFlow ZIP की जाँच करके उसकी दुकानें, रिकॉर्ड और अटैचमेंट खोलेगा। मौजूदा दुकानों पर वापस जाना हो तो पहले उनका बैकअप निकालें।'),
      [
        { text: t('Cancel', 'रद्द करें'), style: 'cancel' },
        { text: t('Choose backup', 'बैकअप चुनें'), onPress: () => {
          void app.run(async () => {
            if (await restoreLocalBackup()) {
              app.setWorkspaceRestartRequired(true);
              await reloadAppAsync('DukaanFlow backup restore').catch(() => {});
            }
          }, t('Could not restore this backup. Check the ZIP and available storage.', 'बैकअप बहाल नहीं हुआ। ZIP और खाली जगह जाँचें।'));
        } },
      ],
    );
  }

  function checkSavedFiles() {
    setFileReport(null);
    void app.run(async () => {
      const documents = app.workspaceMediaDirectory;
      if (!documents) throw new Error('Documents directory unavailable.');
      const report = [];
      for (const shop of await listShopProfiles()) {
        const references = await readShopAttachmentReferences(shop.id);
        const paths = [
          ...references.invoices.map((reference) => resolveSavedInvoicePage(reference, documents)),
          ...references.products.map((reference) => resolveSavedProductPhoto(reference, documents)),
        ];
        const counts = new Map<string, number>();
        let unavailable = 0;
        for (const path of paths) {
          if (path) counts.set(path, (counts.get(path) ?? 0) + 1);
          else unavailable += 1;
        }
        for (const [path, count] of counts) {
          const info = await FileSystem.getInfoAsync(path);
          if (!info.exists || info.isDirectory || info.size === 0) {
            unavailable += count;
          }
        }
        report.push({ id: shop.id, name: shop.name, checked: paths.length, unavailable });
      }
      setFileReport(report);
    }, t('Could not check saved files. Try again.', 'सहेजी गई फ़ाइलों की जाँच नहीं हुई। फिर कोशिश करें।'));
  }
  return (
    <Screen nav={<Nav left={<Back />} />}>
      <Title title={t('Settings', 'सेटिंग')} subtitle={t(`For ${app.profile.name || 'this shop'}`, `${app.profile.name || 'इस दुकान'} के लिए`)} />
      <Text style={local.settingsSection}>{t('SHOP', 'दुकान')}</Text>
      <View style={styles.group}>
        <SettingsRow icon="globe" title={t('Shop profile & language', 'दुकान की जानकारी और भाषा')} subtitle={`${app.profile.name || t('Name your shop', 'दुकान का नाम दें')} · ${app.profile.language === 'en' ? 'English' : 'हिन्दी'}`} testID="settings-shop-profile" onPress={() => openScreen('shop-setup')} />
      </View>
      <Text style={local.settingsSection}>{t('VOICE & INPUT', 'आवाज़ और इनपुट')}</Text>
      <View style={styles.group}>
        <SettingsRow icon="keyboard" title={t('Wispr Flow', 'Wispr Flow')} subtitle={Platform.OS === 'android'
          ? t('Android dictation instructions', 'Android पर बोलकर लिखने के निर्देश')
          : Platform.OS === 'web'
            ? t('Type to explore this browser preview', 'इस ब्राउज़र प्रीव्यू में टाइप करके देखें')
            : app.wisprStep === 'ready'
          ? t('Ready · test or review setup', 'तैयार · जाँचें या सेटअप देखें')
          : app.wisprStep === 'later' || app.wisprStep === 'not-started'
            ? t('Finish setup · sign in, keyboard, dictation', 'सेटअप पूरा करें · साइन-इन, कीबोर्ड, डिक्टेशन')
            : t('Resume setup · step saved on this device', 'सेटअप जारी रखें · चरण इसी डिवाइस पर सहेजा है')}
          testID="settings-wispr-flow" onPress={() => openScreen('flow')} />
      </View>
      <Text style={local.settingsSection}>{t('SHOP RECORDS', 'दुकान के रिकॉर्ड')}</Text>
      <View style={styles.group}>
        <SettingsRow icon="notes" title={t('Customers', 'ग्राहक')} subtitle={t('Credit, payments and promises', 'उधार, भुगतान और वादे')} testID="settings-customers" onPress={() => openScreen('customers')} />
        <SettingsRow icon="box" title={t('Suppliers', 'सप्लायर')} subtitle={t('Deliveries, invoices and payables', 'डिलीवरी, बिल और बकाया')} testID="settings-suppliers" onPress={() => openScreen('suppliers')} />
        <SettingsRow icon="camera" title={t('Products & stock', 'उत्पाद और स्टॉक')} subtitle={t('Catalog and on-hand quantities', 'सूची और उपलब्ध मात्रा')} testID="settings-products" onPress={() => openScreen('catalogue')} last={Platform.OS !== 'ios'} />
        {Platform.OS === 'ios' ? <SettingsRow icon="box" title={t('Add opening stock', 'मौजूदा स्टॉक जोड़ें')} subtitle={t('Scan products you already have', 'मौजूदा उत्पादों को स्कैन करें')} testID="settings-opening-stock" onPress={() => openScreen('opening-stock')} last /> : null}
      </View>
      <Text style={local.settingsSection}>{t('DATA & RECOVERY', 'डेटा और रिकवरी')}</Text>
      {Platform.OS === 'ios' ? <Action title={t('Export backup to Files', 'बैकअप Files में सहेजें')} kind="outline" disabled={app.busy} testID="settings-export-backup" onPress={confirmBackupExport} /> : null}
      {backupExported ? <Hint>{t('Backup saved to Files.', 'बैकअप Files में सहेजा गया।')}</Hint> : null}
      {Platform.OS === 'ios' ? <Action title={t('Verify backup ZIP', 'बैकअप ZIP जाँचें')} kind="outline" disabled={app.busy} testID="settings-verify-backup" onPress={verifyBackup} /> : null}
      {backupChecked ? <Hint>{t(`Backup verified · ${backupChecked.shops} shops · ${backupChecked.files} attachments`, `बैकअप सत्यापित · ${backupChecked.shops} दुकानें · ${backupChecked.files} अटैचमेंट`)}</Hint> : null}
      {Platform.OS === 'ios' ? <Action title={t('Restore from Files', 'Files से बहाल करें')} kind="outline" disabled={app.busy} testID="settings-restore-backup" onPress={confirmBackupRestore} /> : null}
      <Action title={t('Check saved files', 'सहेजी गई फ़ाइलें जाँचें')} icon="notes" kind="outline" disabled={app.busy} testID="settings-check-saved-files" onPress={checkSavedFiles} />
      {fileReport ? (
        <View style={styles.group} accessibilityLiveRegion="polite">
          {fileReport.map(({ id, name, checked, unavailable }) => (
            <Row key={id} title={name || t('Unnamed shop', 'बिना नाम की दुकान')} subtitle={
              t(`${checked} attachments checked · ${unavailable} unavailable`, `${checked} अटैचमेंट जाँचे · ${unavailable} उपलब्ध नहीं`)
            } />
          ))}
        </View>
      ) : null}
      <View style={local.settingsFootnote}>
        <Icon name="settings" size={16} color={colors.muted} />
        <Hint>{t('Shop data is saved on this device; iOS backups may include it.', 'दुकान का डेटा इसी डिवाइस पर सेव होता है; iOS बैकअप में शामिल हो सकता है।')}</Hint>
      </View>
      {app.problem ? <Warning>{app.problem}</Warning> : null}
    </Screen>
  );
}

function SettingsRow({ icon, title, subtitle, testID, onPress, last = false }: {
  icon: 'box' | 'camera' | 'globe' | 'keyboard' | 'notes';
  title: string;
  subtitle: string;
  testID: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} testID={testID} onPress={onPress} style={({ pressed }) => [local.settingsRow, !last && local.settingsRowBorder, pressed && local.settingsRowPressed]}>
      <View style={local.settingsIcon}><Icon name={icon} size={18} color={colors.action} /></View>
      <View style={local.settingsCopy}><Text style={local.settingsTitle}>{title}</Text><Text style={local.settingsSubtitle}>{subtitle}</Text></View>
      <Icon name="next" size={16} color={colors.muted} />
    </Pressable>
  );
}

export function ShopProfiles() {
  const app = useApp();
  const { t } = app;
  return (
    <Screen nav={<Nav right={<IconButton icon="settings" label={t('Settings', 'सेटिंग')} testID="open-settings" onPress={() => openScreen('settings')} />} />} footer={(
      <Action title={t('Add another shop', 'एक और दुकान जोड़ें')} icon="plus" testID="add-shop-profile" disabled={app.busy} onPress={() => {
        void app.run(
          async () => { await app.addShop(); },
          t('Could not create a shop profile. Try again.', 'दुकान प्रोफ़ाइल नहीं बन सकी। फिर कोशिश करें।'),
        ).then((created) => {
          if (created) requestAnimationFrame(() => openScreen('new-shop'));
        });
      }} />
    )}>
      <Title title={t('Shops', 'दुकानें')} subtitle={t('Choose the shop you’re working in.', 'जिस दुकान का काम करना है, उसे चुनें।')} />
      {app.shops.length ? <View style={local.shopList}>
        {(() => {
          const current = app.shops.find((shop) => shop.id === app.profile.id);
          return current ? <View style={local.currentShopCard}>
            <Text style={local.currentShopEyebrow}>{t('CURRENT SHOP', 'चालू दुकान')}</Text>
            <View style={local.currentShopBody}>
              <View style={local.currentShopMonogram}><Icon name="check" size={21} color={colors.action} /></View>
              <View style={local.shopCardCopy}>
                <Text numberOfLines={1} style={local.currentShopName}>{current.name || t('Your shop', 'आपकी दुकान')}</Text>
                <Text style={local.shopMeta}>{current.language === 'en' ? 'English' : 'हिन्दी'} · {current.setupComplete ? t('Ready to use', 'इस्तेमाल के लिए तैयार') : t('Finish setup', 'सेटअप पूरा करें')}</Text>
              </View>
            </View>
          </View> : null;
        })()}
        {app.shops.filter((shop) => shop.id !== app.profile.id).map((shop, index) => {
          const selected = app.profile.id === shop.id;
          const initials = shop.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? '').join('') || `${index + 1}`;
          return <Pressable
            key={shop.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${shop.name || t(`Shop ${index + 1}`, `दुकान ${index + 1}`)}, ${selected ? t('current shop', 'चालू दुकान') : t('switch to shop', 'दुकान पर जाएँ')}`}
            testID={`shop-profile-${shop.id}`}
            onPress={() => {
              if (selected) {
                if (!shop.setupComplete) openScreen('shop-setup');
                return;
              }
              void app.run(async () => {
                const next = await app.switchShop(shop.id);
                if (!next.setupComplete) openScreen('shop-setup');
              }, t('Could not switch shops. Try again.', 'दुकान नहीं बदली जा सकी। फिर कोशिश करें।'));
            }}
            style={({ pressed }) => [local.shopCard, selected && local.shopCardSelected, pressed && local.shopCardPressed]}
          >
            <View style={[local.shopMonogram, selected && local.shopMonogramSelected]}>
              <Text style={[local.shopMonogramText, selected && local.shopMonogramTextSelected]}>{initials}</Text>
            </View>
            <View style={local.shopCardCopy}>
              <Text numberOfLines={1} style={local.shopName}>{shop.name || t(`Shop ${index + 1}`, `दुकान ${index + 1}`)}</Text>
              <Text style={local.shopMeta}>{shop.language === 'en' ? 'English' : 'हिन्दी'} · {shop.setupComplete ? t('Ready to use', 'इस्तेमाल के लिए तैयार') : t('Finish setup', 'सेटअप पूरा करें')}</Text>
            </View>
            <Icon name="next" size={17} color={colors.muted} />
          </Pressable>;
        })}
      </View> : <View style={local.empty}><Text style={local.emptyTitle}>{t('Your shops will appear here', 'आपकी दुकानें यहाँ दिखेंगी')}</Text><Text style={local.emptyDetail}>{t('Add a shop profile to keep its records separate on this device.', 'इस डिवाइस पर अलग रिकॉर्ड रखने के लिए दुकान प्रोफ़ाइल जोड़ें।')}</Text></View>}
      {app.shops.length > 0 ? <View style={local.note}><Hint>{t('Each shop keeps a separate record on this iPhone.', 'हर दुकान का रिकॉर्ड इस iPhone पर अलग रहता है।')}</Hint></View> : null}
    </Screen>
  );
}

export function Catalogue() {
  const app = useApp();
  const { t, catalog } = app;
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const stockById = new Map(app.stockLevels.map((level) => [level.catalogueItemId, level.quantity]));
  const products = catalog.filter((item) => !query || `${item.name} ${item.packSize} ${item.brand ?? ''} ${item.barcode ?? ''} ${item.aliases.join(' ')}`.toLocaleLowerCase().includes(query));

  function changeStock(itemId: string, delta: number) {
    void app.run(() => app.adjustProductStock(itemId, delta, 'Manual stock correction'), t('Stock could not be updated. Try again.', 'स्टॉक अपडेट नहीं हुआ। फिर कोशिश करें।'));
  }

  return (
    <Screen nav={<Nav left={<Back />} right={<IconButton icon="box" label={t('Restock plan', 'स्टॉक भरने की योजना')} onPress={() => router.push('/(tabs)/products/restock')} />} />} footer={<Action title={t('Add product', 'उत्पाद जोड़ें')} icon="plus" onPress={() => openScreen('product')} testID="add-product" />}>
      <Title title={t('Products', 'उत्पाद')} subtitle={t('On-hand stock · updated after each confirmed delivery', 'मौजूदा स्टॉक · हर पुष्टि की गई डिलीवरी के बाद अपडेट')} />
      <View style={[local.search, searchFocused && local.searchFocused]}>
        <Icon name="search" color={colors.muted} size={18} />
        <TextInput accessibilityLabel={t('Search products', 'उत्पाद खोजें')} placeholder={t('Name, brand or barcode', 'नाम, ब्रांड या बारकोड')} placeholderTextColor={colors.muted} style={local.searchInput} value={search} onChangeText={setSearch} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} onSubmitEditing={() => Keyboard.dismiss()} testID="products-search" autoCapitalize="none" autoCorrect={false} returnKeyType="search" submitBehavior="blurAndSubmit" />
        {search ? <Pressable accessibilityRole="button" accessibilityLabel={t('Clear search', 'खोज साफ़ करें')} onPress={() => setSearch('')} style={local.clear}><Text style={styles.body}>×</Text></Pressable> : null}
      </View>
      {query ? <Text style={local.resultCount}>{t(`${products.length} matches`, `${products.length} परिणाम`)}</Text> : null}
      {products.length ? <View style={local.productList}>{products.map((item) => {
        const quantity = stockById.get(item.id) ?? 0;
        const supplier = app.deliveries.find((delivery) => delivery.lines.some((line) => line.catalogItemId === item.id))?.supplier;
        const imageUri = resolveSavedProductPhoto(item.imageUri, app.workspaceMediaDirectory);
        return <View key={item.id} testID={`product-card-${item.id}`} style={local.productCard}>
          <View style={local.productPhoto}>
            {imageUri ? <Image source={{ uri: imageUri }} resizeMode="cover" style={local.productPhotoImage} /> : <Icon name="box" color={colors.outline} size={26} />}
          </View>
          <View style={local.productDetails}>
            <Text numberOfLines={2} style={local.productName}>{item.name}</Text>
            <Text style={local.productVariant}>{item.packSize} · {unitLabel(item.unit, 2, app.profile.language === 'hi')}</Text>
            {item.brand ? <Text numberOfLines={1} style={local.productSupplier}>{item.brand}</Text> : null}
            {supplier ? <Text numberOfLines={1} style={local.productSupplier}>{t('Last supplier', 'आख़िरी सप्लायर')} · {supplier}</Text> : null}
            <View style={local.stockRow}>
              <View style={local.stockValueWrap}>
                <Text testID="product-stock-quantity" style={local.stockValue}>{quantity}</Text>
                <Text style={local.stockUnit}>{unitLabel(item.unit, quantity, app.profile.language === 'hi')}</Text>
              </View>
              <View style={local.quantityStepper}>
                <Pressable accessibilityRole="button" accessibilityLabel={t(`Remove one ${item.name}`, `${item.name} एक कम करें`)} disabled={quantity <= 0 || app.busy} onPress={() => changeStock(item.id, -1)} style={({ pressed }) => [local.quantityButton, (quantity <= 0 || app.busy) && local.quantityButtonDisabled, pressed && local.quantityButtonPressed]}><Text style={local.quantityButtonText}>−</Text></Pressable>
                <Text accessibilityLabel={t(`${quantity} ${unitLabel(item.unit, quantity, false)} on hand`, `${quantity} ${unitLabel(item.unit, quantity, true)} उपलब्ध`)} style={local.onHand}>{t('on hand', 'मौजूद')}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={t(`Add one ${item.name}`, `${item.name} एक बढ़ाएँ`)} disabled={app.busy} onPress={() => changeStock(item.id, 1)} style={({ pressed }) => [local.quantityButton, pressed && local.quantityButtonPressed]}><Text style={local.quantityButtonText}>+</Text></Pressable>
              </View>
            </View>
          </View>
        </View>;
      })}</View> : catalog.length ? <Text style={local.centerHint}>{t('No matching products.', 'कोई उत्पाद नहीं मिला।')}</Text> : <View style={local.empty}>
        <Icon name="box" color={colors.outline} size={32} />
        <Text style={local.emptyTitle}>{t('Your shelf starts here', 'आपकी उत्पाद सूची यहाँ से शुरू होती है')}</Text>
        <Text style={local.emptyDetail}>{t('Add the products you stock, with pack sizes such as 1 kg, 25 kg, or 1 quintal.', 'अपने स्टॉक के उत्पाद जोड़ें; जैसे 1 किलो, 25 किलो या 1 क्विंटल।')}</Text>
      </View>}
      {app.problem ? <Warning>{app.problem}</Warning> : null}
    </Screen>
  );
}

export function RestockPlan() {
  const app = useApp();
  const { t } = app;
  const [planning, setPlanning] = useState<RestockPlanningItem[]>([]);
  const [draft, setDraft] = useState<RestockDraftLine[]>([]);
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!app.mode) return;
    const [nextPlanning, nextDraft] = await Promise.all([
      listRestockPlanning(app.mode), listRestockDraft(app.mode),
    ]);
    setPlanning(nextPlanning);
    setDraft(nextDraft);
    setMinimums((current) => Object.fromEntries(nextPlanning.map((item) => [
      item.catalogueItemId,
      current[item.catalogueItemId] ?? (item.minimumQuantity === null ? '' : String(item.minimumQuantity)),
    ])));
    setQuantities(Object.fromEntries(nextDraft.map((line) => [line.id, String(line.quantity)])));
  }, [app.mode]);

  useFocusEffect(useCallback(() => {
    void refresh().catch(() => setError('Could not load the restock plan.'));
  }, [refresh]));

  function validQuantity(raw: string, allowZero: boolean) {
    const trimmed = raw.trim();
    if (!/^\d+$/u.test(trimmed)) return false;
    const value = Number(trimmed);
    return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) && value <= 1_000_000;
  }

  function saveMinimum(item: RestockPlanningItem) {
    if (!app.mode) return;
    const raw = minimums[item.catalogueItemId] ?? '';
    if (!validQuantity(raw, true)) {
      setError(t('Enter a whole-number minimum from 0 to 10,00,000.', '0 से 10,00,000 तक पूरी संख्या का न्यूनतम स्टॉक लिखें।'));
      return;
    }
    setError(null);
    void app.run(async () => {
      await setReorderPoint(app.mode!, item.catalogueItemId, Number(raw), item.unit);
      setMinimums((current) => ({ ...current, [item.catalogueItemId]: raw }));
      await refresh();
    }, t('Could not save this minimum. Try again.', 'न्यूनतम स्टॉक सेव नहीं हुआ। फिर कोशिश करें।'));
  }

  function clearMinimum(item: RestockPlanningItem) {
    if (!app.mode) return;
    setError(null);
    void app.run(async () => {
      await setReorderPoint(app.mode!, item.catalogueItemId, null, item.unit);
      setMinimums((current) => ({ ...current, [item.catalogueItemId]: '' }));
      await refresh();
    }, t('Could not remove this minimum. Try again.', 'न्यूनतम स्टॉक हट नहीं सका। फिर कोशिश करें।'));
  }

  function addSuggestion(item: RestockPlanningItem) {
    if (!app.mode || item.suggestedQuantity === null || item.suggestedQuantity < 1) return;
    setError(null);
    void app.run(async () => {
      await saveRestockDraftLine(app.mode!, item.catalogueItemId, item.suggestedQuantity!, item.unit);
      await refresh();
    }, t('Could not add this amount to the draft. Try again.', 'यह मात्रा ड्राफ्ट में नहीं जुड़ी। फिर कोशिश करें।'));
  }

  function saveDraftAmount(line: RestockDraftLine) {
    if (!app.mode) return;
    const raw = quantities[line.id] ?? String(line.quantity);
    if (!validQuantity(raw, false)) {
      setError(t('Enter a whole-number quantity from 1 to 10,00,000.', '1 से 10,00,000 तक पूरी संख्या की मात्रा लिखें।'));
      return;
    }
    setError(null);
    void app.run(async () => {
      await saveRestockDraftLine(app.mode!, line.id, Number(raw), line.unit);
      await refresh();
    }, t('Could not update this draft quantity. Try again.', 'ड्राफ्ट मात्रा अपडेट नहीं हुई। फिर कोशिश करें।'));
  }

  function removeDraft(line: RestockDraftLine) {
    if (!app.mode) return;
    setError(null);
    void app.run(async () => {
      await removeRestockDraftLine(app.mode!, line.id);
      await refresh();
    }, t('Could not remove this draft item. Try again.', 'ड्राफ्ट से उत्पाद नहीं हटा। फिर कोशिश करें।'));
  }

  return <Screen nav={<Nav left={<Back />} />}>
    <Title title={t('Restock plan', 'स्टॉक भरने की योजना')} subtitle={t('Owner-set minimums · suggestions are not forecasts', 'दुकानदार के तय न्यूनतम · सुझाव अनुमान नहीं हैं')} />
    <Banner title={t('Suggestion = minimum stock − recorded stock', 'सुझाव = न्यूनतम स्टॉक − दर्ज स्टॉक')} />
    {planning.length ? <View style={local.restockList}>{planning.map((item) => <View key={item.catalogueItemId} style={local.restockCard} testID={`restock-item-${item.catalogueItemId}`}>
      <Text style={local.productName}>{item.name}</Text>
      <Text style={local.productVariant}>{item.packSize} · {unitLabel(item.unit, 2, app.profile.language === 'hi')}</Text>
      <Text style={local.restockMeta}>{t('On hand', 'मौजूद')}: {item.onHandQuantity} {unitLabel(item.unit, item.onHandQuantity, app.profile.language === 'hi')}</Text>
      <Input label={t(`Minimum stock (${unitLabel(item.unit, 2, app.profile.language === 'hi')})`, `न्यूनतम स्टॉक (${unitLabel(item.unit, 2, true)})`)} value={minimums[item.catalogueItemId] ?? ''} onChangeText={(value) => setMinimums((current) => ({ ...current, [item.catalogueItemId]: value }))} keyboardType="number-pad" maxLength={8} testID={`reorder-point-${item.catalogueItemId}`} />
      <Action title={t('Save minimum', 'न्यूनतम सेव करें')} kind="outline" testID={`save-reorder-point-${item.catalogueItemId}`} disabled={app.busy} onPress={() => saveMinimum(item)} />
      {item.minimumQuantity !== null ? <>
        <Text style={local.restockMeta}>{item.suggestedQuantity! > 0
          ? t(`Below minimum by ${item.suggestedQuantity} ${unitLabel(item.unit, item.suggestedQuantity!, app.profile.language === 'hi')}`, `न्यूनतम से ${item.suggestedQuantity} ${unitLabel(item.unit, item.suggestedQuantity!, true)} कम`)
          : t('At or above your minimum', 'आपके न्यूनतम स्टॉक जितना या उससे अधिक')}</Text>
        {item.suggestedQuantity! > 0 ? <Action title={t(`Add ${item.suggestedQuantity} ${unitLabel(item.unit, item.suggestedQuantity!, false)} to draft`, `ड्राफ्ट में ${item.suggestedQuantity} ${unitLabel(item.unit, item.suggestedQuantity!, true)} जोड़ें`)} kind="text" testID={`add-restock-${item.catalogueItemId}`} disabled={app.busy} onPress={() => addSuggestion(item)} /> : null}
        <Action title={t('Remove minimum', 'न्यूनतम हटाएँ')} kind="text" testID={`clear-reorder-point-${item.catalogueItemId}`} disabled={app.busy} onPress={() => clearMinimum(item)} />
      </> : null}
    </View>)}</View> : <View style={local.empty}><Text style={local.emptyTitle}>{t('Add products to plan restocking', 'स्टॉक योजना के लिए उत्पाद जोड़ें')}</Text><Text style={local.emptyDetail}>{t('Set a minimum for each item. Suggestions use only that minimum and recorded stock.', 'हर उत्पाद का न्यूनतम तय करें। सुझाव केवल उसी न्यूनतम और दर्ज स्टॉक से निकलते हैं।')}</Text></View>}
    <View style={local.restockDraft}>
      <Section>{t(`Draft restock list · ${draft.length} items`, `भरने का ड्राफ्ट · ${draft.length} उत्पाद`)}</Section>
      {draft.length ? draft.map((line) => <View key={line.id} style={local.restockCard} testID={`restock-draft-${line.id}`}>
        <Text style={local.productName}>{line.name} · {line.packSize}</Text>
        <Text style={local.restockMeta}>{t('Draft only · no stock or payable change', 'सिर्फ़ ड्राफ्ट · स्टॉक या देय रकम में बदलाव नहीं')}</Text>
        <Input label={t(`Quantity (${unitLabel(line.unit, 2, app.profile.language === 'hi')})`, `मात्रा (${unitLabel(line.unit, 2, true)})`)} value={quantities[line.id] ?? String(line.quantity)} onChangeText={(value) => setQuantities((current) => ({ ...current, [line.id]: value }))} keyboardType="number-pad" maxLength={8} testID={`restock-quantity-${line.id}`} />
        <Action title={t('Save quantity', 'मात्रा सेव करें')} kind="outline" testID={`save-restock-quantity-${line.id}`} disabled={app.busy} onPress={() => saveDraftAmount(line)} />
        <Action title={t('Remove', 'हटाएँ')} kind="text" testID={`remove-restock-${line.id}`} disabled={app.busy} onPress={() => removeDraft(line)} />
      </View>) : <Hint>{t('Nothing in the draft yet. Add an item from a threshold suggestion above.', 'अभी ड्राफ्ट खाली है। ऊपर न्यूनतम-आधारित सुझाव से उत्पाद जोड़ें।')}</Hint>}
      <Hint>{t('This draft does not place an order. Confirm an actual delivery separately to update stock and supplier balances.', 'यह ड्राफ्ट ऑर्डर नहीं भेजता। स्टॉक और सप्लायर खाते बदलने के लिए वास्तविक डिलीवरी अलग से पुष्ट करें।')}</Hint>
    </View>
    {error || app.problem ? <Warning>{error ?? app.problem}</Warning> : null}
  </Screen>;
}

export const stockUnits: StockUnit[] = ['packet', 'piece', 'bottle', 'box', 'kg', 'quintal'];

export function unitLabel(unit: StockUnit, quantity: number, hindi: boolean) {
  if (hindi) return ({ packet: 'पैकेट', piece: 'नग', bottle: 'बोतल', box: 'डिब्बे', kg: 'किलो', quintal: 'क्विंटल' })[unit] ?? unit;
  if (unit === 'kg') return 'kg';
  return quantity === 1 ? unit : `${unit === 'box' ? 'boxe' : unit}s`;
}

export function variantName(name: string, packSize: string) {
  return packSize ? `${name} · ${packSize}` : name;
}

export function OpeningStock() {
  const app = useApp();
  const { t, mode } = app;
  const [counts, setCounts] = useState<{ id: string; quantity: number }[]>([]);
  const [loadError, setLoadError] = useState(false);
  const reduceMotion = useReducedMotion();
  useFocusEffect(useCallback(() => {
    let active = true;
    if (mode) void listOpeningStockItems(mode).then((items) => {
      if (active) { setCounts(items); setLoadError(false); }
    }, () => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [mode, app.profile.id]));
  const products = new Map(app.catalog.map((item) => [item.id, item]));

  function finish() {
    void app.run(async () => {
      await app.updateOpeningStockPending(false);
      replaceScreen('deliveries');
    }, t('Could not finish setup. Try again.', 'सेटअप पूरा नहीं हुआ। फिर कोशिश करें।'));
  }

  return <Screen nav={<Nav left={<Brand />} />} footer={
    <Action title={counts.length ? t('Finish setup', 'सेटअप पूरा करें') : t('Skip for now', 'अभी छोड़ें')} kind={counts.length ? 'primary' : 'text'}
      disabled={app.busy} testID="finish-opening-stock" onPress={finish} />
  }>
    <Title title={t('Stock on hand', 'दुकान का मौजूदा स्टॉक')} subtitle={t('Scan a product and add the quantity on your shelf.', 'उत्पाद स्कैन करें और दुकान में रखी मात्रा जोड़ें।')} />
    <View style={local.openingListHeader}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={local.openingCardTitle}>{t('Your products', 'आपके उत्पाद')}</Text>
        <Text style={local.openingCardDetail}>{counts.length === 1 ? t('1 product added', '1 उत्पाद जोड़ा') : t(`${counts.length} products added`, `${counts.length} उत्पाद जोड़े`)}</Text>
      </View>
      <View style={local.openingScanIcon}><Icon name="box" size={23} color={colors.action} /></View>
    </View>
    <Action title={t('Scan a product', 'उत्पाद स्कैन करें')} icon="camera" disabled={app.busy} testID="opening-stock-scan" onPress={() => openScreen('opening-stock-scan')} />
    <Action title={t('Add product or package photo', 'उत्पाद या पैक की फोटो जोड़ें')} kind="text" disabled={app.busy} testID="opening-stock-manual" onPress={() => openScreen('opening-stock-item')} />
    {counts.length > 0 ? <>
      <Section>{t('Stock added', 'जोड़ा गया स्टॉक')}</Section>
      <View style={styles.group}>
        {counts.map(({ id, quantity }) => {
          const item = products.get(id);
          if (!item) return null;
          return <Reanimated.View key={id} entering={reduceMotion ? undefined : FadeInDown.duration(160).easing(Easing.out(Easing.cubic))}>
            <Row title={variantName(item.name, item.packSize)} subtitle={t(`${quantity} ${unitLabel(item.unit, quantity, false)} counted`, `${quantity} ${unitLabel(item.unit, quantity, true)} गिने`)} />
          </Reanimated.View>;
        })}
      </View>
    </> : <Hint>{t('Each item saves as you go. You can add more products after setup.', 'हर उत्पाद जोड़ते ही सहेजा जाता है। सेटअप के बाद और उत्पाद जोड़ सकते हैं।')}</Hint>}
    {loadError ? <Warning>{t('Could not load the saved stock list.', 'सहेजी गई स्टॉक सूची नहीं खुली।')}</Warning> : null}
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function Product({ openingStock = false, autoScan = false }: { openingStock?: boolean; autoScan?: boolean } = {}) {
  const app = useApp();
  const { t } = app;
  const reduceMotion = useReducedMotion();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanHandled = useRef(false);
  const didOpenScanner = useRef(false);
  const openingId = useRef<string | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [aliases, setAliases] = useState('');
  const [unit, setUnit] = useState<StockUnit | null>(openingStock ? null : 'packet');
  const [cartonCount, setCartonCount] = useState('');
  const [cartonPackSize, setCartonPackSize] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const [barcodeText, setBarcodeText] = useState('');
  const [barcodeRevision, setBarcodeRevision] = useState(0);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [catalogueSource, setCatalogueSource] = useState<'owner' | 'open_food_facts'>('owner');
  const [scanning, setScanning] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [photoOcrBusy, setPhotoOcrBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const digits = quantityText.trim().replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966));
  const quantity = /^\d+$/u.test(digits) ? Number(digits) : 0;
  const cartonCountDigits = cartonCount.trim().replace(/[०-९]/gu, (digit) => String(digit.charCodeAt(0) - 0x0966));
  const cartonCountValue = /^\d+$/u.test(cartonCountDigits) ? Number(cartonCountDigits) : 0;
  const cartonContentOkay = unit !== 'box' || (cartonCountValue >= 1 && cartonCountValue <= MAX_QUANTITY && !!cartonPackSize.trim());
  const okay = !!name.trim() && !!size.trim() && !!unit && cartonContentOkay && (!openingStock || (quantity >= 1 && quantity <= MAX_QUANTITY && (!barcodeText.trim() || !!normalizeBarcode(barcodeText))));
  const formBarcode = openingStock ? normalizeBarcode(barcodeText) : barcode;
  const barcodeAliases = formBarcode ? equivalentProductBarcodes(formBarcode) : [];
  const existingBarcodeItem = app.catalog.find(({ barcode: saved }) => saved && barcodeAliases.includes(saved));
  const duplicateBarcode = Boolean(existingBarcodeItem);

  async function openBarcodeScanner() {
    scanHandled.current = false;
    setScanMessage(null);
    if (Platform.OS === 'ios' && !Device.isDevice) {
      setScanMessage(t('Camera scanning is available on iPhone. Enter the barcode or details below.', 'कैमरा स्कैन iPhone पर उपलब्ध है। नीचे बारकोड या विवरण भरें।'));
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setScanMessage(t('Camera access is off. You can enter product details manually or enable the camera in Settings.', 'कैमरा अनुमति बंद है। उत्पाद का विवरण हाथ से भरें या Settings में कैमरा चालू करें।'));
        return;
      }
    }
    setScanning(true);
  }

  useEffect(() => {
    if (autoScan && !didOpenScanner.current) {
      didOpenScanner.current = true;
      void openBarcodeScanner();
    }
  }, [autoScan]);

  function handleBarcodeDetected(result: { data: string }) {
    if (scanHandled.current) return;
    scanHandled.current = true;
    setScanning(false);
    const normalized = normalizeBarcode(result.data);
    if (!normalized) {
      setScanMessage(t('This code is not a supported product barcode. Enter the product manually.', 'यह समर्थित उत्पाद बारकोड नहीं है। उत्पाद का विवरण हाथ से भरें।'));
      return;
    }
    setBarcode(normalized);
    if (openingStock) {
      setBarcodeText(normalized);
      setBarcodeRevision((current) => current + 1);
    }
    const equivalents = equivalentProductBarcodes(normalized);
    const localMatch = app.catalog.find(({ barcode: saved }) => saved && equivalents.includes(saved));
    if (localMatch) {
      setName(localMatch.name);
      setSize(localMatch.packSize);
      setBrand(localMatch.brand ?? null);
      setUnit(localMatch.unit);
      if (localMatch.unit === 'box' && localMatch.packageContent) {
        const contents = localMatch.packageContent.match(/^(\d+)\s*[x×]\s*(.+)$/iu);
        if (contents) { setCartonCount(contents[1]); setCartonPackSize(contents[2]); }
      }
      setCatalogueSource(localMatch.catalogueSource ?? 'owner');
      setScanMessage(t('This barcode is already in this shop’s product list. Find it in Products instead of adding a duplicate.', 'यह बारकोड इस दुकान की उत्पाद सूची में पहले से है। दोबारा जोड़ने के बजाय Products में देखें।'));
      return;
    }
    setLookupBusy(true);
    setScanMessage(t('Barcode read. Looking up product details…', 'बारकोड पढ़ा गया। उत्पाद की जानकारी ढूँढ रहे हैं…'));
    void lookupBarcodeProduct(normalized).then((suggestion: BarcodeProductSuggestion | null) => {
      if (!suggestion) {
        setCatalogueSource('owner');
        setScanMessage(t('No product details were found or the lookup is unavailable. Enter or correct them below.', 'उत्पाद की जानकारी नहीं मिली या खोज उपलब्ध नहीं है। नीचे हाथ से भरें या ठीक करें।'));
        return;
      }
      setName((current) => current.trim() ? current : suggestion.name);
      setSize((current) => current.trim() ? current : suggestion.packageContent ?? '');
      setBrand((current) => current?.trim() ? current : suggestion.brand);
      setCatalogueSource(suggestion.source);
      setScanMessage(t('Check the suggested details, then choose how your shop receives this item.', 'सुझाई गई जानकारी जाँचें, फिर चुनें कि आपकी दुकान यह सामान किस इकाई में लेती है।'));
    }).finally(() => setLookupBusy(false));
  }

  function handleSave() {
    if (!unit || !okay) return;
    Keyboard.dismiss();
    void app.run(async () => {
      let storedImageUri: string | null = null;
      if (imageUri) {
        if (!app.workspaceMediaDirectory) throw new Error('Photo storage is unavailable.');
        const folder = `${app.workspaceMediaDirectory}product-photos/`;
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        storedImageUri = `${folder}product-${newOperationId()}.jpg`;
        try {
          await FileSystem.copyAsync({ from: imageUri, to: storedImageUri });
        } catch (error) {
          await FileSystem.deleteAsync(storedImageUri, { idempotent: true }).catch(() => {});
          throw error;
        }
      }
      try {
        await app.addProduct({
          ...(openingStock ? { id: openingId.current ??= newOperationId() } : {}),
          name: name.trim(),
          packSize: size.trim(),
          unit,
          aliases: [...new Set(aliases.split(/[,،\n]/u).map((alias) => alias.trim()).filter(Boolean))],
          imageUri: storedImageUri,
          barcode: formBarcode,
          brand,
          packageContent: unit === 'box'
            ? `${cartonCountValue} x ${cartonPackSize.trim()}`
            : size.trim() || null,
          catalogueSource,
        }, openingStock ? quantity : undefined);
      } catch (error) {
        if (storedImageUri) await FileSystem.deleteAsync(storedImageUri, { idempotent: true }).catch(() => {});
        throw error;
      }
      router.back();
    }, t('Could not save the product. Check the details and try again.', 'उत्पाद सहेजा नहीं जा सका। विवरण जाँचकर फिर कोशिश करें।'));
  }

  async function choosePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      setImageUri(uri);
      if (Platform.OS !== 'ios') return;
      setPhotoOcrBusy(true);
      setPhotoMessage(null);
      try {
        const recognized = await recognizeInvoiceImage(uri);
        const suggestions = extractProductPhotoSuggestions(recognized);
        const appliedName = !!suggestions.name && !name.trim();
        const appliedSize = !!suggestions.packSize && !size.trim();
        if (suggestions.name && !name.trim()) setName(suggestions.name);
        if (suggestions.packSize && !size.trim()) setSize(suggestions.packSize);
        setPhotoMessage(appliedName || appliedSize
          ? t('On-device suggestions filled blank fields. Check the name and pack size; nothing is saved until you save it.', 'डिवाइस के सुझावों ने खाली फ़ील्ड भरे हैं। नाम और पैक आकार जाँचें; सहेजने तक कुछ सेव नहीं होगा।')
          : suggestions.name || suggestions.packSize
            ? t('Package text was read, but your existing fields were kept. Check them and edit if needed; nothing is saved until you save it.', 'पैक का टेक्स्ट पढ़ा गया, लेकिन मौजूदा जानकारी रखी गई है। जाँचें और ज़रूरत हो तो बदलें; सहेजने तक कुछ सेव नहीं होगा।')
            : t('No clear name or pack size was found. Enter the details manually; the photo remains attached.', 'स्पष्ट नाम या पैक आकार नहीं मिला। विवरण हाथ से भरें; फोटो जुड़ी रहेगी।'));
      } catch {
        setPhotoMessage(t('Could not read package text on this iPhone. Enter the details manually; the photo remains attached.', 'इस iPhone पर पैक का टेक्स्ट नहीं पढ़ा जा सका। विवरण हाथ से भरें; फोटो जुड़ी रहेगी।'));
      } finally {
        setPhotoOcrBusy(false);
      }
    } catch {
      app.setProblem(t('Could not add the product photo. Try again.', 'उत्पाद की फोटो नहीं जुड़ सकी। फिर कोशिश करें।'));
    }
  }

  return (
    <Screen nav={<Nav left={<Back />} />} footer={<Action title={openingStock ? t('Save opening stock', 'मौजूदा स्टॉक सहेजें') : t('Save product', 'उत्पाद सहेजें')} disabled={!okay || app.busy || lookupBusy || photoOcrBusy || duplicateBarcode} onPress={handleSave} testID="save-product" />}>
      <Title title={openingStock ? t('Count this product', 'इस उत्पाद की गिनती करें') : t('Add product', 'उत्पाद जोड़ें')} />
      <View style={styles.stack}>
        <View style={local.scanIntro}>
          <View style={local.scanIntroCopy}>
            <Text style={local.scanIntroTitle}>{t('Start with the barcode', 'बारकोड से शुरू करें')}</Text>
            <Text style={local.scanIntroDetail}>{t('We’ll look up the pack. You confirm how your shop counts it.', 'हम पैक की जानकारी ढूँढेंगे। आपकी दुकान इसे कैसे गिनती है, आप पुष्टि करें।')}</Text>
          </View>
          <Action title={t('Scan', 'स्कैन')} icon="camera" kind="outline" disabled={app.busy || lookupBusy || photoOcrBusy} onPress={() => void openBarcodeScanner()} testID="scan-product-barcode" />
        </View>
        {barcode ? <View style={local.barcodePill}><Text style={local.barcodeLabel}>EAN / UPC</Text><Text selectable style={local.barcodeValue}>{barcode}</Text></View> : null}
        {scanMessage ? <View style={local.scanMessage}><Hint>{scanMessage}</Hint></View> : null}
        {openingStock && existingBarcodeItem ? <Warning>{t(`${existingBarcodeItem.name} is already in this shop. Its count has not changed.`, `${existingBarcodeItem.name} इस दुकान में पहले से है। उसकी मात्रा वही है।`)}</Warning> : null}
        {openingStock ? <View style={styles.stack}>
          <Input key={barcodeRevision} label={t('Barcode (optional)', 'बारकोड (वैकल्पिक)')} defaultValue={barcodeText} keyboardType="number-pad" maxLength={14}
            editable={!lookupBusy} testID="opening-stock-barcode" onChangeText={(value) => {
              setBarcodeText(value);
              setBarcode(null);
              setCatalogueSource('owner');
              setScanMessage(null);
            }} />
          {barcodeText.trim() && !normalizeBarcode(barcodeText) ? <Hint>{t('Enter an 8, 12, 13 or 14 digit barcode.', '8, 12, 13 या 14 अंकों का बारकोड भरें।')}</Hint> : null}
          {barcodeText && !barcode ? <Action title={t('Look up barcode', 'बारकोड खोजें')} kind="outline" disabled={!normalizeBarcode(barcodeText) || lookupBusy} onPress={() => {
            scanHandled.current = false;
            handleBarcodeDetected({ data: barcodeText });
          }} /> : null}
        </View> : null}
        <Input label={t('Product name', 'उत्पाद का नाम')} placeholder="Maggi Masala" value={name} onChangeText={setName} editable={!photoOcrBusy} maxLength={100} autoCorrect={false} testID="product-name" />
        <Input label={t('Brand (optional)', 'ब्रांड (वैकल्पिक)')} placeholder={t('e.g. Amul', 'जैसे अमूल')} value={brand ?? ''} onChangeText={setBrand} maxLength={100} autoCorrect={false} />
        <Input label={t('Pack size or variant', 'पैक का आकार या प्रकार')} placeholder="70 g" value={size} onChangeText={setSize} editable={!photoOcrBusy} maxLength={100} autoCorrect={false} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} testID="product-variant" />
        <View style={local.productPhotoPicker}>
          <View style={local.productPhoto}>
            {imageUri ? <Image source={{ uri: imageUri }} resizeMode="cover" style={local.productPhotoImage} /> : <Icon name="box" color={colors.outline} size={26} />}
          </View>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{t('Product photo', 'उत्पाद की फोटो')}</Text><Hint>{photoOcrBusy ? t('Reading package text on this iPhone…', 'इस iPhone पर पैक का टेक्स्ट पढ़ रहे हैं…') : t('On iPhone, package text can suggest a name and pack size. Check both before saving.', 'iPhone पर पैक का टेक्स्ट नाम और पैक आकार सुझा सकता है। सहेजने से पहले दोनों जाँचें।')}</Hint></View>
          <Action title={imageUri ? t('Change', 'बदलें') : t('Add', 'जोड़ें')} kind="outline" disabled={app.busy || lookupBusy || photoOcrBusy} onPress={() => void choosePhoto()} testID="product-photo" />
        </View>
        {photoMessage ? <Hint>{photoMessage}</Hint> : null}
        {imageUri ? (
          <Action title={t('Remove photo', 'फोटो हटाएँ')} kind="text" disabled={app.busy || photoOcrBusy} testID="remove-product-photo" onPress={() => {
            setImageUri(null);
            setPhotoMessage(null);
          }} />
        ) : null}
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>{openingStock ? t('Stock unit', 'स्टॉक इकाई') : t('Receiving unit', 'माल लेने की इकाई')}</Text>
          <Text style={local.unitHelp}>{openingStock ? t('Use the unit you keep in stock.', 'वही इकाई चुनें जिसमें स्टॉक रखते हैं।') : t('How you count stock when a delivery arrives.', 'डिलीवरी आने पर आप स्टॉक कैसे गिनते हैं।')}</Text>
          <View style={local.stockUnitGrid}>
            {stockUnits.map((entry) => <Pressable key={entry} accessibilityRole="radio" accessibilityState={{ checked: entry === unit }} accessibilityLabel={unitLabel(entry, 1, app.profile.language === 'hi')} testID={`product-unit-${entry}`} onPress={() => {
              setUnit(entry);
              if (entry === 'box') {
                const variants = app.catalog.filter((item) => item.unit === 'packet' && item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
                if (variants.length === 1) setCartonPackSize(variants[0].packSize);
                const found = size.match(/(?:carton\s*[·:]?\s*)?(\d+)\s*[x×]\s*(.+)$/iu);
                if (found) { setCartonCount(found[1]); setCartonPackSize(found[2]); }
              }
            }} style={({ pressed }) => [local.stockUnitOption, entry === unit && local.stockUnitOptionSelected, pressed && local.stockUnitOptionPressed]}>
              <Text style={[local.stockUnitText, entry === unit && local.stockUnitTextSelected]}>{unitLabel(entry, 1, app.profile.language === 'hi')}</Text>
              {entry === unit ? <Icon name="check" size={16} color={colors.green} /> : null}
            </Pressable>)}
          </View>
        </View>
        {unit === 'box' ? <View style={styles.stack}>
          <Text style={local.unitHelp}>{t('Carton sizes vary. Check this supplier’s carton and enter the number of retail packs inside. If a matching packet product is in your catalog, its pack size is prefilled.', 'कार्टन का आकार बदल सकता है। सप्लायर का कार्टन जाँचें और अंदर के रिटेल पैकेट की संख्या भरें। सूची में मिलता-जुलता पैकेट हो तो उसका आकार पहले से भरा जाएगा।')}</Text>
          <Input label={t('Retail packs in each carton', 'हर कार्टन में रिटेल पैकेट')} placeholder="4" value={cartonCount} onChangeText={setCartonCount} keyboardType="number-pad" maxLength={6} testID="carton-pack-count" />
          <Input label={t('Size of each retail pack', 'हर रिटेल पैकेट का आकार')} placeholder="500 ml" value={cartonPackSize} onChangeText={setCartonPackSize} maxLength={80} autoCorrect={false} testID="carton-retail-pack-size" />
        </View> : null}
        {openingStock ? <Input label={t('Quantity on hand', 'मौजूदा मात्रा')} placeholder={unit ? unitLabel(unit, 2, app.profile.language === 'hi') : undefined}
          value={quantityText} onChangeText={setQuantityText} keyboardType="number-pad" maxLength={9} testID="opening-stock-quantity" /> : null}
        <Input label={t('Spoken aliases (optional)', 'बोलचाल के नाम (वैकल्पिक)')} placeholder={t('Comma-separated names', 'नामों के बीच कॉमा लगाएँ')} value={aliases} onChangeText={setAliases} maxLength={250} autoCorrect={false} />
        {app.problem ? <Warning>{app.problem}</Warning> : null}
      </View>
      <Text style={local.catalogueAttribution}>{t('Barcode lookup by Open Food Facts. Product details can be incomplete; verify before saving. Scanning never changes stock.', 'Open Food Facts से बारकोड जानकारी। विवरण अधूरे हो सकते हैं; सहेजने से पहले जाँचें। स्कैन करने से स्टॉक नहीं बदलता।')}</Text>
      <Modal visible={scanning} animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={() => setScanning(false)}>
        <View style={local.scannerScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'] }}
            onBarcodeScanned={handleBarcodeDetected}
            onMountError={() => { setScanning(false); setScanMessage(t('Could not start the camera. Enter product details manually.', 'कैमरा शुरू नहीं हो सका। उत्पाद का विवरण हाथ से भरें।')); }}
          />
          <View style={local.scannerTop}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Close barcode scanner', 'बारकोड स्कैनर बंद करें')} onPress={() => setScanning(false)} style={local.scannerClose}><Text style={local.scannerCloseText}>×</Text></Pressable>
            <Text style={local.scannerTitle}>{t('Scan product barcode', 'उत्पाद का बारकोड स्कैन करें')}</Text>
            <Text style={local.scannerSubtitle}>{t('Hold the code inside the frame', 'बारकोड को फ्रेम के अंदर रखें')}</Text>
          </View>
          <View pointerEvents="none" style={local.scanFrame}><View style={local.scanBeam} /></View>
          <View style={local.scannerBottom}><Text style={local.scannerBottomText}>{t('Scan one pack, then enter the quantity.', 'एक पैक स्कैन करें, फिर मात्रा भरें।')}</Text>
            <Action title={t('Enter details instead', 'विवरण हाथ से भरें')} kind="lightText" onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function HomeActionRing({
  t, onExpandedChange, onNote, onScanInvoice, onReceiveDelivery,
}: {
  t: (english: string, hindi: string) => string;
  onExpandedChange: (open: boolean) => void;
  onNote: () => void;
  onScanInvoice: () => void;
  onReceiveDelivery: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const closeTarget = useRef<View>(null);
  const afterDismiss = useRef<(() => void) | null>(null);
  const dismissing = useRef(false);
  const [anchor, setAnchor] = useState<ActionMenuPoint | null>(null);
  const progress = useSharedValue(0);
  const backdropMotion = useAnimatedStyle(() => ({ opacity: progress.value }));
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${progress.value * 45}deg` }] }));
  const options = [
    { icon: 'camera', label: t('Scan bill', 'बिल स्कैन'), id: 'home-action-scan-invoice', action: onScanInvoice },
    { icon: 'notes', label: t('New note', 'नई बात'), id: 'home-action-note', action: onNote },
    { icon: 'box', label: t('Delivery', 'डिलीवरी'), id: 'home-action-receive-delivery', action: onReceiveDelivery },
  ] as const;

  function openMenu() {
    trigger.current?.measureInWindow((x, y, w, h) => {
      if (!w || !h) return;
      setAnchor({ x: x + w / 2, y: y + h / 2 });
      onExpandedChange(true);
    });
  }

  function focus(view: View | null) {
    if (!view) return;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      const handle = enabled ? findNodeHandle(view) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }

  function finishClose() {
    afterDismiss.current ??= () => focus(trigger.current);
    setAnchor(null);
    onExpandedChange(false);
    if (Platform.OS !== 'ios') requestAnimationFrame(handleDismiss);
  }

  function handleDismiss() {
    dismissing.current = false;
    const action = afterDismiss.current;
    afterDismiss.current = null;
    action?.();
  }

  function closeMenu(action?: () => void) {
    if (dismissing.current) return;
    dismissing.current = true;
    afterDismiss.current = action ?? null;
    if (reduceMotion) {
      progress.value = 0;
      finishClose();
    } else {
      progress.value = withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) scheduleOnRN(finishClose);
      });
    }
  }

  const layout = anchor ? homeActionLayout(anchor, width, top, fontScale) : null;
  return (
    <View style={local.actionRingRoot}>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityState={{ expanded: Boolean(anchor) }}
        accessibilityLabel={t('New shop activity', 'दुकान का नया काम')}
        testID="home-action-ring-toggle"
        onPress={openMenu}
        style={({ pressed }) => [local.actionRingTrigger, pressed && local.actionRingTriggerPressed]}
      >
        <Icon name="plus" size={26} color={colors.action} />
      </Pressable>
      <Modal transparent visible={Boolean(anchor)} animationType="none" presentationStyle="overFullScreen"
        onRequestClose={() => closeMenu()} onDismiss={handleDismiss}
        onShow={() => {
          progress.value = reduceMotion ? 1 : withTiming(1, { duration: 220, easing: Easing.linear });
          focus(closeTarget.current);
        }}>
        {anchor && layout ? (
          <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={() => closeMenu()}>
            <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, local.actionMenuBackdrop, backdropMotion]} />
            <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => closeMenu()} />
            <Pressable
              ref={closeTarget}
              accessibilityRole="button"
              accessibilityLabel={t('Close activity options', 'काम के विकल्प बंद करें')}
              testID="home-action-ring-close"
              onPress={() => closeMenu()}
              style={[local.actionRingTrigger, local.actionRingClose, { left: anchor.x - 29, top: anchor.y - 29 }]}
            >
              <Reanimated.View style={rotation}><Icon name="plus" size={26} color={colors.action} /></Reanimated.View>
            </Pressable>
            {options.map((option, index) => (
              <HomeActionOption key={option.id} {...option} index={index} origin={anchor} target={layout.points[index]} width={layout.width}
                height={layout.height} compact={layout.compact} progress={progress} onPress={() => closeMenu(option.action)} />
            ))}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function HomeActionOption({ icon, label, id, onPress, index, origin, target, width, height, compact, progress }: {
  icon: 'camera' | 'notes' | 'box';
  label: string;
  id: string;
  onPress: () => void;
  index: number;
  origin: ActionMenuPoint;
  target: ActionMenuPoint;
  width: number;
  height: number;
  compact: boolean;
  progress: SharedValue<number>;
}) {
  const motion = useAnimatedStyle(() => {
    const delay = (2 - index) * 0.08;
    const linear = Math.max(0, Math.min(1, (progress.value - delay) / (1 - delay)));
    const travel = 1 - (1 - linear) ** 3;
    const lift = compact ? 0 : Math.sin(travel * Math.PI) * 15;
    return {
      opacity: Math.min(1, linear * 2),
      transform: [
        { translateX: (origin.x - target.x) * (1 - travel) },
        { translateY: (origin.y - target.y) * (1 - travel) - lift },
        { scale: 0.7 + travel * 0.3 },
      ],
    };
  });
  return (
    <Reanimated.View style={[local.actionMenuPosition, { left: target.x - width / 2, top: target.y - height / 2, width, minHeight: height }, motion]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} testID={id} onPress={onPress}
        style={({ pressed }) => [local.actionMenuOption, compact && local.actionMenuOptionCompact, pressed && local.actionMenuOptionPressed]}>
        <View style={local.actionMenuOptionGlyph}><Icon name={icon} size={22} color={colors.action} /></View>
        <Text style={[local.actionMenuOptionText, compact && local.actionMenuOptionTextCompact]}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  );
}

const local = StyleSheet.create({
  savedDeliveryNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  welcomeTop: { marginTop: 14, marginBottom: 18 },
  cover: { width: '100%', borderRadius: 10, backgroundColor: '#3A3128' },
  welcomeTitle: { color: '#FFFDF7', fontSize: 52, fontWeight: '700', letterSpacing: -2.5, marginTop: 18 },
  welcomeCaption: { color: '#D8D1C7', fontSize: 17, marginTop: 7 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  flowProgress: { color: colors.action, fontSize: 12, fontWeight: '700', letterSpacing: 1.1, marginTop: -8, marginBottom: 14 },
  flowAccountCard: { padding: 16, borderRadius: 18, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line, gap: 13 },
  flowAccountHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flowAccountMark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E7DF' },
  flowAccountCopy: { flex: 1, gap: 3 },
  flowAccountTitle: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  flowAccountSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  flowAccountDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  flowAccountStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flowAccountStepText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 18 },
  flowAccountNote: { marginTop: 11 },
  flowAccountNoteText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  dictationField: { minHeight: 105, borderWidth: 1, borderColor: colors.outline, borderRadius: 12, backgroundColor: colors.sheet, padding: 14, fontSize: 17, color: colors.ink, textAlignVertical: 'top', marginTop: 10 },
  flowConfirm: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 8 },
  flowCheckbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.outline, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  flowCheckboxChecked: { backgroundColor: colors.orange, borderColor: colors.orange },
  flowCheckmark: { color: colors.buttonInk, fontWeight: '700', fontSize: 15 },
  flowConfirmText: { color: colors.ink, fontSize: 15, flexShrink: 1 },
  note: { marginVertical: 15, gap: 9 },
  homeHeading: { gap: 4, marginTop: 4, marginBottom: 18 },
  homeCenterGroup: { flexGrow: 1, justifyContent: 'center', paddingTop: 12, paddingBottom: 26 },
  homeEyebrow: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  homeHeadline: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '600', letterSpacing: -0.65 },
  captureCard: { gap: 9, padding: 16, borderRadius: 17, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line, marginBottom: 21 },
  captureTitle: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  captureInput: { minHeight: 86, maxHeight: 142, borderWidth: 1, borderColor: '#E7E4DC', borderRadius: 12, backgroundColor: '#F8F7F3', paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 16, lineHeight: 22 },
  captureActions: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  captureHint: { color: colors.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 1 },
  reviewEntry: { minWidth: 84, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 11 },
  reviewEntryDisabled: { opacity: 0.55 },
  reviewEntryPressed: { backgroundColor: '#F4E9E2' },
  reviewEntryText: { color: colors.action, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  emptyActivity: { gap: 5, paddingTop: 2 },
  emptyActivityTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.15 },
  emptyActivityCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  actionRingRoot: { height: 62, width: '100%', alignItems: 'flex-end', justifyContent: 'center', overflow: 'visible', zIndex: 20, paddingRight: 8 },
  actionRingTrigger: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, borderWidth: 1, borderColor: 'rgba(255,255,255,0.94)', backgroundColor: 'rgba(255,254,250,0.88)', shadowColor: '#191816', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  actionRingTriggerPressed: { backgroundColor: 'rgba(243,240,233,0.9)', transform: [{ scale: 0.97 }] },
  actionMenuBackdrop: { backgroundColor: 'rgba(27,23,19,0.22)' },
  actionRingClose: { position: 'absolute', backgroundColor: colors.sheet },
  actionMenuPosition: { position: 'absolute' },
  actionMenuOption: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 3, paddingVertical: 4 },
  actionMenuOptionCompact: { flexDirection: 'row', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 10, minHeight: 52, borderRadius: 14, backgroundColor: colors.sheet },
  actionMenuOptionPressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  actionMenuOptionGlyph: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sheet, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', shadowColor: '#191816', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 } },
  actionMenuOptionText: { color: colors.ink, backgroundColor: colors.sheet, borderRadius: 9, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 3, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  actionMenuOptionTextCompact: { flexShrink: 1, textAlign: 'left', backgroundColor: 'transparent' },
  recentHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 6 },
  resultCount: { color: colors.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  settingsSection: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 7, marginLeft: 4 },
  settingsRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 9 },
  settingsRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  settingsRowPressed: { backgroundColor: '#F1EEE8' },
  settingsIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4E8E0', alignItems: 'center', justifyContent: 'center' },
  settingsCopy: { flex: 1, gap: 3 },
  settingsTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  settingsSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  settingsFootnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 22, paddingHorizontal: 4 },
  supplierRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sheet, marginTop: 5 },
  supplierRowPressed: { backgroundColor: '#EEECE7', transform: [{ scale: 0.99 }] },
  supplierCopy: { flex: 1, gap: 3 },
  supplierTitle: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  supplierSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  shopList: { gap: 10, marginTop: 4 },
  currentShopCard: { padding: 15, borderRadius: 17, borderWidth: 1, borderColor: '#D9B7A6', backgroundColor: '#F7EFEA', gap: 12, marginBottom: 5 },
  currentShopEyebrow: { color: colors.action, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  currentShopBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currentShopMonogram: { width: 47, height: 47, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECD6C9' },
  currentShopName: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 },
  shopCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sheet },
  shopCardSelected: { borderColor: '#CFA18E', backgroundColor: '#F8F0EB' },
  shopCardPressed: { opacity: 0.78 },
  shopMonogram: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEECE7' },
  shopMonogramSelected: { backgroundColor: '#ECD6C9' },
  shopMonogramText: { color: colors.muted, fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: 0.4 },
  shopMonogramTextSelected: { color: colors.action },
  shopCardCopy: { flex: 1, gap: 4 },
  shopName: { color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  shopMeta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  currentShopBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#EFE1D8' },
  currentShopText: { color: colors.action, fontSize: 11, fontWeight: '600' },
  empty: { minHeight: 265, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  productList: { gap: 10, paddingBottom: 16 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sheet, padding: 12 },
  productPhoto: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#ECE9E2', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productPhotoImage: { width: '100%', height: '100%' },
  productDetails: { flex: 1, gap: 3 },
  productName: { color: colors.ink, fontSize: 15, lineHeight: 19, fontWeight: '700' },
  productVariant: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  productSupplier: { color: colors.muted, fontSize: 11, lineHeight: 14 },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  stockValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  stockValue: { color: colors.ink, fontSize: 23, lineHeight: 27, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stockUnit: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  quantityStepper: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quantityButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  quantityButtonDisabled: { backgroundColor: '#EFEEE9', opacity: 0.55 },
  quantityButtonPressed: { backgroundColor: '#D3E2D4', transform: [{ scale: 0.96 }] },
  quantityButtonText: { color: colors.green, fontSize: 23, lineHeight: 27, fontWeight: '600' },
  onHand: { color: colors.muted, fontSize: 10, lineHeight: 12, textAlign: 'center' },
  productPhotoPicker: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 5 },
  emptyTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  emptyDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, maxWidth: 290 },
  noResults: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6 },
  centerHint: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  search: { minHeight: 52, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sheet, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, gap: 9, marginBottom: 14, marginTop: 12 },
  searchFocused: { borderColor: colors.green, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, minHeight: 48, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  scanIntro: { minHeight: 98, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: '#EDEFE8', marginBottom: 3 },
  openingListHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, marginBottom: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  openingCardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  openingCardDetail: { fontSize: 14, lineHeight: 20, color: colors.muted },
  openingScanIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#F4E8E0', alignItems: 'center', justifyContent: 'center' },
  scanIntroCopy: { flex: 1, gap: 4 },
  scanIntroTitle: { color: colors.ink, fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.25 },
  scanIntroDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  barcodePill: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F1EEE6' },
  barcodeLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.7 },
  barcodeValue: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  scanMessage: { paddingHorizontal: 2, paddingVertical: 1 },
  brandSuggested: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: -6 },
  unitHelp: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: -4 },
  stockUnitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  stockUnitOption: { width: '31.7%', minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 5, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sheet },
  stockUnitOptionSelected: { backgroundColor: '#E7EEE7', borderColor: '#7D9988' },
  stockUnitOptionPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  stockUnitText: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  stockUnitTextSelected: { color: colors.green },
  catalogueAttribution: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12, marginBottom: 18 },
  scannerScreen: { flex: 1, backgroundColor: '#101411', justifyContent: 'space-between' },
  scannerTop: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24, gap: 8 },
  scannerClose: { position: 'absolute', top: 58, left: 18, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.52)' },
  scannerCloseText: { color: '#FFFFFF', fontSize: 29, lineHeight: 31, fontWeight: '300' },
  scannerTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  scannerSubtitle: { color: '#E5E9E5', fontSize: 14, lineHeight: 20 },
  scanFrame: { alignSelf: 'center', width: '78%', height: 180, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', justifyContent: 'center' },
  scanBeam: { height: 2, backgroundColor: '#E9A678', marginHorizontal: 10 },
  scannerBottom: { paddingHorizontal: 30, paddingBottom: 68, alignItems: 'center' },
  scannerBottomText: { color: '#FFFFFF', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  restockList: { gap: 12 },
  restockCard: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line },
  restockMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  restockDraft: { gap: 12, marginTop: 24, marginBottom: 20 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
