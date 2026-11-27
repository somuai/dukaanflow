import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useApp } from '../src/app-state';
import { FlowSetup, OpeningStock, Product, Setup } from '../src/screens';
import { Screen, Title, colors } from '../src/ui';

export default function AppScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const app = useApp();

  if (!app.ready) {
    return <Screen><ActivityIndicator color={colors.action} style={{ flex: 1 }} /></Screen>;
  }
  if (page === 'setup') return <Setup />;
  if (page === 'flow-onboarding') return <FlowSetup onboarding />;
  if (page === 'opening-stock' && app.mode) return <OpeningStock />;
  if (page === 'opening-stock-item' && app.mode) return <Product openingStock />;
  if (page === 'opening-stock-scan' && app.mode) return <Product openingStock autoScan />;
  return <Screen><Title title={app.t('Shop unavailable', 'दुकान उपलब्ध नहीं है')} /></Screen>;
}
