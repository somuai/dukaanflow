import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../../src/app-state';
import { colors } from '../../src/ui';

const glyphs: Record<string, string> = {
  deliveries: '⌂', customers: '◉', suppliers: '▣', products: '◇', shop: '▤',
};

export default function WebTabLayout() {
  const { t } = useApp();
  return <Tabs
    screenListeners={({ route }) => ({
      ...(route.name === 'deliveries' ? { tabPress: () => router.dismissTo('/(tabs)/deliveries') } : {}),
    })}
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.action,
      tabBarInactiveTintColor: colors.ink,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 21, lineHeight: 24 }}>{glyphs[route.name]}</Text>,
      tabBarStyle: {
        position: 'absolute', bottom: 12, left: 16, right: 16,
        height: 66, paddingTop: 7, paddingBottom: 5,
        borderRadius: 34, borderTopWidth: 0,
        backgroundColor: 'rgba(255,254,250,0.97)',
        boxShadow: '0 8px 28px rgba(31,29,26,0.12)',
      },
    })}
  >
    <Tabs.Screen name="deliveries" options={{ title: t('Home', 'होम') }} />
    <Tabs.Screen name="customers" options={{ title: t('Customers', 'ग्राहक') }} />
    <Tabs.Screen name="suppliers" options={{ title: t('Suppliers', 'सप्लायर') }} />
    <Tabs.Screen name="products" options={{ title: t('Products', 'उत्पाद') }} />
    <Tabs.Screen name="shop" options={{ title: t('Shop', 'दुकान') }} />
  </Tabs>;
}
