import { Stack } from 'expo-router';
import { colors } from '../../../src/ui';

export default function ProductsStack() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }} />;
}
