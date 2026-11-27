import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useApp } from './app-state';
import { Brand, colors, useReducedMotion } from './ui';

/** Brief branded state while the local shop profile and ledger are opened. */
export function LaunchScreen() {
  const { t } = useApp();
  const reducedMotion = useReducedMotion();
  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel={t('Opening DukaanFlow', 'DukaanFlow खुल रहा है')}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Brand dark spinMark />
        <Text style={styles.title}>{t('Opening your shop', 'आपकी दुकान खुल रही है')}</Text>
        {reducedMotion
          ? <View accessibilityLabel={t('Loading shop records', 'दुकान के रिकॉर्ड लोड हो रहे हैं')} style={styles.loadingDot} />
          : <ActivityIndicator accessibilityLabel={t('Loading shop records', 'दुकान के रिकॉर्ड लोड हो रहे हैं')} color={colors.orange} size="small" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.charcoal, paddingHorizontal: 26, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 22 },
  title: { color: '#BEB9B0', fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: 0.1, textAlign: 'center' },
  loadingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orange },
});
