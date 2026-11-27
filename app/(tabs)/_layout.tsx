import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { router } from 'expo-router';
import { useApp } from '../../src/app-state';
import { colors } from '../../src/ui';

export default function TabLayout() {
  const { t } = useApp();
  return (
    <NativeTabs
      tintColor={colors.action}
      screenListeners={({ route }) => ({
        ...(route.name === 'deliveries' ? {
          tabPress: () => router.dismissTo('/(tabs)/deliveries'),
        } : {}),
      })}
      backgroundColor="rgba(255,254,250,0.18)"
      blurEffect="systemMaterialLight"
      shadowColor={colors.line}
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      labelStyle={{ default: { fontSize: 10, fontWeight: 'medium', color: colors.muted }, selected: { fontSize: 10, fontWeight: 'semibold', color: colors.action } }}
    >
      <NativeTabs.Trigger name="deliveries">
        <NativeTabs.Trigger.Label>{t('Home', 'होम')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="customers">
        <NativeTabs.Trigger.Label>{t('Customers', 'ग्राहक')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="suppliers">
        <NativeTabs.Trigger.Label>{t('Suppliers', 'सप्लायर')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="products">
        <NativeTabs.Trigger.Label>{t('Products', 'उत्पाद')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tag', selected: 'tag.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="shop">
        <NativeTabs.Trigger.Label>{t('Shop', 'दुकान')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'storefront', selected: 'storefront.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
