import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './ui';
import { useApp } from './app-state';

const characterFallback = require('../assets/parcel-mascot.png');

function CharacterArtwork({ size }: { size: number }) {
  return <Image source={characterFallback} accessibilityElementsHidden resizeMode="contain" style={{ width: size, height: size }} />;
}

export type ReceivingMood = 'ready' | 'reading' | 'counting' | 'review' | 'issue' | 'confirmed';

const copy: Record<ReceivingMood, { title: [string, string]; detail: [string, string] }> = {
  ready: { title: ["Let's match today's delivery", 'आज की डिलीवरी का मिलान करें'], detail: ['Start with the supplier invoice.', 'सप्लायर के बिल से शुरू करें।'] },
  reading: { title: ['Pulling details from the bill', 'बिल से जानकारी पढ़ रहे हैं'], detail: ['Stock stays unchanged while it reads.', 'बिल पढ़ते समय स्टॉक नहीं बदलेगा।'] },
  counting: { title: ['Count what arrived', 'आए हुए माल की गिनती करें'], detail: ['Separate good, damaged, and missing items.', 'सही, खराब और कम आए सामान को अलग गिनें।'] },
  review: { title: ['Check the totals', 'कुल मात्रा जाँचें'], detail: ['Stock changes only after your confirmation.', 'आपकी पुष्टि के बाद ही स्टॉक बदलेगा।'] },
  issue: { title: ["Let's check that item", 'उस उत्पाद को फिर से जाँचें'], detail: ['This delivery has not changed stock.', 'इस डिलीवरी से स्टॉक नहीं बदला है।'] },
  confirmed: { title: ['Delivery saved', 'डिलीवरी सहेजी गई'], detail: ['Confirmed quantities are in your shop ledger.', 'पुष्ट मात्रा दुकान के लेजर में दर्ज है।'] },
};

/** A compact workflow companion: its state comes from the real receiving phase. */
export function ReceivingCompanion({ mood, inline = false, titleOverride, detailOverride, style }: { mood: ReceivingMood; inline?: boolean; titleOverride?: string; detailOverride?: string; style?: StyleProp<ViewStyle> }) {
  const { t, profile } = useApp();
  const state = copy[mood];
  const languageIndex = profile.language === 'hi' ? 1 : 0;
  const title = titleOverride ?? state.title[languageIndex];
  const detail = detailOverride ?? state.detail[languageIndex];

  return (
    <View
      accessible
      accessibilityLabel={`Delivery guide. ${title}. ${detail}`}
      testID="receiving-companion"
      style={[styles.card, inline && styles.inlineCard, style]}
    >
      <View style={[styles.artWrap, inline && styles.inlineArtWrap]}>
          <CharacterArtwork size={inline ? 44 : 72} />
      </View>
      <View style={styles.copy}>
        {!inline ? <Text style={[styles.kicker, mood === 'confirmed' && styles.kickerSuccess]}>{mood === 'ready' || mood === 'reading'
          ? t('DELIVERY GUIDE', 'डिलीवरी गाइड')
          : mood === 'issue' ? t('CHECK', 'जाँचें')
            : mood === 'confirmed' ? t('LEDGER UPDATED', 'लेजर अपडेट हुआ')
              : t(`STEP ${mood === 'counting' ? '2' : '3'}`, `चरण ${mood === 'counting' ? '2' : '3'}`)}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 112, borderRadius: 18, backgroundColor: colors.sheet, padding: 10, marginBottom: 12 },
  inlineCard: { minHeight: 44, padding: 0, gap: 8, borderWidth: 0, backgroundColor: 'transparent', marginBottom: 0 },
  artWrap: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  inlineArtWrap: { width: 44, height: 44 },
  copy: { flex: 1, gap: 3 },
  kicker: { color: colors.action, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.8 },
  kickerSuccess: { color: colors.green },
  title: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  detail: { color: colors.muted, fontSize: 11, lineHeight: 15 },
});
