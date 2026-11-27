import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { openScreen, replaceScreen, useApp } from './app-state';
import { formatPaise, parseRupees, type PaymentMethod } from './domain';
import { Action, Brand, Hint, Icon, Input, Nav, Row, Screen, Section, Title, Warning, colors, styles } from './ui';
import { newOperationId, type CustomerCreditKind } from './store';
import { currentShopBusinessDate, dueCustomerPromises, type CustomerQueryAnswer } from './customer-query';
import { buildCustomerReminderMessage } from './customer-reminder';
import { estimateFollowUpDate, proposeCustomerCapture } from './customer-capture';

function CustomerBack() {
  const { t, busy } = useApp();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={t('Back', 'वापस')}
    onPress={() => { if (!busy && router.canGoBack()) router.back(); else if (!busy) router.replace('/(tabs)/customers'); }}
    style={({ pressed }) => [customerStyles.back, pressed && { opacity: 0.55 }]}
  ><Icon name="back" size={21} /></Pressable>;
}

const dateLabel = (value: string, hindi: boolean) => new Intl.DateTimeFormat(hindi ? 'hi-IN' : 'en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
}).format(new Date(`${value}T12:00:00Z`));

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function CustomerQueryAnswerCard({
  answer, today, hindi, onOpenCustomer,
}: {
  answer: CustomerQueryAnswer;
  today: string;
  hindi: boolean;
  onOpenCustomer: (customerId: string) => void;
}) {
  const money = formatPaise;
  if (answer.kind === 'open-balances') return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{hindi ? 'पुष्ट बाकी वाले ग्राहक' : 'Customers with a confirmed balance'}</Text>
    <Text style={customerStyles.queryAnswerTotal}>{money(answer.totalPaise)}</Text>
    {answer.customers.length ? answer.customers.map((customer) => <Pressable key={customer.id} accessibilityRole="button" testID={`query-open-customer-${customer.id}`} onPress={() => onOpenCustomer(customer.id)} style={customerStyles.queryRow}>
      <Text style={customerStyles.queryRowTitle}>{customer.name}</Text><Text style={customerStyles.queryRowAmount}>{money(customer.balancePaise)}</Text>
    </Pressable>) : <Text style={customerStyles.queryCopy}>{hindi ? 'अभी कोई पुष्ट बाकी रकम नहीं है।' : 'There are no positive confirmed balances right now.'}</Text>}
    {answer.customerCredits.length ? <Text style={customerStyles.queryFootnote}>{hindi ? `जमा रकम वाले ग्राहक: ${answer.customerCredits.map((customer) => `${customer.name} ${money(Math.abs(customer.balancePaise))}`).join(' · ')}` : `Customer credits: ${answer.customerCredits.map((customer) => `${customer.name} ${money(Math.abs(customer.balancePaise))}`).join(' · ')}`}</Text> : null}
    <Text style={customerStyles.queryFootnote}>{hindi ? 'केवल पुष्ट प्रविष्टियों से।' : 'Based only on confirmed entries.'}</Text>
  </View>;

  if (answer.kind === 'due-promises') return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{hindi ? 'याद दिलाने की तारीखें और वादे' : 'Follow-ups and promises'}</Text>
    {answer.promises.length ? answer.promises.map((promise) => <Pressable key={promise.id} accessibilityRole="button" testID={`query-promise-${promise.id}`} onPress={() => onOpenCustomer(promise.customerId)} style={customerStyles.queryRow}>
      <View style={customerStyles.queryRowCopy}><Text style={customerStyles.queryRowTitle}>{promise.customerName}</Text><Text style={customerStyles.queryFootnote}>{promise.dateSource === 'estimated' ? (hindi ? 'अनुमानित तारीख · ' : 'Estimated follow-up · ') : promise.dateSource === 'owner' ? (hindi ? 'याद दिलाने की तारीख · ' : 'Follow-up · ') : promise.dueDate && promise.dueDate < today ? (hindi ? 'बाकी · ' : 'Overdue · ') : (hindi ? 'आज देय · ' : 'Due today · ')}{promise.dueDate ? dateLabel(promise.dueDate, hindi) : ''}</Text></View>
      <Icon name="next" size={15} color={colors.outline} />
    </Pressable>) : <Text style={customerStyles.queryCopy}>{hindi ? 'आज कोई याद दिलाने की तारीख नहीं है।' : 'No follow-ups are due today.'}</Text>}
    <Text style={customerStyles.queryFootnote}>{hindi ? 'यह केवल सूची है; कोई संदेश अपने-आप नहीं भेजा जाएगा।' : 'This is a review list. Nothing is sent automatically.'}</Text>
  </View>;

  if (answer.kind === 'balance') return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{answer.customer.name}</Text>
    <Text style={customerStyles.queryAnswerTotal}>{money(Math.abs(answer.balancePaise))}</Text>
    <Text style={customerStyles.queryCopy}>{answer.balancePaise < 0
      ? (hindi ? 'ग्राहक के खाते में जमा है · पुष्ट प्रविष्टियों से गणना' : 'Customer credit · calculated from confirmed entries')
      : (hindi ? 'बाकी रकम · पुष्ट प्रविष्टियों से गणना' : 'Open balance · calculated from confirmed entries')}</Text>
    {answer.events.map((event) => <View key={event.id} style={customerStyles.queryEvidenceBlock}>
      <Text style={customerStyles.queryEvidence}>{event.businessDate} · {event.amountDeltaPaise > 0 ? '+' : '−'}{money(event.amountPaise)}{event.note ? ` · ${event.note}` : ''}</Text>
      {event.lines.map((line, index) => <Text key={`${event.id}-${index}`} style={customerStyles.queryItem}>{line.name} · {line.quantity} {line.unit} · {money(line.amountPaise)}</Text>)}
    </View>)}
    <Pressable accessibilityRole="button" testID={`query-open-customer-${answer.customer.id}`} onPress={() => onOpenCustomer(answer.customer.id)} style={customerStyles.queryLink}><Text style={customerStyles.queryLinkText}>{hindi ? 'पूरा खाता देखें' : 'View full account history'}</Text></Pressable>
  </View>;

  if (answer.kind === 'history') return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{hindi ? `${answer.customer.name} · हाल की पुष्ट प्रविष्टियाँ` : `${answer.customer.name} · recent confirmed entries`}</Text>
    {answer.events.map((event) => <View key={event.id} style={customerStyles.queryHistoryRow}>
      <View style={customerStyles.queryRowCopy}><Text style={customerStyles.queryRowTitle}>{event.kind === 'credit_sale' ? (hindi ? 'उधार बिक्री' : 'Credit sale') : event.kind === 'repayment_received' ? (hindi ? 'भुगतान मिला' : 'Repayment received') : event.kind === 'reversal' ? (hindi ? 'वापस की गई प्रविष्टि' : 'Reversal') : (hindi ? 'खाता बदलाव' : 'Ledger adjustment')}</Text><Text style={customerStyles.queryFootnote}>{dateLabel(event.businessDate, hindi)}{event.note ? ` · ${event.note}` : ''}</Text></View>
      <Text style={customerStyles.queryRowAmount}>{event.amountDeltaPaise > 0 ? '+' : '−'}{money(event.amountPaise)}</Text>
      {event.lines.length ? <View style={customerStyles.queryItems}>{event.lines.map((line, index) => <Text key={`${event.id}-${index}`} style={customerStyles.queryItem}>{line.name} · {line.quantity} {line.unit} · {money(line.amountPaise)}</Text>)}</View> : null}
    </View>)}
    {!answer.events.length ? <Text style={customerStyles.queryCopy}>{hindi ? 'इस ग्राहक के लिए कोई पुष्ट प्रविष्टि नहीं मिली।' : 'No confirmed entries were found for this customer.'}</Text> : null}
    <Text style={customerStyles.queryFootnote}>{answer.itemDetailsAreStructured
      ? (hindi ? 'सामान की पंक्तियाँ वहीं दिखती हैं जहाँ मालिक ने उन्हें पुष्टि करके दर्ज किया।' : 'Product lines appear only when the owner itemized and confirmed them.')
      : (hindi ? 'इस इतिहास में सामान की पुष्टि की हुई पंक्तियाँ नहीं हैं; ऐप सामान का अनुमान नहीं लगाएगा।' : 'No confirmed product lines are saved for these entries, so the app will not guess what was bought.')}</Text>
    {answer.hasMore ? <Text style={customerStyles.queryFootnote}>{hindi ? 'और पुरानी प्रविष्टियों के लिए पूरा खाता खोलें।' : 'Open the full account for older entries.'}</Text> : null}
    <Pressable accessibilityRole="button" testID={`query-open-customer-${answer.customer.id}`} onPress={() => onOpenCustomer(answer.customer.id)} style={customerStyles.queryLink}><Text style={customerStyles.queryLinkText}>{hindi ? 'पूरा खाता देखें' : 'View full account history'}</Text></Pressable>
  </View>;

  if (answer.kind === 'ambiguous') return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{hindi ? 'कौन सा ग्राहक?' : 'Choose the customer'}</Text>
    <Text style={customerStyles.queryCopy}>{hindi ? 'एक से अधिक ग्राहक इस नाम से मिलते हैं। किसी एक का खाता खोलें।' : 'More than one customer matches that name. Choose one to inspect its account.'}</Text>
    {answer.matches.map((customer) => <Pressable key={customer.id} accessibilityRole="button" testID={`query-open-customer-${customer.id}`} onPress={() => onOpenCustomer(customer.id)} style={customerStyles.queryRow}><Text style={customerStyles.queryRowTitle}>{customer.name}</Text><Text style={customerStyles.queryRowAmount}>{money(Math.abs(customer.balancePaise))}</Text></Pressable>)}
  </View>;

  return <View style={customerStyles.queryAnswer}>
    <Text style={customerStyles.queryAnswerTitle}>{answer.kind === 'not-found' ? (hindi ? 'ग्राहक नहीं मिला' : 'Customer not found') : (hindi ? 'इस सवाल का भरोसेमंद जवाब नहीं है' : 'I can’t answer that from the ledger')}</Text>
    <Text style={customerStyles.queryCopy}>{answer.kind === 'not-found'
      ? (hindi ? 'इस दुकान में यह नाम या बोलचाल का नाम दर्ज नहीं है।' : 'That name or spoken alias is not saved in this shop.')
      : (hindi ? 'मैं ग्राहक की बाकी रकम, खुली बाकी सूची, देय वादे और पुष्ट लेन-देन दिखा सकता हूँ।' : 'I can answer customer balances, open balances, promises due, and confirmed transaction history. I won’t guess beyond saved records.')}</Text>
  </View>;
}

export function Customers() {
  const app = useApp();
  const { t } = app;
  const [query, setQuery] = useState('');
  const [ledgerQuestion, setLedgerQuestion] = useState('');
  const [ledgerAnswer, setLedgerAnswer] = useState<CustomerQueryAnswer | null>(null);
  const openPromises = app.customerPromises.filter((promise) => promise.status === 'open');
  const today = currentShopBusinessDate();
  const duePromises = dueCustomerPromises(app.customerPromises, app.customers, today);
  const customers = app.customers.filter((customer) =>
    `${customer.name} ${customer.aliases.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const askLedger = () => {
    const question = ledgerQuestion.trim();
    if (!question) return;
    Keyboard.dismiss();
    void app.run(async () => {
      setLedgerAnswer(await app.answerCustomerQuestion(question));
    }, t('Could not read the customer ledger. Try again.', 'ग्राहक का खाता नहीं पढ़ा जा सका। फिर कोशिश करें।'));
  };
  const openCustomerFromAnswer = (customerId: string) => {
    void app.run(async () => {
      await app.openCustomer(customerId);
      router.push('/(tabs)/customers/customer');
    }, t('Could not open this customer. Try again.', 'ग्राहक का खाता नहीं खुला। फिर कोशिश करें।'));
  };

  return <Screen
    nav={<Nav left={<Brand />} right={<Text style={customerStyles.shopContext}>{app.profile.name}</Text>} />}
    footer={<Action title={t('Add customer', 'ग्राहक जोड़ें')} icon="plus" testID="add-customer" disabled={app.busy} onPress={() => openScreen('customer-new')} />}
  >
    <Title title={t('Customers', 'ग्राहक')} subtitle={t('Their khata, promises and what remains.', 'उनका खाता, वादे और बाकी रकम।')} />
    <View style={customerStyles.balanceSummary}>
      <View style={customerStyles.balanceSummaryHeading}>
        <Text style={customerStyles.summaryLabel}>{t('OPEN BALANCE', 'बाकी रकम')}</Text>
        <Text style={customerStyles.summaryValue}>{formatPaise(app.customers.reduce((sum, customer) => sum + Math.max(customer.balancePaise, 0), 0))}</Text>
      </View>
      <View style={customerStyles.balanceSummaryMeta}>
        <Text style={customerStyles.summaryMeta}>{t('From confirmed entries', 'पुष्ट प्रविष्टियों से')}</Text>
        {duePromises.length ? <Text style={customerStyles.summaryMeta}>{t(`${duePromises.length} to follow up`, `${duePromises.length} पर ध्यान दें`)}</Text> : null}
      </View>
    </View>
    {app.customers.length > 0 ? <View style={customerStyles.askLedgerSection}>
      <Text style={customerStyles.askTitle}>{t('Ask your ledger', 'अपने खाते से पूछें')}</Text>
      <View style={customerStyles.askInputRow}>
        <Icon name="search" size={17} color={colors.muted} />
        <TextInput
          accessibilityLabel={t('Ask a customer ledger question', 'ग्राहक के खाते से सवाल पूछें')}
          placeholder={t('Ramesh ka kitna baaki hai?', 'रमेश का कितना बाकी है?')}
          placeholderTextColor={colors.muted}
          style={customerStyles.askInput}
          value={ledgerQuestion}
          onChangeText={(value) => { setLedgerQuestion(value); setLedgerAnswer(null); }}
          onSubmitEditing={askLedger}
          autoCapitalize="sentences"
          returnKeyType="search"
          testID="customer-ledger-question"
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('Ask ledger', 'खाते से पूछें')} accessibilityState={{ disabled: app.busy || !ledgerQuestion.trim() }} disabled={app.busy || !ledgerQuestion.trim()} onPress={askLedger} testID="ask-customer-ledger" style={({ pressed }) => [customerStyles.askButton, pressed && customerStyles.askButtonPressed, (!ledgerQuestion.trim() || app.busy) && customerStyles.askButtonDisabled]}>
          <Text style={customerStyles.askButtonText}>{t('Ask', 'पूछें')}</Text>
        </Pressable>
      </View>
      <Text style={customerStyles.askHint}>{t('Use Wispr Flow or type · confirmed entries only', 'Wispr Flow से बोलें या टाइप करें · केवल पुष्ट प्रविष्टियाँ')}</Text>
      {ledgerAnswer ? <CustomerQueryAnswerCard answer={ledgerAnswer} today={today} hindi={app.profile.language === 'hi'} onOpenCustomer={openCustomerFromAnswer} /> : null}
    </View> : null}
    {duePromises.length ? <View style={customerStyles.followUpSection}>
      <View style={customerStyles.followUpHeading}>
        <Text style={customerStyles.followUpTitle}>{t('To follow up', 'याद दिलाना है')}</Text>
        <Text style={customerStyles.followUpCountText}>{duePromises.length}</Text>
      </View>
      {duePromises.slice(0, 3).map((promise) => {
        const customer = app.customers.find((entry) => entry.id === promise.customerId);
        if (!customer) return null;
        return <Pressable key={promise.id} accessibilityRole="button" testID={`prepare-follow-up-${promise.id}`} onPress={() => app.startCustomerReminder(customer.id, promise.id)} style={({ pressed }) => [customerStyles.followUpRow, pressed && customerStyles.customerRowPressed]}>
          <View style={customerStyles.followUpCopy}><Text style={customerStyles.queryRowTitle}>{promise.customerName}</Text><Text style={customerStyles.queryFootnote}>{promise.dateSource === 'estimated' ? t(`Estimated follow-up · ${dateLabel(promise.dueDate!, false)}`, `अनुमानित तारीख · ${dateLabel(promise.dueDate!, true)}`) : promise.dateSource === 'owner' ? t(`Follow-up · ${dateLabel(promise.dueDate!, false)}`, `याद दिलाने की तारीख · ${dateLabel(promise.dueDate!, true)}`) : promise.dueDate && promise.dueDate < today ? t(`Overdue · ${dateLabel(promise.dueDate, app.profile.language === 'hi')}`, `बाकी · ${dateLabel(promise.dueDate, true)}`) : t(`Due today · ${dateLabel(promise.dueDate!, app.profile.language === 'hi')}`, `आज देय · ${dateLabel(promise.dueDate!, true)}`)}</Text></View>
          <Text style={customerStyles.followUpAction}>{t('Prepare', 'तैयार करें')}</Text>
        </Pressable>;
      })}
      {duePromises.length > 3 ? <Text style={customerStyles.queryFootnote}>{t(`And ${duePromises.length - 3} more in ledger questions.`, `और ${duePromises.length - 3} वादे खाते में हैं।`)}</Text> : null}
      <Text style={customerStyles.followUpNote}>{t('Messages are shared only after you review them.', 'समीक्षा के बाद ही संदेश साझा होगा।')}</Text>
    </View> : null}
    {app.customers.length > 0 ? <View style={customerStyles.search}>
      <Icon name="search" size={17} color={colors.muted} />
      <TextInput
        accessibilityLabel={t('Search customers', 'ग्राहक खोजें')}
        placeholder={t('Search customers or aliases', 'ग्राहक या बोलचाल का नाम खोजें')}
        placeholderTextColor={colors.muted}
        style={customerStyles.searchInput}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="customers-search"
      />
      {query ? <Pressable accessibilityRole="button" accessibilityLabel={t('Clear search', 'खोज साफ़ करें')} onPress={() => setQuery('')} style={customerStyles.clear}><Text style={styles.body}>×</Text></Pressable> : null}
    </View> : null}
    <View style={customerStyles.customerListHeading}><Text style={customerStyles.customerListTitle}>{t('Customers', 'ग्राहक')}</Text><Text style={customerStyles.customerListCount}>{customers.length}</Text></View>
    {customers.length ? <View style={customerStyles.customerList}>{customers.map((customer) => {
      const nextPromise = openPromises.filter((promise) => promise.customerId === customer.id)
        .sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))[0];
      const statusCopy = customer.balancePaise < 0
        ? t('Customer credit', 'ग्राहक के पास जमा')
        : nextPromise?.dueDate
          ? nextPromise.dateSource === 'estimated' ? t(`Estimated follow-up · ${dateLabel(nextPromise.dueDate, false)}`, `अनुमानित तारीख · ${dateLabel(nextPromise.dueDate, true)}`) : nextPromise.dateSource === 'owner' ? t(`Follow-up · ${dateLabel(nextPromise.dueDate, false)}`, `याद दिलाने की तारीख · ${dateLabel(nextPromise.dueDate, true)}`) : nextPromise.dueDate < today
            ? t(`Overdue · ${dateLabel(nextPromise.dueDate, app.profile.language === 'hi')}`, `बाकी · ${dateLabel(nextPromise.dueDate, true)}`)
            : nextPromise.dueDate === today
              ? t('Promise due today', 'आज भुगतान का वादा')
              : t(`Promised · ${dateLabel(nextPromise.dueDate, app.profile.language === 'hi')}`, `वादा · ${dateLabel(nextPromise.dueDate, true)}`)
          : customer.balancePaise > 0 ? t('Confirmed balance', 'पुष्ट बाकी') : t('Settled', 'पूरा भुगतान');
      return <Pressable
        key={customer.id}
        accessibilityRole="button"
        testID={`customer-${customer.id}`}
        onPress={() => {
          void app.run(async () => { await app.openCustomer(customer.id); router.push('/(tabs)/customers/customer'); }, t('Could not open this customer. Try again.', 'ग्राहक का खाता नहीं खुला। फिर कोशिश करें।'));
        }}
        style={({ pressed }) => [customerStyles.customerRow, pressed && customerStyles.customerRowPressed]}
      >
        <View style={customerStyles.customerAvatar}><Text style={customerStyles.customerAvatarText}>{customer.name.trim().slice(0, 1).toLocaleUpperCase()}</Text></View>
        <View style={customerStyles.customerCopy}>
          <Text numberOfLines={1} style={customerStyles.customerName}>{customer.name}</Text>
          <Text numberOfLines={1} style={customerStyles.customerMeta}>{statusCopy}</Text>
        </View>
        <View style={customerStyles.customerBalance}>
          <Text style={customerStyles.customerAmount}>{formatPaise(Math.abs(customer.balancePaise))}</Text>
          <Icon name="next" size={15} color={colors.outline} />
        </View>
      </Pressable>;
    })}</View> : query ? <Text style={customerStyles.emptyDetail}>{t('No customer matches that search.', 'इस खोज से कोई ग्राहक नहीं मिला।')}</Text> : <View style={customerStyles.emptyCard}>
      <View style={customerStyles.emptyIcon}><Icon name="notes" size={24} color={colors.action} /></View>
      <Text style={customerStyles.emptyTitle}>{t('Keep every regular in view', 'हर नियमित ग्राहक का हिसाब सामने रखें')}</Text>
      <Text style={customerStyles.emptyDetail}>{t('Add one customer to start a confirmed credit and payment history. You can add names and spoken aliases as you go.', 'पुष्ट उधार और भुगतान का इतिहास शुरू करने के लिए एक ग्राहक जोड़ें। नाम और बोलचाल के नाम बाद में भी जोड़ सकते हैं।')}</Text>
      <Action title={t('Add your first customer', 'पहला ग्राहक जोड़ें')} icon="plus" testID="add-first-customer" onPress={() => openScreen('customer-new')} />
    </View>}
    <View style={customerStyles.ledgerNote}><Text style={customerStyles.ledgerNoteText}>{t('Promises do not change the confirmed balance.', 'वादे से पुष्ट बाकी रकम नहीं बदलती।')}</Text></View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function CustomerDetail() {
  const app = useApp();
  const { t } = app;
  const customer = app.customers.find((entry) => entry.id === app.activeCustomerId);
  const promises = app.customerPromises.filter((promise) => promise.customerId === app.activeCustomerId);

  useEffect(() => { if (app.activeCustomerId) void app.openCustomer(app.activeCustomerId); }, [app.activeCustomerId]);

  if (!customer) return <Screen nav={<Nav left={<CustomerBack />} />}><Text style={customerStyles.emptyDetail}>{t('Select a customer from the list first.', 'पहले सूची से ग्राहक चुनें।')}</Text></Screen>;

  const reversedIds = new Set(app.customerEvents.filter((event) => event.kind === 'reversal' && event.reversesEventId).map((event) => event.reversesEventId));
  const activeBalance = customer.balancePaise;
  return <Screen nav={<Nav left={<CustomerBack />} />}>
    <Title title={customer.name} subtitle={customer.aliases.length ? `${t('Also known as', 'बोलचाल के नाम')} · ${customer.aliases.join(', ')}` : t('Customer credit history', 'ग्राहक का उधार इतिहास')} />
    <View style={customerStyles.detailBalance}>
      <Text style={customerStyles.detailSummaryLabel}>{activeBalance < 0 ? t('CUSTOMER CREDIT', 'ग्राहक के पास जमा') : t('OPEN BALANCE', 'बाकी रकम')}</Text>
      <Text style={customerStyles.detailAmount}>{formatPaise(Math.abs(activeBalance))}</Text>
      <Text style={customerStyles.detailCaption}>{t('Calculated from confirmed entries', 'पुष्ट प्रविष्टियों से गणना')}</Text>
    </View>
    <View style={customerStyles.actionGrid}>
      <Action title={t('Add credit', 'उधार जोड़ें')} icon="plus" testID="record-credit" onPress={() => app.startCustomerEvent(customer.id, 'credit_sale')} />
      <Action title={t('Record repayment', 'भुगतान दर्ज करें')} kind="outline" testID="record-repayment" onPress={() => app.startCustomerEvent(customer.id, 'repayment_received')} />
    </View>
    <View style={customerStyles.secondaryAction}>
      <Action title={t('Add a promise to pay', 'भुगतान का वादा जोड़ें')} kind="text" testID="add-promise" onPress={() => app.startCustomerPromise(customer.id)} />
    </View>
    {promises.length ? <View style={customerStyles.timelineSection}>
      <Section>{t('Follow-ups and promises', 'याद दिलाने की तारीखें और वादे')}</Section>
      {promises.map((promise) => <View key={promise.id} style={customerStyles.promiseCard}>
        <View style={customerStyles.promiseCopy}>
          <Text style={customerStyles.promiseTitle}>{promise.dateSource === 'estimated' ? t('Estimated follow-up', 'अनुमानित याद दिलाने की तारीख') : promise.dateSource === 'owner' ? t('Follow-up', 'याद दिलाने की तारीख') : promise.amountPaise === null ? t('Payment promised', 'भुगतान का वादा') : t(`Promise · ${formatPaise(promise.amountPaise)}`, `वादा · ${formatPaise(promise.amountPaise)}`)}</Text>
          <Text style={customerStyles.customerMeta}>{promise.dueDate ? promise.dateSource ? t(`On ${dateLabel(promise.dueDate, false)}`, `${dateLabel(promise.dueDate, true)} को`) : t(`By ${dateLabel(promise.dueDate, app.profile.language === 'hi')}`, `${dateLabel(promise.dueDate, true)} तक`) : t('No date set', 'तारीख़ तय नहीं')}</Text>
          {promise.note ? <Text style={customerStyles.customerMeta}>{promise.note}</Text> : null}
        </View>
        <View style={customerStyles.promiseActions}>
          {Platform.OS === 'ios' && promise.status === 'open' ? <Pressable accessibilityRole="button" testID={`change-follow-up-${promise.id}`} style={customerStyles.promiseShare} onPress={() => {
            Alert.prompt(
              t('Change follow-up date', 'याद दिलाने की तारीख बदलें'),
              t('Enter the date as YYYY-MM-DD.', 'तारीख YYYY-MM-DD में भरें।'),
              [
                { text: t('Cancel', 'रद्द करें'), style: 'cancel' },
                { text: t('Save date', 'तारीख सहेजें'), onPress: (value?: string) => {
                  const date = value?.trim() ?? '';
                  if (!isCalendarDate(date)) {
                    Alert.alert(t('Enter a valid date', 'सही तारीख भरें'), t('Use YYYY-MM-DD.', 'YYYY-MM-DD का इस्तेमाल करें।'));
                    return;
                  }
                  void app.run(async () => { await app.correctPromiseDate(promise.id, newOperationId(), date); }, t('Could not change the date. Try again.', 'तारीख नहीं बदली। फिर कोशिश करें।'));
                } },
              ],
              'plain-text', promise.dueDate ?? '', 'numbers-and-punctuation',
            );
          }}><Text style={customerStyles.promiseShareText}>{t('Change date', 'तारीख बदलें')}</Text></Pressable> : null}
          {promise.status === 'open' && customer.balancePaise > 0 ? <Pressable accessibilityRole="button" testID={`prepare-reminder-${promise.id}`} style={customerStyles.promiseShare} onPress={() => app.startCustomerReminder(customer.id, promise.id)}><Text style={customerStyles.promiseShareText}>{t('Prepare', 'तैयार करें')}</Text></Pressable> : null}
          {promise.status === 'open' ? <Pressable accessibilityRole="button" testID={`mark-promise-kept-${promise.id}`} style={customerStyles.promiseDone} onPress={() => {
            void app.run(() => app.updatePromiseStatus(promise.id, 'kept'), t('Could not update this promise. Try again.', 'वादा अपडेट नहीं हुआ। फिर कोशिश करें।'));
          }}><Text style={customerStyles.promiseDoneText}>{promise.dateSource ? t('Done', 'पूरा') : t('Kept', 'पूरा')}</Text></Pressable> : <Text style={customerStyles.promiseStatus}>{t(promise.status, promise.status === 'kept' ? 'पूरा' : promise.status === 'missed' ? 'बाकी' : promise.status === 'cancelled' ? 'रद्द' : 'विवादित')}</Text>}
        </View>
      </View>)}
    </View> : null}
    <View style={customerStyles.timelineSection}>
      {app.customerRetailSales.length ? <>
        <Section>{t('Recorded purchases', 'दर्ज की गई खरीद')}</Section>
        {app.customerRetailSales.map((sale) => <View key={sale.id} style={customerStyles.eventCard} testID={`customer-retail-sale-${sale.id}`}>
          <View style={customerStyles.eventGlyph}><Icon name="box" size={17} color={colors.action} /></View>
          <View style={customerStyles.eventCopy}>
            <Text style={customerStyles.eventTitle}>{sale.paymentState === 'credit' ? t('Items bought on credit', 'उधार पर लिया गया सामान') : t('Retail purchase', 'दुकान की खरीद')}</Text>
            <Text style={customerStyles.customerMeta}>{dateLabel(sale.businessDate, app.profile.language === 'hi')} · {sale.paymentState === 'unknown'
              ? t('Payment not specified', 'भुगतान नहीं बताया')
              : sale.paymentState === 'credit' ? t('Linked to the credit entry below', 'नीचे की उधार प्रविष्टि से जुड़ा') : t('Paid in cash', 'नकद भुगतान')}</Text>
            {sale.lines.map((line, index) => {
              const item = app.catalog.find((catalogItem) => catalogItem.id === line.catalogueItemId);
              return <Text key={`${sale.id}-${index}`} style={customerStyles.customerMeta}>{item ? `${item.name} ${item.packSize}` : t('Archived catalog item', 'पुराना उत्पाद')} · {line.quantity}</Text>;
            })}
            <Text numberOfLines={2} style={customerStyles.sourceText}>“{sale.sourceText}”</Text>
          </View>
        </View>)}
      </> : null}
      <Section>{t('Transaction history', 'लेन-देन का इतिहास')}</Section>
      {app.customerEvents.length ? app.customerEvents.map((event) => {
        const title = event.kind === 'credit_sale' ? t('Credit sale', 'उधार बिक्री')
          : event.kind === 'repayment_received' ? t('Repayment received', 'भुगतान मिला')
            : event.kind === 'sale_return' ? t('Returned goods', 'वापसी')
              : event.kind === 'write_off' ? t('Balance adjustment', 'बाकी रकम में बदलाव') : t('Reversal', 'रद्द प्रविष्टि');
        const reversed = reversedIds.has(event.id);
        return <View key={event.id} style={[customerStyles.eventCard, reversed && customerStyles.eventReversed]}>
          <View style={customerStyles.eventGlyph}><Icon name={event.amountDeltaPaise > 0 ? 'plus' : 'check'} size={17} color={event.amountDeltaPaise > 0 ? colors.action : colors.green} /></View>
          <View style={customerStyles.eventCopy}>
            <Text style={customerStyles.eventTitle}>{reversed ? t(`${title} · reversed`, `${title} · वापस ली गई`) : title}</Text>
            <Text style={customerStyles.customerMeta}>{dateLabel(event.businessDate, app.profile.language === 'hi')}{event.paymentMethod ? ` · ${event.paymentMethod.toUpperCase()}` : ''}</Text>
            {event.note ? <Text style={customerStyles.customerMeta}>{event.note}</Text> : null}
            {event.lines.map((line, index) => <Text key={`${event.id}-${index}`} style={customerStyles.customerMeta}>{line.name} · {line.quantity} {line.unit} · {formatPaise(line.amountPaise)}</Text>)}
            {event.sourceText ? <Text numberOfLines={2} style={customerStyles.sourceText}>“{event.sourceText}”</Text> : null}
          </View>
          <Text style={[customerStyles.eventAmount, event.amountDeltaPaise < 0 && customerStyles.paymentAmount]}>{event.amountDeltaPaise > 0 ? '+' : '−'}{formatPaise(event.amountPaise)}</Text>
          {event.kind !== 'reversal' && !reversed ? <Pressable accessibilityRole="button" accessibilityLabel={t(`Reverse ${title}`, `${title} वापस लें`)} testID={`reverse-customer-event-${event.id}`} onPress={() => Alert.alert(
            t('Reverse this entry?', 'यह प्रविष्टि वापस लें?'),
            t('The original stays in history. A linked reversal will restore its balance effect.', 'मूल प्रविष्टि इतिहास में रहेगी। लिंक की गई वापसी बाकी रकम का असर उलट देगी।'),
            [{ text: t('Cancel', 'रद्द करें'), style: 'cancel' }, { text: t('Reverse entry', 'प्रविष्टि वापस लें'), style: 'destructive', onPress: () => {
              void app.run(async () => { await app.reverseCustomerEvent(event.id, newOperationId()); }, t('Could not reverse this entry. Try again.', 'प्रविष्टि वापस नहीं ली जा सकी। फिर कोशिश करें।'));
            } }],
          )} style={customerStyles.reverseButton}><Text style={customerStyles.reverseText}>{t('Reverse', 'वापस लें')}</Text></Pressable> : null}
        </View>;
      }) : <Text style={customerStyles.emptyDetail}>{t('Confirmed credit sales and repayments will appear here.', 'पुष्ट उधार बिक्री और भुगतान यहाँ दिखेंगे।')}</Text>}
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function NewCustomer() {
  const app = useApp();
  const { t } = app;
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  return <Screen nav={<Nav left={<CustomerBack />} />} footer={<Action title={t('Save customer', 'ग्राहक सहेजें')} testID="save-customer" disabled={app.busy || !name.trim()} onPress={() => {
    Keyboard.dismiss();
    void app.run(async () => {
      const customer = await app.addCustomer({ name, aliases: aliases.split(',').map((part) => part.trim()).filter(Boolean) });
      app.setActiveCustomerId(customer.id);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/customers');
    }, t('Could not save this customer. Try again.', 'ग्राहक नहीं सहेजा गया। फिर कोशिश करें।'));
  }} />}>
    <Title title={t('Add customer', 'ग्राहक जोड़ें')} subtitle={t('Start with the name your shop uses. Contact details are optional.', 'दुकान में इस्तेमाल होने वाले नाम से शुरू करें। संपर्क जानकारी वैकल्पिक है।')} />
    <View style={styles.stack}>
      <Input label={t('Customer name', 'ग्राहक का नाम')} placeholder={t('e.g. Ramesh Sharma', 'जैसे रमेश शर्मा')} defaultValue={name} onChangeText={setName} maxLength={120} autoCapitalize="words" autoCorrect={false} testID="customer-name" />
      <Input label={t('Spoken names or aliases · optional', 'बोलचाल के नाम · वैकल्पिक')} placeholder={t('Ramesh ji, Sharma uncle', 'रमेश जी, शर्मा अंकल')} defaultValue={aliases} onChangeText={setAliases} maxLength={500} autoCapitalize="words" autoCorrect={false} testID="customer-aliases" />
      <Hint>{t('Two customers can share an alias. DukaanFlow will ask you to choose when a spoken name is ambiguous.', 'दो ग्राहकों का बोलचाल का नाम एक हो सकता है। अस्पष्ट होने पर DukaanFlow आपसे चुनाव पूछेगा।')}</Hint>
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function CustomerRecord() {
  const app = useApp();
  const { t } = app;
  const [customerId, setCustomerId] = useState(app.activeCustomerId ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [promiseIncluded, setPromiseIncluded] = useState(false);
  const [promiseDueDate, setPromiseDueDate] = useState('');
  const [itemizeCredit, setItemizeCredit] = useState(false);
  const [saleLines, setSaleLines] = useState<{ catalogueItemId: string; quantity: string; amount: string }[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const operationId = useRef(newOperationId());
  const promiseOperationId = useRef(newOperationId());
  const processedSourceText = useRef<string | null>(null);
  const sourceText = app.customerSourceText;
  const kind = app.customerEventKind;
  const proposal = useMemo(
    () => sourceText ? proposeCustomerCapture(sourceText, app.customers, currentShopBusinessDate()) : null,
    [sourceText, app.customers],
  );
  const isRepayment = kind === 'repayment_received';
  const isCreditSale = kind === 'credit_sale';
  const parsedSaleLines = saleLines.map((line) => ({
    catalogueItemId: line.catalogueItemId,
    quantity: /^\d+$/u.test(line.quantity.trim()) ? Number(line.quantity) : null,
    amountPaise: parseRupees(line.amount),
  }));
  const itemizedLinesValid = parsedSaleLines.length > 0 && parsedSaleLines.every((line) =>
    line.quantity !== null && Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.amountPaise !== null && line.amountPaise > 0);
  const itemizedAmountPaise = itemizedLinesValid
    ? parsedSaleLines.reduce((sum, line) => sum + (line.amountPaise ?? 0), 0)
    : null;
  const amountPaise = parseRupees(amount);
  const itemizedTotalMatches = itemizedLinesValid && amountPaise !== null && itemizedAmountPaise === amountPaise;
  const customerProducts = app.catalog.filter((item) =>
    `${item.name} ${item.packSize}`.toLocaleLowerCase().includes(catalogSearch.trim().toLocaleLowerCase()),
  );
  const selectedCustomer = app.customers.find((customer) => customer.id === customerId);
  const balanceAfterPaise = selectedCustomer && amountPaise !== null && kind !== 'unknown'
    ? selectedCustomer.balancePaise + (isRepayment ? -amountPaise : amountPaise)
    : null;
  const title = isRepayment ? t('Record repayment', 'भुगतान दर्ज करें') : isCreditSale ? t('Record credit sale', 'उधार बिक्री दर्ज करें') : t('Review customer entry', 'ग्राहक प्रविष्टि जाँचें');

  useEffect(() => {
    if (!customerId && app.activeCustomerId) setCustomerId(app.activeCustomerId);
  }, [app.activeCustomerId, customerId]);

  useEffect(() => {
    if (!sourceText || processedSourceText.current === sourceText || !proposal) return;
    processedSourceText.current = sourceText;
    if (proposal.kind) app.setCustomerEventKind(proposal.kind);
    if (proposal.customerMatches.length === 1) setCustomerId(proposal.customerMatches[0].id);
    else if (proposal.customerMatches.length > 1) setCustomerId('');
    if (proposal.amountPaise !== null) {
      const rupees = (proposal.amountPaise / 100).toFixed(2);
      setAmount(rupees.endsWith('.00') ? rupees.slice(0, -3) : rupees.replace(/0$/u, ''));
    }
    if (proposal.paymentMethod) setMethod(proposal.paymentMethod);
    if (proposal.promiseMentioned && proposal.kind === 'credit_sale') {
      setPromiseIncluded(true);
      setPromiseDueDate(proposal.promiseDueDate ?? '');
    }
  }, [app, proposal, sourceText]);

  const dateLooksValid = isCalendarDate(promiseDueDate.trim());
  const canSavePromise = !promiseIncluded || (isCreditSale && dateLooksValid);

  return <Screen nav={<Nav left={<CustomerBack />} />} footer={<Action
    title={t('Confirm and save', 'पुष्टि करके सहेजें')}
    testID="confirm-customer-event"
    disabled={app.busy || !customerId || kind === 'unknown' || amountPaise === null || (isCreditSale && itemizeCredit && !itemizedTotalMatches) || (isRepayment && !method) || !canSavePromise || !!proposal?.issues.includes('multiple-events')}
    onPress={() => {
      Keyboard.dismiss();
      if (amountPaise === null || kind === 'unknown') return;
      void app.run(async () => {
        const entry = {
          customerId,
          kind: kind as Exclude<CustomerCreditKind, 'reversal'>,
          amountPaise,
          paymentMethod: isRepayment ? method : null,
          note: note.trim() || null,
          sourceText: sourceText.trim() || null,
          ...(isCreditSale && itemizeCredit ? {
            lines: parsedSaleLines.map((line) => ({
              catalogueItemId: line.catalogueItemId,
              quantity: line.quantity!,
              amountPaise: line.amountPaise!,
            })),
          } : {}),
        };
        if (isCreditSale) {
          await app.saveCustomerEventWithPromise(operationId.current, promiseOperationId.current, entry, {
            amountPaise: null,
            dueDate: promiseIncluded ? promiseDueDate.trim() : estimateFollowUpDate(currentShopBusinessDate()),
            note: null,
            ...(!promiseIncluded ? { dateSource: 'estimated' as const } : {}),
          });
        } else {
          await app.saveCustomerEvent(operationId.current, entry);
        }
        app.setCustomerSourceText('');
        router.back();
      }, t('Could not save this customer entry. Review it and try again.', 'ग्राहक प्रविष्टि नहीं सहेजी गई। जाँचकर फिर कोशिश करें।'));
    }}
  />}>
    <Title title={title} subtitle={t('Check every detail before it changes the customer balance.', 'ग्राहक की बाकी रकम बदलने से पहले हर जानकारी जाँचें।')} />
    {sourceText ? <View style={customerStyles.transcriptCard}>
      <Text style={customerStyles.summaryLabel}>{t('FROM WISPR FLOW OR TYPED TEXT', 'WISPR FLOW या टाइप किया हुआ पाठ')}</Text>
      <Text style={customerStyles.transcriptText}>“{sourceText}”</Text>
      <Hint>{t('Suggested fields below are editable. Nothing is recorded until you confirm.', 'नीचे सुझाई गई जानकारी बदली जा सकती है। आपकी पुष्टि से पहले कुछ दर्ज नहीं होगा।')}</Hint>
      {proposal?.customerMatches.length ? <Text style={customerStyles.suggestionNote}>{proposal.customerMatches.length > 1
        ? t('More than one shop record matches this name. Choose the right customer below.', 'इस नाम से एक से अधिक ग्राहक मिलते हैं। नीचे सही ग्राहक चुनें।')
        : t(`Customer suggestion · ${proposal.customerMatches[0].name}`, `ग्राहक सुझाव · ${proposal.customerMatches[0].name}`)}</Text> : null}
      {proposal && !proposal.customerMatches.length ? <Text style={customerStyles.suggestionNote}>{t('No saved customer matched this wording. Choose the person below.', 'इस नाम से कोई सहेजा ग्राहक नहीं मिला। नीचे व्यक्ति चुनें।')}</Text> : null}
      {proposal?.issues.map((issue) => (
        <Text key={issue} style={customerStyles.validation}>{issue === 'multiple-events'
          ? t('This sentence includes more than one event. Record each one separately.', 'इस वाक्य में एक से अधिक घटना है। हर घटना अलग दर्ज करें।')
          : issue === 'amount-unclear'
            ? t('I found more than one possible amount. Enter the amount for this event.', 'एक से अधिक संभावित रकम मिली। इस घटना की रकम भरें।')
            : issue === 'payment-method-unclear'
              ? t('Choose one payment method below.', 'नीचे भुगतान का तरीका चुनें।')
              : t('The spoken date was unclear. Enter the promise date below.', 'बोली गई तारीख़ स्पष्ट नहीं थी। नीचे वादे की तारीख़ भरें।')}</Text>
      ))}
    </View> : null}
    <View style={styles.stack}>
      <Text style={styles.fieldLabel}>{t('What happened?', 'क्या हुआ?')}</Text>
      <View style={styles.group}>
        <Row title={t('Customer bought on credit', 'ग्राहक ने उधार सामान लिया')} subtitle={t('Adds to the amount owed', 'बाकी रकम बढ़ेगी')} selected={kind === 'credit_sale'} testID="kind-credit-sale" onPress={() => app.setCustomerEventKind('credit_sale')} />
        <Row title={t('Customer repaid', 'ग्राहक ने भुगतान किया')} subtitle={t('Reduces the amount owed', 'बाकी रकम घटेगी')} selected={kind === 'repayment_received'} border={false} testID="kind-repayment" onPress={() => app.setCustomerEventKind('repayment_received')} />
      </View>
      <View style={customerStyles.ledgerNote}><Hint>{t('A purchase does not mean credit. Choose “bought on credit” only when the owner confirms the customer still owes this amount.', 'खरीद का मतलब उधार नहीं है। “उधार सामान लिया” तभी चुनें जब मालिक पुष्टि करे कि यह रकम बाकी है।')}</Hint></View>
      <Text style={styles.fieldLabel}>{t('Customer', 'ग्राहक')}</Text>
      {app.customers.length ? <View style={styles.group}>{app.customers.map((customer, index) => <Row key={customer.id} title={customer.name} subtitle={customer.aliases.length ? customer.aliases.join(' · ') : undefined} selected={customerId === customer.id} border={index < app.customers.length - 1} testID={`choose-customer-${customer.id}`} onPress={() => setCustomerId(customer.id)} />)}</View> : <Action title={t('Add a customer', 'ग्राहक जोड़ें')} kind="outline" onPress={() => openScreen('customer-new')} />}
      {isCreditSale && app.catalog.length ? <View style={styles.group}>
        <Row title={t('Itemize this credit with products', 'इस उधार में सामान दर्ज करें')} subtitle={t('Optional · updates product stock', 'वैकल्पिक · सामान का स्टॉक बदलेगा')} selected={itemizeCredit} border={false} testID="itemize-credit-sale" onPress={() => setItemizeCredit((current) => !current)} />
      </View> : null}
      {isCreditSale && itemizeCredit ? <>
        <Section>{t('Products in this credit sale', 'इस उधार बिक्री का सामान')}</Section>
        <Hint>{t('Choose items from this shop’s catalogue. Enter quantity and the amount for each line; the checked total becomes the credit amount and stock is reduced after you confirm.', 'इस दुकान की सूची से सामान चुनें। हर पंक्ति की मात्रा और रकम भरें; जाँचा हुआ कुल उधार रकम बनेगा और पुष्टि के बाद स्टॉक घटेगा।')}</Hint>
        <Input label={t('Find a product', 'सामान खोजें')} placeholder={t('Product or pack size', 'सामान या पैक खोजें')} value={catalogSearch} onChangeText={setCatalogSearch} testID="customer-product-search" />
        {customerProducts.length ? <View style={styles.group}>{customerProducts.map((item, index) => {
          const selected = saleLines.some((line) => line.catalogueItemId === item.id);
          const stock = app.stockLevels.find((level) => level.catalogueItemId === item.id)?.quantity ?? 0;
          return <Row key={item.id} title={item.name} subtitle={`${item.packSize} · ${t('On hand', 'स्टॉक')} ${stock}`} selected={selected} border={index < customerProducts.length - 1} testID={`toggle-credit-item-${item.id}`} onPress={() => setSaleLines((current) => selected
            ? current.filter((line) => line.catalogueItemId !== item.id)
            : [...current, { catalogueItemId: item.id, quantity: '1', amount: '' }])} />;
        })}</View> : <Hint>{t('No matching item in this shop catalogue. Add the product in Products first.', 'इस दुकान की सूची में सामान नहीं मिला। पहले Products में जोड़ें।')}</Hint>}
        {saleLines.map((line) => {
          const item = app.catalog.find((entry) => entry.id === line.catalogueItemId);
          if (!item) return null;
          return <View key={line.catalogueItemId} style={customerStyles.itemizedLine}>
            <Text style={customerStyles.queryRowTitle}>{item.name} · {item.packSize}</Text>
            <View style={customerStyles.itemizedFields}>
              <View style={customerStyles.itemizedField}><Input label={t('Quantity', 'मात्रा')} placeholder="1" value={line.quantity} onChangeText={(value) => setSaleLines((current) => current.map((entry) => entry.catalogueItemId === line.catalogueItemId ? { ...entry, quantity: value } : entry))} keyboardType="number-pad" testID={`credit-quantity-${item.id}`} /></View>
              <View style={customerStyles.itemizedField}><Input label={t('Line amount ₹', 'पंक्ति रकम ₹')} placeholder="0" value={line.amount} onChangeText={(value) => setSaleLines((current) => current.map((entry) => entry.catalogueItemId === line.catalogueItemId ? { ...entry, amount: value } : entry))} keyboardType="decimal-pad" testID={`credit-line-amount-${item.id}`} /></View>
            </View>
          </View>;
        })}
        <Input label={t('Total credit amount', 'कुल उधार रकम')} placeholder="₹ 100" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="customer-entry-amount" />
        <Text style={customerStyles.reviewAfter}>{t('Product lines total', 'सामान की पंक्तियों का कुल')} · {itemizedAmountPaise === null ? '₹—' : formatPaise(itemizedAmountPaise)}</Text>
        {itemizedLinesValid && amountPaise !== null && !itemizedTotalMatches ? <Text style={customerStyles.validation}>{t('Product line amounts must add up to the spoken credit amount.', 'सामान की पंक्तियों की रकम बोली गई उधार रकम के बराबर होनी चाहिए।')}</Text> : null}
      </> : <Input label={t('Amount in rupees', 'रुपये में रकम')} placeholder="₹ 350" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="customer-entry-amount" />}
      {amount && amountPaise === null ? <Text style={customerStyles.validation}>{t('Enter a valid amount, such as 350 or 350.50.', 'सही रकम लिखें। जैसे 350 या 350.50।')}</Text> : null}
      {isRepayment ? <>
        <Text style={styles.fieldLabel}>{t('How was it paid?', 'भुगतान कैसे मिला?')}</Text>
        <View style={styles.group}>{(['cash', 'upi', 'card', 'bank_transfer', 'other'] as const).map((entry, index) => <Row key={entry} title={entry === 'bank_transfer' ? t('Bank transfer', 'बैंक ट्रांसफर') : t(entry.toUpperCase(), entry === 'cash' ? 'नकद' : entry === 'upi' ? 'यूपीआई' : entry === 'card' ? 'कार्ड' : 'अन्य')} selected={method === entry} border={index < 4} testID={`payment-method-${entry}`} onPress={() => setMethod(entry)} />)}</View>
        <Hint>{t('This records what the shop owner confirmed receiving. It does not verify the bank or UPI transaction.', 'यह दुकान-मालिक द्वारा मिलने की पुष्टि की गई रकम दर्ज करता है। बैंक या UPI भुगतान की जाँच नहीं करता।')}</Hint>
      </> : null}
      {isCreditSale ? <>
        <View style={styles.group}>
          <Row
            title={t('Add a promise to pay', 'भुगतान का वादा जोड़ें')}
            subtitle={t('Saved with this credit entry', 'इस उधार प्रविष्टि के साथ सहेजा जाएगा')}
            selected={promiseIncluded}
            border={false}
            testID="include-payment-promise"
            onPress={() => setPromiseIncluded((current) => !current)}
          />
        </View>
        {promiseIncluded ? <>
          <Input label={t('Promised date', 'वादा की तारीख़')} placeholder="YYYY-MM-DD" value={promiseDueDate} onChangeText={setPromiseDueDate} autoCapitalize="none" testID="customer-entry-promise-date" />
          {promiseDueDate && !dateLooksValid ? <Text style={customerStyles.validation}>{t('Use YYYY-MM-DD, for example 2026-11-27.', 'YYYY-MM-DD लिखें, जैसे 2026-11-27।')}</Text> : null}
          <Hint>{t('The promise is linked to this sale. It does not change the balance or count as a payment.', 'यह वादा इस बिक्री से जुड़ा रहेगा। इससे बाकी रकम नहीं बदलेगी और भुगतान दर्ज नहीं होगा।')}</Hint>
        </> : null}
      </> : null}
      <Input label={t('Note · optional', 'नोट · वैकल्पिक')} placeholder={t('What was included?', 'क्या सामान दिया?')} value={note} onChangeText={setNote} maxLength={500} testID="customer-entry-note" />
      {selectedCustomer ? <View style={customerStyles.reviewSummary}>
        <Text style={customerStyles.summaryLabel}>{t('BALANCE EFFECT', 'बाकी रकम पर असर')}</Text>
        <Text style={customerStyles.reviewTitle}>{selectedCustomer.name} · {amountPaise ? formatPaise(amountPaise) : '₹—'} · {isRepayment ? t('repayment', 'भुगतान') : isCreditSale ? t('credit sale', 'उधार बिक्री') : t('choose an event type', 'घटना चुनें')}</Text>
        {balanceAfterPaise !== null ? <Text style={customerStyles.reviewAfter}>{balanceAfterPaise < 0 ? t('Customer credit after save', 'सहेजने के बाद ग्राहक के खाते में जमा') : t('Balance after save', 'सहेजने के बाद बाकी')} · {formatPaise(Math.abs(balanceAfterPaise))}</Text> : null}
        {isCreditSale && !promiseIncluded ? <Hint>{t('Follow-up is estimated for seven days from today. Add a promise date above if one was stated.', 'याद दिलाने की तारीख आज से सात दिन बाद मानी जाएगी। बताई गई तारीख ऊपर जोड़ें।')}</Hint> : null}
        {promiseIncluded && isCreditSale ? <Text style={customerStyles.reviewAfter}>{t('Promise to pay', 'भुगतान का वादा')} · {promiseDueDate || t('add a date', 'तारीख़ जोड़ें')}</Text> : null}
      </View> : null}
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function CustomerPromise() {
  const app = useApp();
  const { t } = app;
  const customer = app.customers.find((entry) => entry.id === app.activeCustomerId);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const operationId = useRef(newOperationId());
  const amountPaise = amount ? parseRupees(amount) : null;

  return <Screen nav={<Nav left={<CustomerBack />} />} footer={<Action title={t('Save promise', 'वादा सहेजें')} testID="save-promise" disabled={app.busy || !customer || (!!amount && amountPaise === null)} onPress={() => {
    if (!customer || (amount && amountPaise === null)) return;
    Keyboard.dismiss();
    void app.run(async () => {
      await app.savePromiseToPay(operationId.current, {
        customerId: customer.id,
        amountPaise,
        dueDate: dueDate.trim() || null,
        note: note.trim() || null,
        relatedEventId: null,
      });
      router.back();
    }, t('Could not save this promise. Check the date format and try again.', 'वादा नहीं सहेजा गया। तारीख़ जाँचकर फिर कोशिश करें।'));
  }} />}>
    <Title title={t('Promise to pay', 'भुगतान का वादा')} subtitle={customer?.name ?? t('Choose a customer first.', 'पहले ग्राहक चुनें।')} />
    <View style={styles.stack}>
      <Input label={t('Promised amount · optional', 'वादा की गई रकम · वैकल्पिक')} placeholder="₹ 350" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="promise-amount" />
      {amount && amountPaise === null ? <Text style={customerStyles.validation}>{t('Enter a valid amount.', 'सही रकम लिखें।')}</Text> : null}
      <Input label={t('Due date · optional', 'देय तारीख़ · वैकल्पिक')} placeholder="YYYY-MM-DD" onChangeText={setDueDate} autoCapitalize="none" autoCorrect={false} spellCheck={false} smartInsertDelete={false} testID="promise-date" />
      <Input label={t('Note · optional', 'नोट · वैकल्पिक')} placeholder={t('What did they say?', 'उन्होंने क्या कहा?')} value={note} onChangeText={setNote} maxLength={500} testID="promise-note" />
      <View style={customerStyles.promiseCaveat}><Icon name="notes" size={18} color={colors.action} /><Text style={customerStyles.promiseCaveatText}>{t('A promise sets a follow-up date. It does not change the amount owed or record a payment.', 'वादा आगे याद दिलाने की तारीख़ रखता है। इससे बाकी रकम नहीं बदलती और भुगतान दर्ज नहीं होता।')}</Text></View>
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

export function CustomerReminder() {
  const app = useApp();
  const { t } = app;
  const customer = app.customers.find((entry) => entry.id === app.activeCustomerId);
  const promise = app.customerPromises.find((entry) => entry.id === app.activePromiseId);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!customer || !promise) {
      setMessage('');
      return;
    }
    setMessage(buildCustomerReminderMessage({
      customerName: customer.name,
      balancePaise: customer.balancePaise,
      dueDateLabel: promise.dueDate && !promise.dateSource ? dateLabel(promise.dueDate, app.profile.language === 'hi') : null,
      shopName: app.profile.name || (app.profile.language === 'hi' ? 'हमारी दुकान' : 'our shop'),
      language: app.profile.language,
    }) ?? '');
  }, [app.activePromiseId, app.profile.language, app.profile.name, customer?.balancePaise, customer?.id, customer?.name, promise?.dueDate, promise?.id]);

  const eligible = !!customer && !!promise && promise.status === 'open' && customer.balancePaise > 0;
  return <Screen nav={<Nav left={<CustomerBack />} />} footer={<Action
    title={t('Choose an app to share', 'साझा करने के लिए ऐप चुनें')}
    testID="share-customer-reminder"
    disabled={!eligible || !message.trim() || app.busy}
    onPress={() => {
      if (!eligible || !message.trim()) return;
      Keyboard.dismiss();
      void app.run(async () => {
        await Share.share({ message: message.trim(), title: t('Payment reminder', 'भुगतान याद दिलाना') });
      }, t('Could not open sharing options. Try again.', 'साझा करने के विकल्प नहीं खुले। फिर कोशिश करें।'));
    }}
  />}>
    <Title title={t('Review reminder', 'याद दिलाने वाला संदेश जाँचें')} subtitle={customer?.name ?? t('Customer unavailable', 'ग्राहक उपलब्ध नहीं')} />
    {customer && promise ? <View style={customerStyles.reminderSummary}>
      <Text style={customerStyles.detailSummaryLabel}>{t('CONFIRMED BALANCE', 'पुष्ट बाकी रकम')}</Text>
      <Text style={customerStyles.reminderAmount}>{customer.balancePaise > 0 ? formatPaise(customer.balancePaise) : formatPaise(Math.abs(customer.balancePaise))}</Text>
      <Text style={customerStyles.customerMeta}>{promise.dueDate ? promise.dateSource === 'estimated' ? t(`Estimated follow-up · ${dateLabel(promise.dueDate, false)}`, `अनुमानित तारीख · ${dateLabel(promise.dueDate, true)}`) : promise.dateSource === 'owner' ? t(`Follow-up · ${dateLabel(promise.dueDate, false)}`, `याद दिलाने की तारीख · ${dateLabel(promise.dueDate, true)}`) : t(`Promise date · ${dateLabel(promise.dueDate, app.profile.language === 'hi')}`, `वादे की तारीख़ · ${dateLabel(promise.dueDate, true)}`) : t('No date was recorded for this promise.', 'इस वादे की तारीख़ दर्ज नहीं है।')}</Text>
    </View> : null}
    <View style={styles.stack}>
      <Input label={t('Message · editable', 'संदेश · बदल सकते हैं')} placeholder={t('Write a polite reminder', 'विनम्र संदेश लिखें')} value={message} onChangeText={setMessage} multiline maxLength={1000} testID="customer-reminder-message" />
      {!eligible ? <Warning>{t('There is no confirmed amount due for this open promise, so a reminder cannot be prepared.', 'इस खुले वादे के लिए पुष्ट बाकी रकम नहीं है, इसलिए संदेश तैयार नहीं किया जा सकता।')}</Warning> : null}
      <View style={customerStyles.promiseCaveat}><Icon name="notes" size={18} color={colors.action} /><Text style={customerStyles.promiseCaveatText}>{t('Review the wording, then choose WhatsApp, Messages, or another app. DukaanFlow will not send anything automatically or mark the balance paid.', 'संदेश जाँचकर WhatsApp, Messages या कोई ऐप चुनें। DukaanFlow अपने-आप संदेश नहीं भेजेगा और बाकी रकम को भुगतान नहीं मानेगा।')}</Text></View>
    </View>
    {app.problem ? <Warning>{app.problem}</Warning> : null}
  </Screen>;
}

const customerStyles = StyleSheet.create({
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  shopContext: { color: colors.muted, fontSize: 12, maxWidth: 122 },
  balanceSummary: { minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: -9, marginBottom: 18 },
  balanceSummaryHeading: { gap: 3 },
  balanceSummaryMeta: { alignItems: 'flex-end', gap: 5, paddingLeft: 10 },
  summaryLabel: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.75 },
  detailSummaryLabel: { color: '#C6BFB4', fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.75 },
  summaryValue: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '600', letterSpacing: -0.8, marginTop: 2, fontVariant: ['tabular-nums'] },
  summaryMeta: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'right' },
  askLedgerSection: { marginBottom: 19, gap: 7 },
  askTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600', marginBottom: 2 },
  askHint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  askInputRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 13, paddingRight: 6, borderRadius: 12, borderWidth: 1, borderColor: '#CFCBC2', backgroundColor: colors.sheet },
  askInput: { flex: 1, minHeight: 42, paddingVertical: 9, color: colors.ink, fontSize: 14 },
  askButton: { minWidth: 52, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F0EEE8' },
  askButtonPressed: { backgroundColor: '#E4E1D9' },
  askButtonDisabled: { opacity: 0.55 },
  askButtonText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  queryAnswer: { padding: 13, gap: 8, borderRadius: 12, backgroundColor: '#F6F5F1', borderWidth: 1, borderColor: colors.line },
  queryAnswerTitle: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  queryAnswerTotal: { color: colors.action, fontSize: 24, lineHeight: 30, fontWeight: '600', fontVariant: ['tabular-nums'] },
  queryRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  queryRowCopy: { flex: 1, gap: 2 },
  queryRowTitle: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  queryRowAmount: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  queryCopy: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  queryFootnote: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  queryEvidence: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  queryEvidenceBlock: { gap: 2 },
  queryItems: { width: '100%', paddingLeft: 4, gap: 2 },
  queryItem: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  queryHistoryRow: { minHeight: 40, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.line },
  queryLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  queryLinkText: { color: colors.action, fontSize: 12, fontWeight: '600' },
  followUpSection: { marginBottom: 19 },
  followUpHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 5 },
  followUpTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  followUpCountText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  followUpRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  followUpCopy: { flex: 1, gap: 2 },
  followUpAction: { color: colors.action, fontSize: 12, fontWeight: '600' },
  followUpNote: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 5 },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.line, backgroundColor: '#EFEEE9', borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, gap: 8, marginBottom: 18 },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 9 },
  clear: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  customerListHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 3 },
  customerListTitle: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.25 },
  customerListCount: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  customerList: { marginTop: 2 },
  customerRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  customerRowPressed: { opacity: 0.62 },
  customerAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E6DE' },
  customerAvatarText: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  customerCopy: { flex: 1, gap: 4 },
  customerName: { color: colors.ink, fontSize: 15, lineHeight: 19, fontWeight: '600' },
  customerMeta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  customerBalance: { alignItems: 'flex-end', gap: 3 },
  customerAmount: { color: colors.ink, fontSize: 15, lineHeight: 19, fontWeight: '600', fontVariant: ['tabular-nums'] },
  emptyCard: { gap: 10, alignItems: 'flex-start', padding: 18, borderRadius: 16, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line, marginTop: 10 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E7DF', marginBottom: 2 },
  emptyTitle: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.25 },
  emptyDetail: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 2 },
  ledgerNote: { marginTop: 13, marginBottom: 12 },
  ledgerNoteText: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  detailBalance: { backgroundColor: colors.charcoal, borderRadius: 18, padding: 20, marginTop: -2, marginBottom: 17 },
  detailAmount: { color: colors.sheet, fontSize: 40, lineHeight: 47, fontWeight: '600', letterSpacing: -1.2, marginTop: 5, fontVariant: ['tabular-nums'] },
  detailCaption: { color: '#C6BFB4', fontSize: 12, marginTop: 5 },
  actionGrid: { gap: 9 },
  secondaryAction: { alignSelf: 'flex-start', marginLeft: -8, marginTop: 5 },
  timelineSection: { gap: 9, marginTop: 20 },
  promiseCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: '#E8D9C9', backgroundColor: '#FBF4EA' },
  promiseCopy: { flex: 1, gap: 3 },
  promiseTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  promiseActions: { alignItems: 'flex-end', gap: 6 },
  promiseShare: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#F0E7DF' },
  promiseShareText: { color: colors.action, fontSize: 11, fontWeight: '700' },
  promiseDone: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: '#E8EEE5' },
  promiseDoneText: { color: colors.green, fontSize: 12, fontWeight: '600' },
  promiseStatus: { color: colors.muted, fontSize: 11, textTransform: 'capitalize' },
  eventCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 13, backgroundColor: colors.sheet, borderWidth: 1, borderColor: colors.line },
  eventReversed: { opacity: 0.6 },
  eventGlyph: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F0EEE8', alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  eventAmount: { color: colors.action, fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  paymentAmount: { color: colors.green },
  sourceText: { color: colors.muted, fontSize: 11, lineHeight: 15, fontStyle: 'italic', marginTop: 2 },
  reverseButton: { position: 'absolute', right: 10, bottom: 7, padding: 5 },
  reverseText: { color: colors.red, fontSize: 10, fontWeight: '600' },
  transcriptCard: { padding: 14, borderRadius: 14, backgroundColor: '#EEECE6', gap: 7, marginBottom: 16 },
  transcriptText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  suggestionNote: { color: colors.action, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  reviewSummary: { padding: 14, borderRadius: 13, backgroundColor: '#F0EEE8', gap: 6, marginTop: 6 },
  reviewTitle: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  reviewAfter: { color: colors.green, fontSize: 12, fontWeight: '500' },
  validation: { color: colors.red, fontSize: 12, lineHeight: 17, marginTop: -7 },
  itemizedLine: { gap: 2, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  itemizedFields: { flexDirection: 'row', gap: 10 },
  itemizedField: { flex: 1 },
  promiseCaveat: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderRadius: 12, backgroundColor: '#F5EEE7', padding: 12, marginTop: 4 },
  promiseCaveatText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  reminderSummary: { backgroundColor: colors.charcoal, borderRadius: 16, padding: 17, marginTop: -2, gap: 3 },
  reminderAmount: { color: colors.sheet, fontSize: 32, lineHeight: 39, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
